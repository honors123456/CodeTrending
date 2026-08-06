# CodeTrending Roadmap

## 当前阶段

- 维护 GitHub Actions 定时采集与静态站点发布流程。

## 已完成

- 2026-08-06：将 `actions/checkout` 和 `actions/setup-node` 从 `v4` 升级到使用 Node 24 运行时的 `v5`，项目构建运行时继续使用 Node 22。

## 进行中

- 无。

## 待办

- 在 GitHub Actions 中运行一次 `collect`，确认 Node 20 弃用警告消失且采集、构建、发布均成功。

## 阻塞

- 无。

## 最近验证

- 2026-08-06：workflow 静态断言通过，确认两项 Action 均为 `v5`、`node-version` 仍为 `22`，且未残留 `checkout@v4` 或 `setup-node@v4`。
- 未执行编译或线上部署验证，等待明确授权。
