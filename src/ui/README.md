# src/ui —— 展示层

## 职责
纯展示组件与组合件。输入 props，输出 DOM。

## 允许依赖
- `src/domain`（只用其 zod schema 与类型，做 props 约束）
- `src/shared`（常量、`cn` 等纯工具）
- `src/ui` 内部

## 禁止
- 禁止 `fetch` / `axios`：取数由 `src/app` 的 server 侧或专用 client 组合件负责，且必须收敛到一个文件
- 禁止读取 `process.env`（尤其密钥）
- 禁止 import `src/data`、`src/ai`
- 禁止在组件里写业务判定（区间重叠、分值合计等一律放 `src/domain` 纯函数）

## 约定
- `primitives/`：原子件（Button / Card / Badge），无状态
- `composites/`：组合件，可含交互状态；需要 hooks 时加 `"use client"`
- 颜色/字号/圆角一律用 `globals.css` 的令牌类名（`bg-brand-500`、`text-title`），不写十六进制色值
