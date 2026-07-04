/**
 * 发现阶段：Firecrawl 抓 12 语言 trending（daily + weekly），
 * 解析 repo 列表合入候选池 data/pool.json；30 天未再上榜的条目淘汰出池。
 */
import path from "node:path";
import { LANGUAGES, type Pool, type PoolEntry } from "./lib/types.js";
import { parseTrendingRepos, scrapeMarkdown } from "./lib/firecrawl.js";
import { DATA_DIR, dateCN, loadEnv, mapLimit, nowISO, readJson, writeJson } from "./lib/util.js";

const POOL_FILE = path.join(DATA_DIR, "pool.json");
const EVICT_DAYS = 30;

export async function discover(): Promise<Pool> {
  const pool = readJson<Pool>(POOL_FILE, { updatedAt: "", entries: [] });
  const byRepo = new Map<string, PoolEntry>(pool.entries.map((e) => [e.repo.toLowerCase(), e]));
  const today = dateCN();

  const pages = LANGUAGES.flatMap((lang) =>
    (["daily", "weekly"] as const).map((since) => ({ lang, since })),
  );

  let found = 0;
  await mapLimit(pages, 3, async ({ lang, since }) => {
    const url = `https://github.com/trending/${lang.trendingSlug}?since=${since}`;
    let repos: string[];
    try {
      repos = parseTrendingRepos(await scrapeMarkdown(url));
    } catch (e) {
      // 单页失败不中断整轮采集（trending 页偶发 429/超时）
      console.error(`[discover] ${lang.id}/${since} 失败: ${(e as Error).message}`);
      return;
    }
    console.log(`[discover] ${lang.id}/${since}: ${repos.length} 个仓库`);
    for (const repo of repos) {
      found++;
      const key = repo.toLowerCase();
      const existing = byRepo.get(key);
      if (existing) {
        existing.lastSeenOnTrending = today;
      } else {
        byRepo.set(key, { repo, language: lang.id, firstSeen: today, lastSeenOnTrending: today });
      }
    }
  });

  if (found === 0) {
    throw new Error("[discover] 所有 trending 页均未解析出仓库，疑似 Firecrawl 异常或页面结构变化，中止本轮");
  }

  const cutoff = dateCN(new Date(Date.now() - EVICT_DAYS * 86400_000));
  const entries = [...byRepo.values()].filter((e) => e.lastSeenOnTrending >= cutoff);
  const evicted = byRepo.size - entries.length;

  const next: Pool = { updatedAt: nowISO(), entries };
  writeJson(POOL_FILE, next);
  console.log(`[discover] 候选池 ${entries.length} 个仓库（本轮淘汰 ${evicted}）`);
  return next;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  loadEnv();
  discover().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
