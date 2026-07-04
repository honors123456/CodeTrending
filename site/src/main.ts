import "./style.css";
import { LANGUAGES } from "../../scripts/lib/types";
import type { LanguageBoard, RepoMetrics, Summary } from "../../scripts/lib/types";
import { sparkSvg } from "./sparkline";

const app = document.getElementById("app")!;

/* ---------- 工具 ---------- */

function esc(s: string | null): string {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function fmtNum(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtSigned(n: number): string {
  const v = Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
  return n > 0 ? `+${v}` : `${v}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

const AGE_LABEL: Record<string, string> = { lt1y: "<1年", y1to3: "1-3年", gt3y: ">3年" };

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------- 组件 ---------- */

function badges(r: RepoMetrics): string {
  const out: string[] = [];
  if (r.flags.suspectedFake) out.push(`<span class="badge fake" title="短时间大量疑似新注册账号加星，请谨慎看待其热度">⚠ 疑似刷量</span>`);
  if (r.flags.oneOffSpike) out.push(`<span class="badge spike" title="上过热搜后回落，非持续增长">⚡ 一次性热点</span>`);
  if (r.flags.steadyGrowth) out.push(`<span class="badge steady" title="连续 7 天稳定正增长">↗ 稳定增长</span>`);
  out.push(`<span class="badge age">${AGE_LABEL[r.ageBucket]}</span>`);
  return `<span class="badges">${out.join("")}</span>`;
}

function repoCell(r: RepoMetrics, showLang: boolean): string {
  const lang = showLang ? `<span class="num-sub">${esc(LANGUAGES.find((l) => l.id === r.language)?.display ?? r.language)} · </span>` : "";
  return `<td class="left repo-name">
    <div>${lang}<a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener">${esc(r.repo)}</a>${badges(r)}</div>
    <div class="repo-desc" title="${esc(r.description)}">${esc(r.description) || "&nbsp;"}</div>
  </td>`;
}

function velocityCell(r: RepoMetrics): string {
  if (r.starVelocity === null) return `<td><span class="pending-data">积累中</span></td>`;
  const sub = r.velocityWindowDays < 7 ? `<div class="num-sub">${r.velocityWindowDays}天窗口</div>` : "";
  return `<td><span class="num-main pos">+${fmtNum(Math.round(r.starVelocity))}/天</span>${sub}</td>`;
}

function accelCell(r: RepoMetrics): string {
  if (r.acceleration === null) return `<td><span class="pending-data" title="加速度需要至少 6 天历史数据">积累中</span></td>`;
  const cls = r.acceleration > 0 ? "pos" : r.acceleration < 0 ? "neg" : "";
  return `<td><span class="num-main ${cls}">${fmtSigned(r.acceleration)}</span></td>`;
}

function contribCell(r: RepoMetrics): string {
  if (r.contributorCount === null) return `<td><span class="pending-data">—</span></td>`;
  const growth = r.contributorGrowth7d !== null && r.contributorGrowth7d !== 0 ? ` <span class="pos">${fmtSigned(r.contributorGrowth7d)}</span>` : "";
  const bus = r.busFactorTop1Share !== null ? `<div class="num-sub" title="top1 贡献者 commit 占比，越高单点风险越大">Top1 占 ${Math.round(r.busFactorTop1Share * 100)}%</div>` : "";
  return `<td>${fmtNum(r.contributorCount)}${growth}${bus}</td>`;
}

function table(repos: RepoMetrics[], showLang = false): string {
  if (repos.length === 0) return `<div class="empty">暂无数据</div>`;
  const rows = repos
    .map(
      (r, i) => `<tr>
        <td class="rank">${i + 1}</td>
        ${repoCell(r, showLang)}
        ${velocityCell(r)}
        ${accelCell(r)}
        <td>${sparkSvg(r.sparkline)}</td>
        <td>${fmtNum(r.stars)}<div class="num-sub">fork ${fmtNum(r.forks)}</div></td>
        <td title="fork/star 比，过低可能是围观热度">${(r.forkStarRatio * 100).toFixed(1)}%</td>
        ${contribCell(r)}
        <td title="commit 近因 + 提交频率 + issue 健康 + release 节奏的 0-100 合成分">${r.maintenanceScore ?? "—"}</td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="board-table">
    <thead><tr>
      <th></th><th class="left">仓库</th><th>增速</th><th>加速度</th><th>近14天</th>
      <th>Star</th><th>Fork/Star</th><th>贡献者</th><th>维护分</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function nav(active: string): string {
  const items = [
    `<a href="#/" class="${active === "home" ? "active" : ""}">综合</a>`,
    ...LANGUAGES.map(
      (l) => `<a href="#/lang/${l.id}" class="${active === l.id ? "active" : ""}">${l.display}</a>`,
    ),
  ];
  return `<nav class="langs container">${items.join("")}</nav>`;
}

function layout(active: string, meta: string, body: string): string {
  return `
  <header class="site">
    <div class="container">
      <div class="site-title"><span class="logo">📈</span> CodeTrending · 开源趋势雷达</div>
      <div class="site-sub">用变化率发现正在流行的开源项目 —— 看增速与加速度，不看累计 star</div>
      <div class="site-meta">${meta}</div>
    </div>
    ${nav(active)}
  </header>
  <main class="container">${body}</main>
  <footer class="site"><div class="container">
    <p>指标口径：增速 = 近 7 天日均新增 star；加速度 = 近 3 天增速 − 前 3 天增速（需 6 天以上历史，不足显示「积累中」）；维护分为 commit 近因、提交频率、issue 健康、release 节奏的 0-100 合成分。</p>
    <p>榜单在语言内按百分位归一化并按仓库年龄分桶，跨语言不比 star 绝对值；「疑似刷量」由尖峰检测 + 加星账号抽样标注，仅供参考。</p>
    <p>数据来源：GitHub Trending（Firecrawl 抓取）+ GitHub API，每天北京时间 8:05 / 12:05 / 19:05 更新。</p>
  </div></footer>`;
}

const EMPTY_HINT = `<div class="empty">暂无数据。请先运行采集：npm run collect（详见 README）</div>`;

/* ---------- 页面 ---------- */

async function renderHome(): Promise<void> {
  const summary = await loadJson<Summary>("./data/summary.json");
  if (!summary) {
    app.innerHTML = layout("home", "等待首次采集", EMPTY_HINT);
    return;
  }
  const cards = summary.languages
    .map(
      (l) => `<a class="lang-card" href="#/lang/${l.language}">
        <div class="name">${l.display}</div>
        <div class="count">${l.repoCount} 个在榜仓库</div>
        <div class="top">${l.topRepo ? `🔥 ${esc(l.topRepo.split("/")[1] ?? l.topRepo)} +${fmtNum(Math.round(l.topVelocity ?? 0))}/天` : "暂无数据"}</div>
      </a>`,
    )
    .join("");

  const accumulating = summary.historyDays < 7
    ? `<section class="board"><div class="desc">⏳ 数据积累中：当前仅 ${summary.historyDays} 天快照历史，加速度与趋势分类将在 6-7 天后完整可用。</div></section>`
    : "";

  app.innerHTML = layout(
    "home",
    `数据更新于 ${fmtTime(summary.generatedAt)} · 快照历史 ${summary.historyDays} 天`,
    `${accumulating}
    <section class="board">
      <h2>按语言浏览</h2>
      <div class="desc">12 种主流语言，点击进入语言榜单</div>
      <div class="lang-grid">${cards}</div>
    </section>
    <section class="board">
      <h2>🐎 全局黑马榜</h2>
      <div class="desc">star 增速正在变快的项目（按语言内加速度百分位排序）—— 比排行榜更早发现爆发点</div>
      ${table(summary.darkHorses, true)}
    </section>
    <section class="board">
      <h2>🚀 全局增速榜</h2>
      <div class="desc">语言内增速百分位最高的项目（年龄分桶归一化，跨语言可比）</div>
      ${table(summary.globalVelocity, true)}
    </section>`,
  );
}

type Tab = "velocity" | "acceleration" | "new";
let currentTab: Tab = "velocity";

async function renderLang(id: string): Promise<void> {
  const lang = LANGUAGES.find((l) => l.id === id);
  if (!lang) {
    location.hash = "#/";
    return;
  }
  const board = await loadJson<LanguageBoard>(`./data/lang/${id}.json`);
  if (!board) {
    app.innerHTML = layout(id, "等待首次采集", EMPTY_HINT);
    return;
  }
  const tabs: { key: Tab; label: string; desc: string; repos: RepoMetrics[] }[] = [
    { key: "velocity", label: "增速榜", desc: "近 7 天日均新增 star 最高", repos: board.velocityTop },
    { key: "acceleration", label: "黑马榜", desc: "增速变化最大（正在爆发）", repos: board.accelerationTop },
    { key: "new", label: "新星榜", desc: "创建不满 90 天的新项目按增速排序", repos: board.newStars },
  ];
  const active = tabs.find((t) => t.key === currentTab) ?? tabs[0];

  app.innerHTML = layout(
    id,
    `数据更新于 ${fmtTime(board.generatedAt)}`,
    `<section class="board">
      <h2>${lang.display} 趋势榜</h2>
      <div class="desc">${active.desc}</div>
      <div class="tabs">${tabs
        .map((t) => `<button data-tab="${t.key}" class="${t.key === active.key ? "active" : ""}">${t.label}</button>`)
        .join("")}</div>
      ${table(active.repos)}
    </section>`,
  );

  app.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab as Tab;
      void renderLang(id);
    });
  });
}

function route(): void {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/lang\/([\w#+-]+)/);
  if (m) {
    void renderLang(m[1]);
  } else {
    currentTab = "velocity";
    void renderHome();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
