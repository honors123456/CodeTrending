import { spawnSync } from "node:child_process";

/**
 * 爬取 github.com/trending HTML。
 * trending 页是服务端渲染的 HTML。
 * 优先用 Node fetch（CI 环境直通公网）；若 HTTPS_PROXY 已设（本地有代理），
 * 退到底层 curl 绕过 Node 的 fetch 代理盲区。两种路径都能跑。
 */
export async function scrapeMarkdown(url: string): Promise<string> {
  // 有代理走 curl（Windows 本地常用），否则走 Node fetch（CI）
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    const argv = ["-sL", url, "-H", "User-Agent: Mozilla/5.0"];
    if (process.env.HTTPS_PROXY) argv.unshift("-x", process.env.HTTPS_PROXY);
    const r = spawnSync("curl", argv, { timeout: 30_000, encoding: "utf-8" });
    if (r.error) throw new Error(`curl 失败: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`curl 非零退出 (${r.status}): ${(r.stderr || "").slice(0, 200)}`);
    return r.stdout;
  }

  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
  });
  if (!res.ok) {
    throw new Error(`抓取失败 ${url}: HTTP ${res.status}`);
  }
  return res.text();
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
 * 从 trending 页 HTML 提取 owner/repo 列表（按出现顺序去重，最多 max 个）。
 * 解析 HTML 中所有 `/owner/repo` 两段路径链接，过滤非仓库路径。
 * 不依赖 DOM 解析库，纯正则——快速且可靠。
 */
export function parseTrendingRepos(html: string, max = 25): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /href="\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)"/g;
  for (const m of html.matchAll(re)) {
    const full = m[1];
    const slash = full.indexOf("/");
    if (slash < 1) continue;
    const owner = full.slice(0, slash);
    const name = full.slice(slash + 1);
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
