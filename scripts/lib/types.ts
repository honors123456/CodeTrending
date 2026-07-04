/**
 * 全部数据 schema 的唯一定义处（见 CLAUDE.md 目录约定）。
 * 改动数据结构必须先改这里，再改读写两端。
 */

/** 支持的语言。id 用于文件名/URL，trendingSlug 用于 github.com/trending/{slug}，ghName 对应 GraphQL primaryLanguage.name */
export interface LangDef {
  id: string;
  display: string;
  trendingSlug: string;
  ghName: string;
}

export const LANGUAGES: readonly LangDef[] = [
  { id: "python", display: "Python", trendingSlug: "python", ghName: "Python" },
  { id: "javascript", display: "JavaScript", trendingSlug: "javascript", ghName: "JavaScript" },
  { id: "typescript", display: "TypeScript", trendingSlug: "typescript", ghName: "TypeScript" },
  { id: "go", display: "Go", trendingSlug: "go", ghName: "Go" },
  { id: "rust", display: "Rust", trendingSlug: "rust", ghName: "Rust" },
  { id: "java", display: "Java", trendingSlug: "java", ghName: "Java" },
  { id: "cpp", display: "C++", trendingSlug: "c%2B%2B", ghName: "C++" },
  { id: "c", display: "C", trendingSlug: "c", ghName: "C" },
  { id: "csharp", display: "C#", trendingSlug: "c%23", ghName: "C#" },
  { id: "kotlin", display: "Kotlin", trendingSlug: "kotlin", ghName: "Kotlin" },
  { id: "swift", display: "Swift", trendingSlug: "swift", ghName: "Swift" },
  { id: "php", display: "PHP", trendingSlug: "php", ghName: "PHP" },
] as const;

export function langById(id: string): LangDef | undefined {
  return LANGUAGES.find((l) => l.id === id);
}

/* ---------- 候选池 data/pool.json ---------- */

export interface PoolEntry {
  /** owner/name */
  repo: string;
  /** 语言 id（发现时所在的 trending 页语言） */
  language: string;
  /** 首次进入候选池日期 YYYY-MM-DD（UTC+8） */
  firstSeen: string;
  /** 最近一次出现在 trending 的日期 YYYY-MM-DD（UTC+8） */
  lastSeenOnTrending: string;
}

export interface Pool {
  updatedAt: string;
  entries: PoolEntry[];
}

/* ---------- 快照 data/history/YYYY-MM-DD.json ---------- */

export interface RepoSnapshot {
  repo: string;
  stars: number;
  forks: number;
  openIssues: number;
  closedIssues: number;
  createdAt: string;
  pushedAt: string;
  /** GitHub primaryLanguage.name，可能与候选池语言不同或为 null */
  primaryLanguage: string | null;
  description: string | null;
  latestReleaseAt: string | null;
  /** REST /contributors 前 100 名统计；采集失败时缺省 */
  contributors?: { count: number; top1Share: number };
  /** REST /stats/participation 52 周 commit 数；GitHub 计算中(202)时缺省 */
  weeklyCommits?: number[];
}

export interface HistoryRun {
  /** 运行时刻 ISO datetime */
  t: string;
  snapshots: RepoSnapshot[];
}

export interface HistoryFile {
  /** YYYY-MM-DD（UTC+8） */
  date: string;
  runs: HistoryRun[];
}

/* ---------- 刷量标记 data/flags.json ---------- */

export interface FakeStarFlag {
  repo: string;
  flaggedAt: string;
  /** 当日 star 增量的 z-score */
  zScore: number;
  /** 抽样最近 stargazers 后确认：新号占比 */
  newAccountShare: number | null;
  /** true=抽样确认疑似刷量；false=抽样后排除；null=未抽样（仅尖峰） */
  confirmed: boolean | null;
}

export interface FlagsFile {
  updatedAt: string;
  flags: FakeStarFlag[];
}

/* ---------- 前端榜单 site/public/data/ ---------- */

export type AgeBucket = "lt1y" | "y1to3" | "gt3y";

export interface RepoMetrics {
  repo: string;
  language: string;
  description: string | null;
  stars: number;
  forks: number;
  ageDays: number;
  ageBucket: AgeBucket;
  /** stars/day；历史不足 2 个点为 null */
  starVelocity: number | null;
  /** 实际计算窗口天数（目标 7） */
  velocityWindowDays: number;
  /** 近 3 天增速 − 前 3 天增速；历史 <6 天为 null（前端显示"数据积累中"） */
  acceleration: number | null;
  forkStarRatio: number;
  contributorCount: number | null;
  /** 近 7 天贡献者数量增量 */
  contributorGrowth7d: number | null;
  /** top1 贡献者 commit 占比，越高 bus factor 风险越大 */
  busFactorTop1Share: number | null;
  /** 0-100 合成分 */
  maintenanceScore: number | null;
  daysSincePush: number;
  daysSinceRelease: number | null;
  /** open/(open+closed) */
  issueOpenRatio: number | null;
  weeklyCommitAvg: number | null;
  flags: {
    suspectedFake: boolean;
    oneOffSpike: boolean;
    steadyGrowth: boolean;
  };
  /** 近 14 天每日 star 总数（缺日为 null），用于 sparkline */
  sparkline: (number | null)[];
  /** 语言内综合百分位 0-100（增速为主），历史不足为 null */
  percentile: number | null;
}

export interface LanguageBoard {
  language: string;
  display: string;
  generatedAt: string;
  /** 增速榜 */
  velocityTop: RepoMetrics[];
  /** 黑马榜（加速度） */
  accelerationTop: RepoMetrics[];
  /** 新星榜（创建 <90 天） */
  newStars: RepoMetrics[];
}

export interface SummaryLang {
  language: string;
  display: string;
  repoCount: number;
  /** 该语言增速 Top1 */
  topRepo: string | null;
  topVelocity: number | null;
}

export interface Summary {
  generatedAt: string;
  /** 全站历史天数（用于前端判断是否显示"数据积累中"） */
  historyDays: number;
  languages: SummaryLang[];
  /** 全局黑马榜：各语言加速度百分位最高者合并 */
  darkHorses: RepoMetrics[];
  /** 全局增速榜（语言内百分位排序） */
  globalVelocity: RepoMetrics[];
}
