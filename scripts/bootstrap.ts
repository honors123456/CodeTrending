/**
 * 一次性冷启动回填：对候选池中 star <5000 的仓库，用带时间戳的 stargazers API
 * 反推近 14 天每日 star 总数，写入 data/backfill.json（compute 时合入序列）。
 * 只在项目上线初期跑一次；正常运行 7 天后历史足够，无需再跑。
 * 前置条件：已至少跑过一次 npm run collect（需要当前 star 数与候选池）。
 */
import path from "node:path";
import type { Pool } from "./lib/types.js";
import type { SeriesPoint } from "./lib/metrics.js";
import { fetchRecentStargazers, rateLimitRemaining } from "./lib/github.js";
import { BACKFILL_FILE, buildRepoHistories, loadHistoryFiles, type Backfill } from "./lib/history.js";
import { DATA_DIR, dateCN, loadEnv, mapLimit, readJson, writeJson } from "./lib/util.js";

const MAX_STARS = 5000;
const PAGES = 5; // 最多回看 500 个 stargazer
const BACK_DAYS = 14;
const DAY_MS = 86400_000;

async function main(): Promise<void> {
  loadEnv();
  const pool = readJson<Pool>(path.join(DATA_DIR, "pool.json"), { updatedAt: "", entries: [] });
  const histories = buildRepoHistories(loadHistoryFiles());
  if (histories.size === 0) {
    console.error("没有快照历史，先跑 npm run collect");
    process.exit(1);
  }

  const targets = pool.entries
    .map((e) => histories.get(e.repo.toLowerCase()))
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .filter((h) => h.latest.stars > 0 && h.latest.stars < MAX_STARS);

  const remaining = await rateLimitRemaining();
  console.log(`[bootstrap] 目标 ${targets.length} 个仓库（<${MAX_STARS} star），REST 配额余量 ${remaining ?? "未知"}`);
  if (remaining !== null && remaining < targets.length * (PAGES + 1)) {
    console.error(`[bootstrap] 配额不足（预计需 ~${targets.length * (PAGES + 1)} 次），等配额恢复后再跑`);
    process.exit(1);
  }

  const backfill = readJson<Backfill>(BACKFILL_FILE, {});
  const now = Date.now();
  let done = 0;

  await mapLimit(targets, 5, async (h) => {
    const repo = h.latest.repo;
    const currentStars = h.latest.stars;
    try {
      const gazers = await fetchRecentStargazers(repo, PAGES);
      if (gazers.length === 0) return;
      const times = gazers.map((g) => Date.parse(g.starredAt)).sort((a, b) => a - b);
      const oldest = times[0];
      // 抓满 PAGES*100 条说明更早还有没抓到的 stargazer，早于窗口起点的日期无法反推
      const fetchedAll = gazers.length < PAGES * 100;
      const points: SeriesPoint[] = [];
      for (let i = BACK_DAYS; i >= 1; i--) {
        const day = dateCN(new Date(now - i * DAY_MS));
        // 北京时间当日结束 = UTC 16:00
        const endMs = Date.parse(`${day}T16:00:00Z`);
        if (endMs > now) continue;
        // 抓到的窗口必须覆盖到该日（或已抓全），否则无法确定该日之后新增了多少 star
        if (oldest > endMs && !fetchedAll) continue;
        const after = times.filter((t) => t > endMs).length;
        points.push({ date: day, stars: currentStars - after });
      }
      if (points.length > 0) backfill[repo.toLowerCase()] = points;
    } catch (e) {
      console.error(`[bootstrap] ${repo} 失败: ${(e as Error).message}`);
    }
    done++;
    if (done % 50 === 0) console.log(`[bootstrap] 进度 ${done}/${targets.length}`);
  });

  writeJson(BACKFILL_FILE, backfill);
  console.log(`[bootstrap] 完成，回填 ${Object.keys(backfill).length} 个仓库 → ${BACKFILL_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
