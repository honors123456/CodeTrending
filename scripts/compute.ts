/**
 * 计算阶段：读快照历史（纯本地，无 API 调用），产出前端榜单 JSON 到 site/public/data/。
 */
import path from "node:path";
import {
  LANGUAGES,
  type FlagsFile,
  type LanguageBoard,
  type Pool,
  type RepoMetrics,
  type Summary,
  type SummaryLang,
} from "./lib/types.js";
import {
  acceleration,
  ageBucketOf,
  classifyTrend,
  dailyDeltas,
  maintenanceScore,
  percentileRank,
  starVelocity,
} from "./lib/metrics.js";
import { buildRepoHistories, loadBackfill, loadHistoryFiles, type RepoHistory } from "./lib/history.js";
import { DATA_DIR, SITE_DATA_DIR, dateCN, nowISO, readJson, writeJson } from "./lib/util.js";

const POOL_FILE = path.join(DATA_DIR, "pool.json");
const FLAGS_FILE = path.join(DATA_DIR, "flags.json");

const BOARD_SIZE = 50;
const DAY_MS = 86400_000;

function buildRepoMetrics(
  language: string,
  h: RepoHistory,
  suspectedFake: boolean,
  now: number,
): RepoMetrics {
  const s = h.latest;
  const { ageDays, bucket } = ageBucketOf(s.createdAt, now);
  const vel = starVelocity(h.points);
  const deltas = dailyDeltas(h.points);
  const trend = classifyTrend(deltas);

  // 近 7 天贡献者增量：找 ≥5 天前最近的贡献者数据点
  let contributorGrowth7d: number | null = null;
  if (h.contribPoints.length >= 2) {
    const latestC = h.contribPoints[h.contribPoints.length - 1];
    const ref = [...h.contribPoints]
      .reverse()
      .find((p) => (Date.parse(latestC.date) - Date.parse(p.date)) / DAY_MS >= 5);
    if (ref) contributorGrowth7d = latestC.count - ref.count;
  }

  // sparkline：近 14 天每日 star 总数，缺日为 null
  const byDate = new Map(h.points.map((p) => [p.date, p.stars]));
  const sparkline: (number | null)[] = [];
  for (let i = 13; i >= 0; i--) {
    sparkline.push(byDate.get(dateCN(new Date(now - i * DAY_MS))) ?? null);
  }

  const totalIssues = s.openIssues + s.closedIssues;
  const weeklyCommitAvg =
    s.weeklyCommits && s.weeklyCommits.length > 0
      ? Math.round((s.weeklyCommits.slice(-12).reduce((a, b) => a + b, 0) / Math.min(12, s.weeklyCommits.length)) * 10) / 10
      : null;

  return {
    repo: s.repo,
    language,
    description: s.description,
    stars: s.stars,
    forks: s.forks,
    ageDays,
    ageBucket: bucket,
    starVelocity: vel ? Math.round(vel.velocity * 10) / 10 : null,
    velocityWindowDays: vel?.windowDays ?? 0,
    acceleration: (() => {
      const a = acceleration(h.points);
      return a === null ? null : Math.round(a * 10) / 10;
    })(),
    forkStarRatio: s.stars > 0 ? Math.round((s.forks / s.stars) * 1000) / 1000 : 0,
    contributorCount: s.contributors?.count ?? null,
    contributorGrowth7d,
    busFactorTop1Share: s.contributors?.top1Share ?? null,
    maintenanceScore: maintenanceScore(s, now),
    daysSincePush: Math.floor((now - Date.parse(s.pushedAt)) / DAY_MS),
    daysSinceRelease: s.latestReleaseAt ? Math.floor((now - Date.parse(s.latestReleaseAt)) / DAY_MS) : null,
    issueOpenRatio: totalIssues > 0 ? Math.round((s.openIssues / totalIssues) * 1000) / 1000 : null,
    weeklyCommitAvg,
    flags: { suspectedFake, oneOffSpike: trend.oneOffSpike, steadyGrowth: trend.steadyGrowth },
    sparkline,
    percentile: null, // 语言内统一填充
  };
}

/** 语言内（优先同年龄桶）velocity 百分位 */
function fillPercentiles(repos: RepoMetrics[]): void {
  const langVels = repos.filter((r) => r.starVelocity !== null).map((r) => r.starVelocity!);
  for (const bucket of ["lt1y", "y1to3", "gt3y"] as const) {
    const group = repos.filter((r) => r.ageBucket === bucket && r.starVelocity !== null);
    const vels = group.map((r) => r.starVelocity!);
    for (const r of group) {
      r.percentile = percentileRank(vels.length >= 5 ? vels : langVels, r.starVelocity!);
    }
  }
}

export function compute(): Summary {
  const now = Date.now();
  const pool = readJson<Pool>(POOL_FILE, { updatedAt: "", entries: [] });
  const flagsFile = readJson<FlagsFile>(FLAGS_FILE, { updatedAt: "", flags: [] });
  const files = loadHistoryFiles();
  const histories = buildRepoHistories(files, loadBackfill());

  // 近 14 天内确认过刷量的仓库
  const fakeSet = new Set(
    flagsFile.flags
      .filter((f) => f.confirmed === true && (now - Date.parse(f.flaggedAt)) / DAY_MS <= 14)
      .map((f) => f.repo.toLowerCase()),
  );

  const byLang = new Map<string, RepoMetrics[]>();
  for (const entry of pool.entries) {
    const h = histories.get(entry.repo.toLowerCase());
    if (!h) continue;
    const m = buildRepoMetrics(entry.language, h, fakeSet.has(entry.repo.toLowerCase()), now);
    if (!byLang.has(entry.language)) byLang.set(entry.language, []);
    byLang.get(entry.language)!.push(m);
  }

  const generatedAt = nowISO();
  const summaryLangs: SummaryLang[] = [];
  const allRepos: RepoMetrics[] = [];

  for (const lang of LANGUAGES) {
    const repos = byLang.get(lang.id) ?? [];
    fillPercentiles(repos);
    allRepos.push(...repos);

    const withVel = repos.filter((r) => r.starVelocity !== null);
    const velocityTop = [...withVel]
      .sort((a, b) => b.starVelocity! - a.starVelocity!)
      .slice(0, BOARD_SIZE);
    const accelerationTop = repos
      .filter((r) => r.acceleration !== null)
      .sort((a, b) => b.acceleration! - a.acceleration!)
      .slice(0, BOARD_SIZE);
    const newStars = withVel
      .filter((r) => r.ageDays < 90)
      .sort((a, b) => b.starVelocity! - a.starVelocity!)
      .slice(0, BOARD_SIZE);

    const board: LanguageBoard = {
      language: lang.id,
      display: lang.display,
      generatedAt,
      velocityTop,
      accelerationTop,
      newStars,
    };
    writeJson(path.join(SITE_DATA_DIR, "lang", `${lang.id}.json`), board);

    summaryLangs.push({
      language: lang.id,
      display: lang.display,
      repoCount: repos.length,
      topRepo: velocityTop[0]?.repo ?? null,
      topVelocity: velocityTop[0]?.starVelocity ?? null,
    });
  }

  // 全局黑马榜：加速度为正的按「语言内加速度百分位 → 加速度绝对值」排序
  const withAccel = allRepos.filter((r) => r.acceleration !== null && r.acceleration > 0);
  const accelPct = new Map<string, number>();
  for (const lang of LANGUAGES) {
    const group = withAccel.filter((r) => r.language === lang.id);
    const vals = group.map((r) => r.acceleration!);
    for (const r of group) accelPct.set(r.repo, percentileRank(vals, r.acceleration!));
  }
  const darkHorses = [...withAccel]
    .sort(
      (a, b) =>
        (accelPct.get(b.repo)! - accelPct.get(a.repo)!) || b.acceleration! - a.acceleration!,
    )
    .slice(0, 30);

  const globalVelocity = allRepos
    .filter((r) => r.percentile !== null)
    .sort((a, b) => b.percentile! - a.percentile! || (b.starVelocity ?? 0) - (a.starVelocity ?? 0))
    .slice(0, BOARD_SIZE);

  const summary: Summary = {
    generatedAt,
    historyDays: files.length,
    languages: summaryLangs,
    darkHorses,
    globalVelocity,
  };
  writeJson(path.join(SITE_DATA_DIR, "summary.json"), summary);
  console.log(
    `[compute] 输出 ${summaryLangs.length} 个语言榜单，共 ${allRepos.length} 个仓库，历史 ${files.length} 天`,
  );
  return summary;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  compute();
}
