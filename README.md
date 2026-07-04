# CodeTrending · 开源趋势雷达

用**变化率**发现正在流行的开源项目，而不是被「仓库年龄」污染的累计 star 排行。中文界面，按 12 种主流语言导航，每天北京时间 8:05 / 12:05 / 19:05 自动刷新。

## 核心指标

| 指标 | 回答的问题 |
|---|---|
| star 增速（/天） | 现在火不火 |
| star 加速度 | 是不是刚开始爆发（黑马榜的依据） |
| fork/star 比、贡献者增长 | 围观热度还是真在被用 |
| 维护活跃度分 | 项目是活的还是已凉 |
| bus factor（top1 贡献者占比） | 一个人扛还是社区型 |
| 疑似刷量标注 | 尖峰检测 + 加星账号抽样 |
| 热点/持续分类 | 上了 HN 一日游 vs 稳定上升 |

所有榜单在**语言内按百分位归一化**并按仓库年龄分桶，跨语言不比 star 绝对值。

## 架构

```
抓取 github.com/trending HTML（curl/fetch，零依赖，零部署成本）
        ↓
GitHub GraphQL/REST 拉精确指标（每天 3 次快照 → data/history/）
        ↓
compute.ts 从快照历史算变化率 → site/public/data/*.json
        ↓
Vite 静态站（GitHub Pages），GitHub Actions cron 驱动
```

## 本地运行

```bash
cp .env.example .env   # 填 GITHUB_TOKEN（无 scope 的 PAT）
npm install
npm run collect        # 发现 + 采集 + 快照 + 刷量检测 + 计算
npm run dev            # 本地预览 http://localhost:5173
```

冷启动可选：`npm run bootstrap` 用带时间戳的 stargazers API 为小体量仓库回填近 14 天 star 历史，让增速第一天就可用（加速度仍需约 6 天真实快照）。

## 部署（GitHub Actions）

1. 仓库 Settings → Secrets and variables → Actions 添加 `GH_PAT`（无 scope 的 PAT）
2. Settings → Pages → Source 选 **GitHub Actions**
3. 手动触发一次 `collect-and-deploy` workflow 验证全链路

## 开发约定

见 [CLAUDE.md](CLAUDE.md)：目录规则、指标口径定义、密钥红线。
