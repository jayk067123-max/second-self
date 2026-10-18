# src/store —— 客户端状态层

## 职责
跨组件的客户端状态（任务集合、撤销快照）。用 zustand + persist 存 localStorage。

## 允许依赖
- `zustand`、`zod`
- `src/domain`（契约与纯函数，例如写回用的 `applyPlan`）

## 禁止
- 禁止 import `src/data`（数据访问层）与 `src/ai`
- 禁止在 store 里做网络请求：请求由组件发起，结果再交给 store
- 禁止跳过 zod 直接写状态

## 两条硬规则
1. **写入前校验**：`addDrafts` / `updateTask` / `applyPlanWithSnapshot` 都先 `safeParse`，失败即拒绝并返回可读原因。
2. **读取也校验**：persist 的 `merge` 会对 localStorage 里的旧数据再校验一次，脏数据直接丢弃回落到空状态，而不是让页面崩。

## 水合
`skipHydration: true` + `usePlannerHydration()`：SSR 时不读 localStorage，挂载后再水合，避免 hydration mismatch。
