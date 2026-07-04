/**
 * 采集阶段：对候选池全部仓库拉取精确指标（GraphQL 批量 + REST 补充），
 * 追加写入当日快照文件 data/history/YYYY-MM-DD.json。
 * 已被删除/404 的仓库从候选池移除。
 */
import path from "node:path";
import type { HistoryFile, Pool, RepoSnapshot } from "./lib/types.js";
import {
  fetchContributors,
  fetchParticipation,
  fetchReposBasic,
  rateLimitRemaining,
} from "./lib/github.js";
import {
  DATA_DIR,
  HISTORY_DIR,
  dateCN,
  loadEnv,
  mapLimit,
  nowISO,
  readJson,
  writeJson,
} from "./lib/util.js";

const POOL_FILE = path.join(DATA_DIR, "pool.json");

export async function enrich(pool: Pool): Promise<RepoSnapshot[]> {
  const repos = pool.entries.map((e) => e.repo);
  console.log(`[enrich] 拉取 ${repos.length} 个仓库基础指标（GraphQL）`);
  const basic = await fetchReposBasic(repos);

  // 404/无权限的仓库出池
  const gone = pool.entries.filter((e) => basic.get(e.repo.toLowerCase()) === null);
  if (gone.length > 0) {
    console.log(`[enrich] ${gone.length} 个仓库已不存在，移出候选池: ${gone.map((e) => e.repo).join(", ")}`);
    pool.entries = pool.entries.filter((e) => basic.get(e.repo.toLowerCase()) !== null);
    writeJson(POOL_FILE, { ...pool, updatedAt: nowISO() });
  }

  const found = pool.entries
    .map((e) => basic.get(e.repo.toLowerCase()))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  console.log(`[enrich] 拉取 contributors / participation（REST，并发 8）`);
  const snapshots = await mapLimit(found, 8, async (b): Promise<RepoSnapshot> => {
    const [contributors, weeklyCommits] = await Promise.all([
      fetchContributors(b.repo),
      fetchParticipation(b.repo),
    ]);
    return { ...b, contributors, weeklyCommits };
  });

  const remaining = await rateLimitRemaining();
  console.log(`[enrich] 完成 ${snapshots.length} 个快照，REST 配额余量: ${remaining ?? "未知"}`);
  return snapshots;
}

/** 写入当日历史文件：当日内新运行覆盖前次（序列计算只用末次，见 history.ts），紧凑格式控制体量 */
export function appendSnapshots(snapshots: RepoSnapshot[], t: string = nowISO()): string {
  const date = dateCN();
  const file = path.join(HISTORY_DIR, `${date}.json`);
  const history: HistoryFile = { date, runs: [{ t, snapshots }] };
  writeJson(file, history, true);
  console.log(`[enrich] 快照写入 ${file}（覆盖当日，单 run 紧凑格式）`);
  return file;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  loadEnv();
  const pool = readJson<Pool>(POOL_FILE, { updatedAt: "", entries: [] });
  if (pool.entries.length === 0) {
    console.error("候选池为空，先跑 npm run discover");
    process.exit(1);
  }
  enrich(pool)
    .then((snaps) => appendSnapshots(snaps))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
