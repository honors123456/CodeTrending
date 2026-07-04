# CodeTrending

中文界面的开源项目趋势网站。核心理念：**用变化率而非 star 总数衡量热度**。数据每天北京时间 8:05 / 12:05 / 19:05 由 GitHub Actions 刷新。

## 架构

- **发现**：`curl` / `fetch` 拉 `github.com/trending/{lang}` HTML（daily + weekly，12 种语言），正则解析 → 候选池 `data/pool.json`
- **采集**：GitHub GraphQL（50 repo/查询批量）+ REST（contributors、participation、stargazers）→ 快照 `data/history/YYYY-MM-DD.json`
- **计算**：`scripts/compute.ts` 纯读快照历史，产出榜单 JSON 到 `site/public/data/`
- **前端**：Vite + 原生 TS 静态站，无框架、无外部请求，只读本地 JSON

## 目录约定

| 路径 | 内容 | 规则 |
|---|---|---|
| `scripts/` | 采集与计算脚本 | 入口 `run.ts`；共享逻辑放 `scripts/lib/` |
| `scripts/lib/types.ts` | 全部数据 schema | 改动数据结构必须先改这里 |
| `data/pool.json` | 候选池 | 30 天未再上 trending 的 repo 淘汰出池（历史保留） |
| `data/history/` | 快照，每日一文件 | 只追加，不回改；文件名 `YYYY-MM-DD.json`（UTC+8 日期） |
| `data/translations.json` | 简介中文翻译缓存 | 采集时经 GitHub Models（复用 GITHUB_TOKEN）增量翻译；原文变更自动重翻 |
| `site/public/data/` | 前端榜单 JSON | 由 compute.ts 生成，**不手改、不提交**（gitignore） |
| `site/src/` | 前端代码 | 中文文案；图表实现前先读 dataviz skill |

## 命令

```bash
npm run collect    # discover + enrich + snapshot（需 .env 双 key）
npm run compute    # 快照 → 榜单 JSON
npm run bootstrap  # 一次性：小体量 repo 回填近 2 周 star 历史
npm test           # metrics 单测
npm run typecheck  # tsc --noEmit
npm run dev        # vite dev 本地预览
npm run build      # vite build
```

改完代码必须跑 `npm run typecheck` + `npm test`；改采集逻辑还要本地跑一次 `npm run collect` 验证产物字段。

## 指标定义（口径变更必须同步更新此表）

| 指标 | 口径 |
|---|---|
| star 增速 | (当前 star − 7 天前 star) / 7；历史不足 7 天按实际窗口，标 `window_days` |
| 加速度 | 近 3 天增速 − 前 3 天增速；历史 <6 天显示"数据积累中" |
| fork/star 比 | forks / stars |
| bus factor | top1 贡献者 commit 数 / top100 贡献者 commit 总数 |
| 维护活跃度 | 距上次 commit/release 天数、52 周周均 commit、issue open/(open+closed) 的合成分 |
| 疑似刷量 | 当日 star 增量对自身 14 天滑动均值 z-score > 3 触发；再抽样最近 100 stargazers，新号（<30 天且 0 follower）占比 >50% 确认 |
| 热点/持续 | 尖峰后 3 天增速回落 >70% = 一次性热点；连续 7 天正增长低方差 = 稳定增长 |
| 归一化 | 语言内百分位排名 + 年龄分桶（<1 年 / 1–3 年 / >3 年），跨语言榜只比百分位 |

## 密钥规则

- `GITHUB_TOKEN`（PAT，无需 scope）只存两处：本地 `.env`（已 gitignore）、GitHub Actions secret `GH_PAT`
- 密钥不进代码、不进 commit、不进日志；脚本打日志前过滤 env

## 代理

本地 Windows 环境若有代理（`HTTPS_PROXY`），`discover.ts` 自动走 curl 配合代理抓 trending 页；
CI（GitHub Actions）无代理，`scrapeMarkdown` 自动切到原生 Node fetch。

## 红线

- `data/history/` 是唯一事实来源，禁止删除或回改
- 部署（开启/修改 GitHub Pages、改 workflow 的 cron）先问 lxx
