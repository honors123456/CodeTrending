/**
 * 主入口（GitHub Actions 每天北京时间 8:05/12:05/19:05 调用）：
 * discover → enrich → snapshot → 简介翻译 → 刷量检测 → compute
 */
import { loadEnv } from "./lib/util.js";
import { discover } from "./discover.js";
import { appendSnapshots, enrich } from "./enrich.js";
import { buildRepoHistories, loadBackfill, loadHistoryFiles } from "./lib/history.js";
import { detectFakeStars } from "./lib/fakestars.js";
import { translateDescriptions } from "./lib/translate.js";
import { compute } from "./compute.js";

async function main(): Promise<void> {
  loadEnv();
  const pool = await discover();
  const snapshots = await enrich(pool);
  appendSnapshots(snapshots);

  await translateDescriptions(snapshots);

  const histories = buildRepoHistories(loadHistoryFiles(), loadBackfill());
  await detectFakeStars(histories);

  compute();
  console.log("[run] 本轮采集完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
