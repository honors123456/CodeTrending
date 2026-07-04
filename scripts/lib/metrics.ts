/**
 * 指标计算纯函数库。口径定义见 CLAUDE.md「指标定义」表，改口径先改表再改这里。
 * 全部函数无 IO、无副作用，便于单测。
 */
import type { AgeBucket, RepoSnapshot } from "./types.js";

/** star 时间序列点（快照或 bootstrap 回填） */
export interface SeriesPoint {
  /** YYYY-MM-DD（UTC+8） */
  date: string;
  stars: number;
}

const DAY_MS = 86400_000;

export function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / DAY_MS;
}

/**
 * star 增速（stars/day）。取距今约 windowDays 天的参考点与最新点求斜率。
 * 参考点优先取 ≤ 目标日期的最近点（窗口只多不少），没有则取序列最早点。
 * 序列不足 2 个点或窗口 <1 天返回 null。
 */
export function starVelocity(
  points: SeriesPoint[],
  windowDays = 7,
): { velocity: number; windowDays: number } | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const targetTime = Date.parse(last.date) - windowDays * DAY_MS;
  let ref: SeriesPoint | null = null;
  for (const p of points) {
    if (p === last) break;
    if (Date.parse(p.date) <= targetTime) ref = p; // 不断更新为 ≤ 目标的最近点
  }
  if (!ref) ref = points[0];
  const span = daysBetween(ref.date, last.date);
  if (span < 1) return null;
  return {
    velocity: (last.stars - ref.stars) / span,
    windowDays: Math.round(span),
  };
}

/** 在序列中找距目标日期最近的点，误差超过 tolerance 天返回 null */
function nearestPoint(points: SeriesPoint[], targetTime: number, tolerance: number): SeriesPoint | null {
  let best: SeriesPoint | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(Date.parse(p.date) - targetTime) / DAY_MS;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return bestDist <= tolerance ? best : null;
}

/**
 * star 加速度：近 3 天增速 − 前 3 天增速（stars/day²，正值表示在提速）。
 * 需要距今 ~3 天与 ~6 天各有一个点（容差 ±1.5 天），否则返回 null（数据积累中）。
 */
export function acceleration(points: SeriesPoint[]): number | null {
  if (points.length < 3) return null;
  const last = points[points.length - 1];
  const t = Date.parse(last.date);
  const p3 = nearestPoint(points.slice(0, -1), t - 3 * DAY_MS, 1.5);
  if (!p3) return null;
  const p6 = nearestPoint(
    points.filter((p) => Date.parse(p.date) < Date.parse(p3.date)),
    t - 6 * DAY_MS,
    1.5,
  );
  if (!p6) return null;
  const span1 = daysBetween(p3.date, last.date);
  const span0 = daysBetween(p6.date, p3.date);
  if (span1 < 1 || span0 < 1) return null;
  const v1 = (last.stars - p3.stars) / span1;
  const v0 = (p3.stars - p6.stars) / span0;
  return v1 - v0;
}

export interface DailyDelta {
  date: string;
  /** 归一化到每天的 star 增量（跨多天的间隔摊平） */
  perDay: number;
}

/** 相邻点之间的日均 star 增量序列 */
export function dailyDeltas(points: SeriesPoint[]): DailyDelta[] {
  const out: DailyDelta[] = [];
  for (let i = 1; i < points.length; i++) {
    const span = daysBetween(points[i - 1].date, points[i].date);
    if (span <= 0) continue;
    out.push({ date: points[i].date, perDay: (points[i].stars - points[i - 1].stars) / span });
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function std(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * 最新一日增量对此前（最多 14 个）增量的 z-score，用于刷量尖峰检测。
 * 此前样本 <5 个返回 null；标准差下限钳到 1，避免平稳序列小波动误报。
 */
export function zScoreLatest(deltas: DailyDelta[]): number | null {
  if (deltas.length < 6) return null;
  const latest = deltas[deltas.length - 1].perDay;
  const prior = deltas.slice(-15, -1).map((d) => d.perDay);
  if (prior.length < 5) return null;
  return (latest - mean(prior)) / Math.max(std(prior), 1);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 热点/持续分类（口径见 CLAUDE.md）：
 * - oneOffSpike：近 10 日内某日增量 ≥ max(50, 5×其余日中位数)，且其后 3 日均值回落 >70%
 * - steadyGrowth：最近 7 个增量全为正且变异系数 <0.8
 */
export function classifyTrend(deltas: DailyDelta[]): { oneOffSpike: boolean; steadyGrowth: boolean } {
  let oneOffSpike = false;
  const recent = deltas.slice(-10);
  for (let i = 0; i < recent.length - 3; i++) {
    const spike = recent[i].perDay;
    const others = recent.filter((_, j) => j !== i).map((d) => d.perDay);
    if (spike < Math.max(50, 5 * median(others))) continue;
    const after = recent.slice(i + 1, i + 4).map((d) => d.perDay);
    if (mean(after) < 0.3 * spike) {
      oneOffSpike = true;
      break;
    }
  }

  const last7 = deltas.slice(-7);
  let steadyGrowth = false;
  if (last7.length === 7 && last7.every((d) => d.perDay > 0)) {
    const xs = last7.map((d) => d.perDay);
    steadyGrowth = std(xs) / mean(xs) < 0.8;
  }

  return { oneOffSpike, steadyGrowth };
}

export function ageBucketOf(createdAt: string, now: number = Date.now()): { ageDays: number; bucket: AgeBucket } {
  const ageDays = Math.floor((now - Date.parse(createdAt)) / DAY_MS);
  const bucket: AgeBucket = ageDays < 365 ? "lt1y" : ageDays < 365 * 3 ? "y1to3" : "gt3y";
  return { ageDays, bucket };
}

/**
 * 维护活跃度 0-100 合成分：
 * commit 近因(0-40) + 提交频率(0-30) + issue 健康(0-15) + release 节奏(0-15)
 */
export function maintenanceScore(
  snap: Pick<RepoSnapshot, "pushedAt" | "latestReleaseAt" | "openIssues" | "closedIssues" | "weeklyCommits">,
  now: number = Date.now(),
): number | null {
  const daysSincePush = (now - Date.parse(snap.pushedAt)) / DAY_MS;
  const pushScore = daysSincePush <= 2 ? 40 : daysSincePush <= 7 ? 30 : daysSincePush <= 14 ? 20 : daysSincePush <= 30 ? 10 : 0;

  let commitScore = 0;
  if (snap.weeklyCommits && snap.weeklyCommits.length > 0) {
    const recent12 = snap.weeklyCommits.slice(-12);
    const avg = mean(recent12);
    commitScore = avg >= 10 ? 30 : avg >= 3 ? 20 : avg >= 1 ? 10 : avg > 0 ? 5 : 0;
  }

  const totalIssues = snap.openIssues + snap.closedIssues;
  let issueScore = 7; // 无 issue 时给中性分
  if (totalIssues > 0) {
    const openRatio = snap.openIssues / totalIssues;
    issueScore = openRatio < 0.3 ? 15 : openRatio < 0.5 ? 10 : openRatio < 0.7 ? 5 : 0;
  }

  let releaseScore = 0;
  if (snap.latestReleaseAt) {
    const days = (now - Date.parse(snap.latestReleaseAt)) / DAY_MS;
    releaseScore = days <= 30 ? 15 : days <= 90 ? 10 : days <= 365 ? 5 : 0;
  }

  return pushScore + commitScore + issueScore + releaseScore;
}

/** v 在 values 中的百分位（0-100，值越大百分位越高） */
export function percentileRank(values: number[], v: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((x) => x <= v).length;
  return Math.round((below / values.length) * 100);
}
