import { fetchRetry, requireEnv } from "./util.js";

const API = "https://api.firecrawl.dev/v1/scrape";

/** Firecrawl 抓取单页，返回 markdown */
export async function scrapeMarkdown(url: string): Promise<string> {
  const res = await fetchRetry(
    API,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireEnv("FIRECRAWL_API_KEY")}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    },
    3,
  );
  if (!res.ok) {
    throw new Error(`Firecrawl 抓取失败 ${url}: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { success: boolean; data?: { markdown?: string }; error?: string };
  if (!json.success || !json.data?.markdown) {
    throw new Error(`Firecrawl 返回异常 ${url}: ${json.error ?? "无 markdown"}`);
  }
  return json.data.markdown;
}

/** github.com 上不是仓库 owner 的一级路径 */
const NON_REPO_OWNERS = new Set([
  "login", "signup", "join", "features", "topics", "collections", "trending",
  "sponsors", "about", "pricing", "apps", "marketplace", "contact", "security",
  "site", "customer-stories", "readme", "resources", "solutions", "enterprise",
  "team", "premium-support", "open-source", "git-guides", "mobile", "settings",
  "notifications", "explore", "events", "codespaces", "search", "orgs", "users",
  "stars", "issues", "pulls", "new", "organizations",
]);

/**
 * 从 trending 页 markdown 提取 owner/repo 列表（按出现顺序去重，最多 max 个）。
 * trending 页每个条目标题是指向仓库的链接；解析所有 github.com 两段路径链接再过滤。
 */
export function parseTrendingRepos(markdown: string, max = 25): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?=[)\s"'\\#?]|$)/g;
  for (const m of markdown.matchAll(re)) {
    const owner = m[1];
    const name = m[2];
    if (NON_REPO_OWNERS.has(owner.toLowerCase())) continue;
    if (name.toLowerCase() === "sponsors") continue;
    const repo = `${owner}/${name}`;
    if (seen.has(repo.toLowerCase())) continue;
    seen.add(repo.toLowerCase());
    out.push(repo);
    if (out.length >= max) break;
  }
  return out;
}
