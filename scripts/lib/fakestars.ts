/**
 * 刷量检测（口径见 CLAUDE.md）：
 * 1) 当日 star 增量对自身 14 天滑动均值 z-score > 3 且日增 ≥50 → 尖峰候选
 * 2) 候选仓库抽样最近 stargazers（近 3 天加星者，最多 30 个账号）：
 *    新号（注册 <30 天且 0 follower）占比 >50% → 确认「疑似刷量」
 * 只对异常仓库抽样，控制 API 成本。
 */
import path from "node:path";
import type { FakeStarFlag, FlagsFile } from "./types.js";
import type { RepoHistory } from "./history.js";
import { dailyDeltas, zScoreLatest } from "./metrics.js";
import { fetchRecentStargazers } from "./github.js";
import { DATA_DIR, nowISO, readJson, writeJson } from "./util.js";

export const FLAGS_FILE = path.join(DATA_DIR, "flags.json");

const Z_THRESHOLD = 3;
const MIN_DAILY_GAIN = 50;
const SAMPLE_SIZE = 30;
const NEW_ACCOUNT_DAYS = 30;
const CONFIRM_SHARE = 0.5;
const REFLAG_COOLDOWN_DAYS = 7;
const KEEP_DAYS = 90;
const DAY_MS = 86400_000;

export async function detectFakeStars(histories: Map<string, RepoHistory>): Promise<FlagsFile> {
  const now = Date.now();
  const file = readJson<FlagsFile>(FLAGS_FILE, { updatedAt: "", flags: [] });
  const recentlyFlagged = new Set(
    file.flags
      .filter((f) => (now - Date.parse(f.flaggedAt)) / DAY_MS < REFLAG_COOLDOWN_DAYS)
      .map((f) => f.repo.toLowerCase()),
  );

  const candidates: { repo: string; z: number }[] = [];
  for (const h of histories.values()) {
    const key = h.latest.repo.toLowerCase();
    if (recentlyFlagged.has(key)) continue;
    const deltas = dailyDeltas(h.points);
    if (deltas.length === 0 || deltas[deltas.length - 1].perDay < MIN_DAILY_GAIN) continue;
    const z = zScoreLatest(deltas);
    if (z !== null && z > Z_THRESHOLD) candidates.push({ repo: h.latest.repo, z });
  }

  console.log(`[fakestars] 尖峰候选 ${candidates.length} 个`);
  for (const { repo, z } of candidates) {
    let newAccountShare: number | null = null;
    let confirmed: boolean | null = null;
    try {
      // GraphQL 倒序取最近 200 个加星者，自带账号注册时间与 follower 数
      const gazers = await fetchRecentStargazers(repo, 200);
      const recent = gazers.filter((g) => (now - Date.parse(g.starredAt)) / DAY_MS <= 3);
      // 均匀抽样最多 SAMPLE_SIZE 个账号
      const step = Math.max(1, Math.floor(recent.length / SAMPLE_SIZE));
      const sample = recent.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);
      if (sample.length >= 10) {
        const newOnes = sample.filter(
          (u) => (now - Date.parse(u.createdAt)) / DAY_MS < NEW_ACCOUNT_DAYS && u.followers === 0,
        );
        newAccountShare = Math.round((newOnes.length / sample.length) * 1000) / 1000;
        confirmed = newAccountShare > CONFIRM_SHARE;
      }
    } catch (e) {
      console.error(`[fakestars] ${repo} 抽样失败: ${(e as Error).message}`);
    }
    const flag: FakeStarFlag = { repo, flaggedAt: nowISO(), zScore: Math.round(z * 10) / 10, newAccountShare, confirmed };
    file.flags.push(flag);
    console.log(
      `[fakestars] ${repo} z=${flag.zScore} 新号占比=${newAccountShare ?? "未知"} → ${confirmed === true ? "疑似刷量" : confirmed === false ? "排除" : "未确认"}`,
    );
  }

  file.flags = file.flags.filter((f) => (now - Date.parse(f.flaggedAt)) / DAY_MS <= KEEP_DAYS);
  file.updatedAt = nowISO();
  writeJson(FLAGS_FILE, file);
  return file;
}
