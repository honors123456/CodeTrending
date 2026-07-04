import { describe, expect, it } from "vitest";
import {
  acceleration,
  ageBucketOf,
  classifyTrend,
  dailyDeltas,
  maintenanceScore,
  percentileRank,
  starVelocity,
  zScoreLatest,
  type SeriesPoint,
} from "./metrics.js";

/** 构造从 startDate 起每日一点的序列 */
function series(startDate: string, stars: number[]): SeriesPoint[] {
  const t0 = Date.parse(startDate);
  return stars.map((s, i) => ({
    date: new Date(t0 + i * 86400_000).toISOString().slice(0, 10),
    stars: s,
  }));
}

describe("starVelocity", () => {
  it("单点返回 null", () => {
    expect(starVelocity(series("2026-07-01", [100]))).toBeNull();
  });

  it("完整 7 天窗口：每天 +10 → 增速 10/天", () => {
    const pts = series("2026-07-01", [100, 110, 120, 130, 140, 150, 160, 170]);
    const v = starVelocity(pts);
    expect(v).not.toBeNull();
    expect(v!.velocity).toBeCloseTo(10);
    expect(v!.windowDays).toBe(7);
  });

  it("历史不足 7 天按实际窗口", () => {
    const pts = series("2026-07-01", [100, 130, 160]); // 2 天窗口
    const v = starVelocity(pts);
    expect(v!.velocity).toBeCloseTo(30);
    expect(v!.windowDays).toBe(2);
  });
});

describe("acceleration", () => {
  it("历史 <6 天返回 null（数据积累中）", () => {
    expect(acceleration(series("2026-07-01", [100, 110, 120, 130]))).toBeNull();
  });

  it("匀速增长加速度为 0", () => {
    const pts = series("2026-07-01", [100, 110, 120, 130, 140, 150, 160]);
    expect(acceleration(pts)).toBeCloseTo(0);
  });

  it("前 3 天 +10/天、近 3 天 +40/天 → 加速度 30", () => {
    const pts = series("2026-07-01", [100, 110, 120, 130, 170, 210, 250]);
    expect(acceleration(pts)).toBeCloseTo(30);
  });

  it("减速为负", () => {
    const pts = series("2026-07-01", [100, 140, 180, 220, 230, 240, 250]);
    expect(acceleration(pts)).toBeCloseTo(-30);
  });
});

describe("zScoreLatest", () => {
  it("样本不足返回 null", () => {
    const d = dailyDeltas(series("2026-07-01", [100, 110, 120]));
    expect(zScoreLatest(d)).toBeNull();
  });

  it("平稳增长后突然尖峰 → 高 z-score", () => {
    // 前 7 天每天 +10，最后一天 +500
    const pts = series("2026-07-01", [100, 110, 120, 130, 140, 150, 160, 170, 670]);
    const z = zScoreLatest(dailyDeltas(pts));
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(3);
  });

  it("平稳序列无误报（std 钳到 1 后 z 仍小）", () => {
    const pts = series("2026-07-01", [100, 110, 120, 130, 140, 150, 160, 170, 181]);
    const z = zScoreLatest(dailyDeltas(pts));
    expect(Math.abs(z!)).toBeLessThan(3);
  });
});

describe("classifyTrend", () => {
  it("尖峰后回落 → 一次性热点", () => {
    // 日增量: 10,10,10,800,20,15,10 → 尖峰后 3 日均值 15 << 800×0.3
    const pts = series("2026-07-01", [100, 110, 120, 130, 930, 950, 965, 975]);
    const c = classifyTrend(dailyDeltas(pts));
    expect(c.oneOffSpike).toBe(true);
    expect(c.steadyGrowth).toBe(false);
  });

  it("连续 7 天稳定正增长 → 稳定增长", () => {
    const pts = series("2026-07-01", [100, 150, 200, 252, 300, 355, 400, 450]);
    const c = classifyTrend(dailyDeltas(pts));
    expect(c.steadyGrowth).toBe(true);
    expect(c.oneOffSpike).toBe(false);
  });

  it("尖峰后保持高位不算一次性热点", () => {
    // 尖峰 800 后每天 +400（回落 <70%）
    const pts = series("2026-07-01", [100, 110, 120, 130, 930, 1330, 1730, 2130]);
    const c = classifyTrend(dailyDeltas(pts));
    expect(c.oneOffSpike).toBe(false);
  });
});

describe("ageBucketOf", () => {
  const now = Date.parse("2026-07-04T00:00:00Z");
  it("分桶边界", () => {
    expect(ageBucketOf("2026-01-01T00:00:00Z", now).bucket).toBe("lt1y");
    expect(ageBucketOf("2024-07-01T00:00:00Z", now).bucket).toBe("y1to3");
    expect(ageBucketOf("2020-01-01T00:00:00Z", now).bucket).toBe("gt3y");
  });
});

describe("maintenanceScore", () => {
  const now = Date.parse("2026-07-04T00:00:00Z");
  it("活跃项目高分", () => {
    const score = maintenanceScore(
      {
        pushedAt: "2026-07-03T12:00:00Z",
        latestReleaseAt: "2026-06-20T00:00:00Z",
        openIssues: 20,
        closedIssues: 180,
        weeklyCommits: Array(52).fill(15),
      },
      now,
    );
    expect(score).toBe(100);
  });

  it("凉掉的项目低分", () => {
    const score = maintenanceScore(
      {
        pushedAt: "2025-01-01T00:00:00Z",
        latestReleaseAt: null,
        openIssues: 90,
        closedIssues: 10,
        weeklyCommits: Array(52).fill(0),
      },
      now,
    );
    expect(score).toBe(0);
  });
});

describe("percentileRank", () => {
  it("语言内百分位", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileRank(values, 10)).toBe(100);
    expect(percentileRank(values, 5)).toBe(50);
    expect(percentileRank(values, 0)).toBe(0);
  });
});
