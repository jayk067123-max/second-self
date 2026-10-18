# 设计令牌（Design Tokens）· 给映像官对视频配色用

> 唯一真源：`src/app/globals.css` 的 `@theme` 块（改配色只改那里，本文是快照）。
> 快照时间：2026-10-18 · 对应 `globals.css` 当前版本。
> 用法：视频封面/片头/架构图取色请直接用下表 HEX，避免"代码是这套、视频是另一套"。

## 1. 品牌与强调色

| 令牌 | HEX | 用途 |
|---|---|---|
| `brand-500` | `#5B8CFF` | 主操作按钮、主强调、进度环主色 |
| `brand-400` | `#7BA4FF` | hover / 高亮文字（"排成能执行的一天"） |
| `brand-600` | `#3F6FE0` | active、渐变深端 |
| `brand-300` | `#A9C2FF` | 深底上的次要强调 |
| `brand-700` | `#2F55B4` | 阴影/描边深色 |
| `accent-400` | `#4FE3C1` | 分身「满血」态、成功数据、demo 模式标签 |
| `accent-500` | `#2FCFAE` | accent 深端 |
| `accent-300` | `#8BF0DC` | 浅色点缀 |

## 2. 语义色（状态三态与提示）

| 令牌 | HEX | 语义 |
|---|---|---|
| `ok-400` | `#63D98A` | 通过 / 无冲突 |
| `ok-500` | `#3FBF6A` | 深端 |
| `warn-400` | `#FFCC66` | 分身「疲惫」态、缓冲不足、待确认行 |
| `warn-500` | `#F0A92E` | 深端 |
| `danger-400` | `#FF7A85` | 分身「超载」态、时间重叠红带 |
| `danger-500` | `#E84B5C` | 深端 / 红色重叠带描边 |

## 3. 中性色（深色底）

| 令牌 | HEX | 用途 |
|---|---|---|
| `ink-950` | `#070B12` | 页面底色（视频背景建议一致，方便叠加录屏） |
| `ink-900` | `#0B1220` | 卡片底 |
| `ink-800` | `#111A2B` | 面板底 / 次级按钮 |
| `ink-700` | `#1B2740` | 描边、分隔线 |
| `ink-600` | `#2A3A58` | 弱描边 |
| `ink-400` | `#6B7F9E` | 次要文字 / 占位符 |
| `ink-300` | `#93A5BF` | 正文次级 |
| `ink-200` | `#B9C6D8` | 正文 |
| `ink-100` | `#DBE4F0` | 主文字 |
| `ink-50` | `#EEF3FA` | 标题 |

## 4. 字号层级

| 令牌 | 字号 / 行高 | 用途 |
|---|---|---|
| `text-display` | 3.25rem / 1.06，字距 -0.03em | 落地页主标题 |
| `text-title` | 1.75rem / 1.22，字距 -0.02em | 区块标题 |
| `text-section` | 1.125rem / 1.4 | 卡片标题 |
| `text-body` | 0.9375rem / 1.65 | 正文 |
| `text-caption` | 0.8125rem / 1.5 | 说明文字 |
| `text-micro` | 0.75rem / 1.45 | 辅助/时间戳 |

字体栈：`"Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`；等宽 `"Cascadia Code", "JetBrains Mono", Consolas, monospace`。（用系统字体，无网络依赖，录屏不受字体加载影响。）

## 5. 圆角 / 阴影 / 间距

| 令牌 | 值 |
|---|---|
| `radius-xs` | 0.375rem |
| `radius-sm` | 0.5rem |
| `radius-md` | 0.75rem |
| `radius-card` | 1.25rem |
| `radius-pill` | 999px |
| `shadow-card` | `inset 0 1px 0 0 rgb(255 255 255 / 0.05), 0 18px 40px -24px rgb(0 0 0 / 0.85)` |
| `shadow-pop` | `0 24px 60px -20px rgb(0 0 0 / 0.9)` |
| `shadow-glow` | `0 0 0 1px rgb(91 140 255 / 0.35), 0 12px 32px -16px rgb(91 140 255 / 0.55)` |
| `spacing-gutter` | 1.5rem（页面左右留白） |

## 6. 分身三态配色（截图/动效对齐用）

| 状态 | 主色 | 圆环 | 呼吸周期 |
|---|---|---|---|
| 满血 `energized` | `#4FE3C1` | 同主色 | 3.6s |
| 疲惫 `tired` | `#FFCC66` | 同主色 | 6.0s |
| 超载 `overloaded` | `#FF7A85` | 同主色 | 1.6s |

进度环：`stroke-width 7`（视口 120×120，半径 52），从 -90° 起画。
