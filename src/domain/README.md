# src/domain —— 业务逻辑层（纯函数）

## 职责
业务规则、算法、数据结构契约。可单测，且**必须**有单测。

## 允许依赖
- `zod`
- `src/shared`

## 禁止
- 禁止 IO：`fetch`、`fs`、数据库
- 禁止 `Date.now()` / `Math.random()` 直接出现在算法里（时间与随机数由调用方注入参数，保证可测）
- 禁止 import React 或任何 UI 库
- 禁止 import `src/data`、`src/ai`、`src/ui`

## 约定
- `schemas/`：所有跨边界数据（API DTO、AI 输出、表单）的 zod 契约，一处定义、多处复用
- 其余文件按业务概念命名（`conflicts.ts`、`paper.ts` 等），导出纯函数
- 单测放 `tests/domain/`，覆盖边界条件（空值、极值、重叠端点）
