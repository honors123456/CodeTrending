import fs from "node:fs";
import path from "node:path";

/** 本地开发时从 .env 加载密钥；CI 上直接用环境变量，文件不存在则忽略 */
export function loadEnv(): void {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    /* .env 不存在（CI 环境），忽略 */
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`缺少环境变量 ${name}，本地请复制 .env.example 为 .env 并填写`);
    process.exit(1);
  }
  return v;
}

const CN_OFFSET_MS = 8 * 3600_000;

/** UTC+8 的 YYYY-MM-DD */
export function dateCN(d: Date = new Date()): string {
  return new Date(d.getTime() + CN_OFFSET_MS).toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export const DATA_DIR = path.join(process.cwd(), "data");
export const HISTORY_DIR = path.join(DATA_DIR, "history");
export const SITE_DATA_DIR = path.join(process.cwd(), "site", "public", "data");

export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, data: unknown, compact = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, compact ? 0 : 1), "utf8");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 简易并发限制器 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** 带重试的 fetch：429/5xx 退避重试，403+Retry-After 按头等待 */
export async function fetchRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500 || res.status === 403) {
        if (attempt === retries) return res;
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
        // 403 且非限流（无 rate limit 头）不重试
        if (res.status === 403 && !retryAfter && res.headers.get("x-ratelimit-remaining") !== "0") {
          return res;
        }
        await sleep(Math.min(waitMs, 60_000));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === retries) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw lastErr;
}
