import { fetchRetry, mapLimit, requireEnv, sleep } from "./util.js";
import type { RepoSnapshot } from "./types.js";

const GQL_API = "https://api.github.com/graphql";
const REST_API = "https://api.github.com";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
    "user-agent": "CodeTrending-collector",
    ...extra,
  };
}

/** GraphQL 请求 */
async function graphql<T>(query: string): Promise<T> {
  const res = await fetchRetry(GQL_API, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { type?: string; message: string }[] };
  // NOT_FOUND 等单仓库错误不致命：data 中对应别名为 null
  if (!json.data) {
    throw new Error(`GraphQL 无数据: ${JSON.stringify(json.errors)?.slice(0, 500)}`);
  }
  return json.data;
}

interface GqlRepo {
  nameWithOwner: string;
  stargazerCount: number;
  forkCount: number;
  createdAt: string;
  pushedAt: string;
  description: string | null;
  primaryLanguage: { name: string } | null;
  issuesOpen: { totalCount: number };
  issuesClosed: { totalCount: number };
  latestRelease: { publishedAt: string | null } | null;
}

const REPO_FIELDS = `
  nameWithOwner stargazerCount forkCount createdAt pushedAt description
  primaryLanguage { name }
  issuesOpen: issues(states: OPEN) { totalCount }
  issuesClosed: issues(states: CLOSED) { totalCount }
  latestRelease { publishedAt }
`;

export type BasicSnapshot = Omit<RepoSnapshot, "contributors" | "weeklyCommits">;

/**
 * 批量拉取仓库基础指标（别名批量，每批 ≤50）。
 * 返回 map：请求的 owner/repo（小写）→ 快照；不存在/无权限的为 null。
 * 仓库改名时 GraphQL 会跟随跳转，快照内 repo 字段为新名字。
 */
export async function fetchReposBasic(repos: string[]): Promise<Map<string, BasicSnapshot | null>> {
  const out = new Map<string, BasicSnapshot | null>();
  for (let i = 0; i < repos.length; i += 50) {
    const batch = repos.slice(i, i + 50);
    const parts = batch.map((repo, idx) => {
      const [owner, name] = repo.split("/");
      return `r${idx}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`;
    });
    const data = await graphql<Record<string, GqlRepo | null>>(`query { ${parts.join("\n")} }`);
    batch.forEach((requested, idx) => {
      const r = data[`r${idx}`];
      out.set(
        requested.toLowerCase(),
        r
          ? {
              repo: r.nameWithOwner,
              stars: r.stargazerCount,
              forks: r.forkCount,
              openIssues: r.issuesOpen.totalCount,
              closedIssues: r.issuesClosed.totalCount,
              createdAt: r.createdAt,
              pushedAt: r.pushedAt,
              primaryLanguage: r.primaryLanguage?.name ?? null,
              description: r.description,
              latestReleaseAt: r.latestRelease?.publishedAt ?? null,
            }
          : null,
      );
    });
    await sleep(200);
  }
  return out;
}

async function rest(path: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetchRetry(`${REST_API}${path}`, { headers: headers(extraHeaders) });
}

/** 从 Link 头解析最后一页页码 */
function lastPage(res: Response): number | null {
  const link = res.headers.get("link");
  const m = link?.match(/[?&]page=(\d+)>; rel="last"/);
  return m ? Number(m[1]) : null;
}

/** contributors 前 100 名：总数（>100 时用 per_page=1 的 Link 头拿精确值）+ top1 占比 */
export async function fetchContributors(
  repo: string,
): Promise<{ count: number; top1Share: number } | undefined> {
  const res = await rest(`/repos/${repo}/contributors?per_page=100`);
  if (!res.ok) return undefined; // 空仓库返回 204，禁用仓库 403 等
  if (res.status === 204) return undefined;
  const list = (await res.json()) as { contributions: number }[];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const total = list.reduce((s, c) => s + c.contributions, 0);
  const top1Share = total > 0 ? list[0].contributions / total : 0;
  let count = list.length;
  if (list.length === 100) {
    const res1 = await rest(`/repos/${repo}/contributors?per_page=1`);
    const lp = res1.ok ? lastPage(res1) : null;
    if (lp) count = lp;
  }
  return { count, top1Share: Math.round(top1Share * 1000) / 1000 };
}

/** 52 周 commit 数；GitHub 后台计算中(202)返回 undefined，下次运行自然补上 */
export async function fetchParticipation(repo: string): Promise<number[] | undefined> {
  const res = await rest(`/repos/${repo}/stats/participation`);
  if (res.status !== 200) return undefined;
  const json = (await res.json()) as { all?: number[] };
  return json.all;
}

export interface Stargazer {
  starredAt: string;
  login: string;
}

/** 最近 n 页 stargazers（每页 100，从最后一页倒着取），带 starred_at 时间戳 */
export async function fetchRecentStargazers(repo: string, pages = 1): Promise<Stargazer[]> {
  const accept = { accept: "application/vnd.github.star+json" };
  const first = await rest(`/repos/${repo}/stargazers?per_page=100`, accept);
  if (!first.ok) return [];
  const lp = lastPage(first) ?? 1;
  const out: Stargazer[] = [];
  const targets = [];
  for (let p = lp; p > Math.max(0, lp - pages); p--) targets.push(p);
  for (const p of targets) {
    const res =
      p === 1 && lp === 1
        ? first
        : await rest(`/repos/${repo}/stargazers?per_page=100&page=${p}`, accept);
    if (!res.ok) continue;
    const list = (await res.json()) as { starred_at: string; user: { login: string } }[];
    for (const s of list) {
      if (s?.starred_at && s.user?.login) out.push({ starredAt: s.starred_at, login: s.user.login });
    }
  }
  return out;
}

/** 抽样查询账号信息（刷量确认用） */
export async function fetchUsers(
  logins: string[],
): Promise<{ login: string; createdAt: string; followers: number }[]> {
  const results = await mapLimit(logins, 5, async (login) => {
    const res = await rest(`/users/${encodeURIComponent(login)}`);
    if (!res.ok) return null;
    const u = (await res.json()) as { created_at: string; followers: number };
    return { login, createdAt: u.created_at, followers: u.followers };
  });
  return results.filter((u): u is NonNullable<typeof u> => u !== null);
}

/** 当前 REST 配额余量（日志用） */
export async function rateLimitRemaining(): Promise<number | null> {
  const res = await rest(`/rate_limit`);
  if (!res.ok) return null;
  const json = (await res.json()) as { resources?: { core?: { remaining?: number } } };
  return json.resources?.core?.remaining ?? null;
}
