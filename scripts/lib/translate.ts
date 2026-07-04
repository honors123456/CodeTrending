/**
 * 简介中文翻译：调 GitHub Models（免费，复用 GITHUB_TOKEN），结果缓存到 data/translations.json。
 * 只翻译缓存缺失或原文已变更的条目；任何失败只警告不中断采集，下轮自动重试。
 */
import path from "node:path";
import type { RepoSnapshot, TranslationsFile } from "./types.js";
import { DATA_DIR, fetchRetry, nowISO, readJson, sleep, writeJson } from "./util.js";

const TRANSLATIONS_FILE = path.join(DATA_DIR, "translations.json");
const MODELS_URL = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const BATCH_SIZE = 40;

const CJK_RE = /[一-鿿]/;

const SYSTEM_PROMPT = `你是 GitHub 仓库简介翻译器。把用户给出的 JSON 字符串数组逐条翻译成简体中文：
- 技术名词、项目名、专有名词保留英文
- 简洁直译，不加解释
- 只输出与输入等长的 JSON 字符串数组，无其他内容`;

/** 调一次 GitHub Models，翻译一批简介；失败或结果不合法返回 null */
async function translateBatch(texts: string[], token: string): Promise<string[] | null> {
  const res = await fetchRetry(MODELS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(texts) },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) {
    console.warn(`[translate] GitHub Models 返回 ${res.status}，本批跳过`);
    return null;
  }
  try {
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const out = JSON.parse(raw) as unknown;
    if (!Array.isArray(out) || out.length !== texts.length || !out.every((s) => typeof s === "string")) {
      console.warn("[translate] 返回格式不符（长度或类型不匹配），本批跳过");
      return null;
    }
    return out as string[];
  } catch {
    console.warn("[translate] 返回内容解析失败，本批跳过");
    return null;
  }
}

export function loadTranslations(): TranslationsFile {
  return readJson<TranslationsFile>(TRANSLATIONS_FILE, { updatedAt: "", entries: {} });
}

/** 为本轮快照中缺翻译/原文已变更的简介生成中文，写回缓存文件 */
export async function translateDescriptions(snapshots: RepoSnapshot[]): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[translate] 缺少 GITHUB_TOKEN，跳过翻译");
    return;
  }
  const file = loadTranslations();

  const pending: { repo: string; src: string }[] = [];
  for (const s of snapshots) {
    const src = s.description?.trim();
    if (!src) continue;
    if (file.entries[s.repo]?.src === src) continue;
    // 原文本身已是中文，直接入缓存不调 API
    if (CJK_RE.test(src)) {
      file.entries[s.repo] = { src, zh: src };
      continue;
    }
    pending.push({ repo: s.repo, src });
  }

  let translated = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const zhList = await translateBatch(batch.map((p) => p.src), token);
    if (zhList) {
      batch.forEach((p, j) => {
        file.entries[p.repo] = { src: p.src, zh: zhList[j] };
      });
      translated += batch.length;
    }
    if (i + BATCH_SIZE < pending.length) await sleep(3000); // 免费额度限流，批间隔 3s
  }

  file.updatedAt = nowISO();
  writeJson(TRANSLATIONS_FILE, file);
  console.log(`[translate] 待翻译 ${pending.length} 条，成功 ${translated} 条，缓存共 ${Object.keys(file.entries).length} 条`);
}
