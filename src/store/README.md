# src/store —— 客户端状态层

## 职责
跨组件的客户端状态（任务集合、撤销快照）。用 zustand + persist，落盘交给 `src/data` 的持久化适配层。

## 允许依赖
- `zustand`、`zod`
- `src/domain`（契约与纯函数，例如写回用的 `applyPlan`）
- `src/data`（持久化适配层：storage adapter / 迁移 / 导出信封）

## 禁止
- 禁止 import `src/ai`（AI 调用只允许在 server 侧与组件层发起）
- 禁止在 store 里做网络请求：请求由组件发起，结果再交给 store
- 禁止绕过适配层直接写 `window.localStorage`
- 禁止跳过 zod 直接写状态

## 三条硬规则
1. **写入前校验**：`addDrafts` / `updateTask` / `applyPlanWithSnapshot` / `importJson` 都先 `safeParse`，失败即拒绝并返回可读原因。
2. **读取也校验**：persist 的 `merge` 走 `data/migrate`（版本迁移 + zod），脏数据回落到空状态而不是让页面崩。
3. **可携带**：`exportJson` / `importJson` 走同一个信封契约（format + version + data），导入前先备份快照，导入后仍可撤销。

## 水合
`skipHydration: true` + `usePlannerHydration()`：SSR 时不读 localStorage，挂载后再水合，避免 hydration mismatch。
