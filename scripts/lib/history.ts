/**
 * 快照历史读取与时间序列构建，compute.ts 与刷量检测共用。
 */
import fs from "node:fs";
import path from "node:path";
import type { HistoryFile, RepoSnapshot } from "./types.js";
import type { SeriesPoint } from "./metrics.js";
import { DATA_DIR, HISTORY_DIR, readJson } from "./util.js";

export interface RepoHistory {
  /** 最新一次快照（含全部字段） */
  latest: RepoSnapshot;
  latestDate: string;
  /** 每日 star 序列（每天取当日最后一次运行，含 bootstrap 回填），按日期升序 */
  points: SeriesPoint[];
  /** 每日贡献者数序列 */
  contribPoints: { date: string; count: number }[];
}

/** repo(小写) → 回填的 star 序列 */
export type Backfill = Record<string, SeriesPoint[]>;

export const BACKFILL_FILE = path.join(DATA_DIR, "backfill.json");

/** 读取最近 maxDays 个历史文件（按文件名日期升序） */
export function loadHistoryFiles(maxDays = 35): HistoryFile[] {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(-maxDays);
  return files.map((f) => readJson<HistoryFile>(path.join(HISTORY_DIR, f), { date: f.slice(0, 10), runs: [] }));
}

/** 从历史文件 + 回填数据构建各仓库时间序列 */
export function buildRepoHistories(files: HistoryFile[], backfill: Backfill = {}): Map<string, RepoHistory> {
  const map = new Map<string, RepoHistory>();

  for (const file of files) {
    // 同日多次运行按顺序覆盖，最终留当日最后一次
    const dayLatest = new Map<string, RepoSnapshot>();
    for (const run of file.runs) {
      for (const snap of run.snapshots) dayLatest.set(snap.repo.toLowerCase(), snap);
    }
    for (const [key, snap] of dayLatest) {
      let h = map.get(key);
      if (!h) {
        h = { latest: snap, latestDate: file.date, points: [], contribPoints: [] };
        map.set(key, h);
      }
      h.latest = snap;
      h.latestDate = file.date;
      h.points.push({ date: file.date, stars: snap.stars });
      if (snap.contributors) h.contribPoints.push({ date: file.date, count: snap.contributors.count });
    }
  }

  // 合入回填点（只补历史里没有的日期）
  for (const [key, pts] of Object.entries(backfill)) {
    const h = map.get(key.toLowerCase());
    if (!h) continue;
    const have = new Set(h.points.map((p) => p.date));
    for (const p of pts) {
      if (!have.has(p.date)) h.points.push(p);
    }
    h.points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return map;
}

export function loadBackfill(): Backfill {
  return readJson<Backfill>(BACKFILL_FILE, {});
}
