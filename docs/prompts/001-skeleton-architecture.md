# 001 · 骨架搭建与六层目录结构落地

- 日期：2026-10-18
- 阶段：省赛预指导（截止 2026-10-31 15:00）
- AI 工具：DS Bot 赛队（全栈手）／底层模型：deepseek-flash
- 对应提交：`feat(skeleton): 六层目录骨架 [prompt:001]`（待提交）
- 关联文件：`.nvmrc` `package.json` `tsconfig.json` `next.config.ts` `postcss.config.mjs` `vitest.config.ts` `src/**` `docs/ARCHITECTURE.md`
- 记录性质：**真实记录**。§1 发 Prompt 前写；§2 指令原文逐字粘贴；§3 按落盘实测回填；§4 骨架 6 子步与 §5 验收逐项待真实产出回填，禁止提前编。

## 1. 意图卡（发 Prompt 前填）

| 项 | 内容 |
|---|---|
| **目标** | 为「第二自我」（日程冲突重排 + 数字分身）搭出可运行的空骨架：**六层目录结构**（`app / ui / domain / data / ai / shared`）落地、目录定型、开发/构建命令能跑通、首屏能打开不白屏。**本轮不写业务逻辑。** |
| **上下文** | ①项目现状：仓库已有 docs 规范与脚手架，无任何业务代码 ②选题已定：B 组 · 第二自我 · 方向 8 ③本卡编号 001，是"1 条地基链 + 3 条核心功能链"结构里的地基链，6 个子步在本卡 §4 逐条记 ④已定规范：`docs/prompts/TEMPLATE.md`、`RECORDING-GUIDE.md` |
| **约束** | ①技术栈一次定死，后续不换：Node 24.14.0 / Next.js 16.4.2 / React 19.3.1 / TypeScript 5.9.3（不用 7.x）/ Tailwind 4.3.3 / zod 4.6.7 / Zustand 5.0.15 / framer-motion 14.3.0 / openai 官方 SDK 7.38.0 / vitest 5.0.5；**data 层不引入任何服务端数据库** ②目录按六层：`src/app`（路由装配）`src/ui`（纯展示，不 fetch 不读 env）`src/domain`（纯函数+zod）`src/data`（**本地持久化适配层**：storage adapter + zustand persist + localStorage + JSON 导入导出；无服务端数据库、无迁移脚本、无 `db:push`）`src/ai`（AI 编排四道闸）`src/shared`，依赖方向铁律 5 条逐条可核对 ③一键启动 `npm ci && npm run dev`，零 API Key 时自动走 demo provider，全链路照常跑通且有提示 ④密钥只走 `.env`，禁止硬编码，`LLM_API_KEY` 不得出现在 `NEXT_PUBLIC_` 变量里 ⑤统一验收命令 `npm run verify` = typecheck && lint && test |
| **禁止事项** | ①不许写解析、冲突检测、重排等任何业务逻辑 ②不许接入真实 LLM 调用 ③不许引入未经确认的重型框架/依赖 ④**不许保留需要 node-gyp 编译的原生依赖（`better-sqlite3` / `drizzle-orm` / `drizzle-kit` 一律移除），评委机器装 VS Build Tools 会直接拖死 10 分钟复现** ⑤不许把 `.env` 或任何密钥提交进仓库 ⑥不许"顺手"改 docs 下的规范文件 |
| **验收标准** | ①`npm ci && npm run dev` 能起来，浏览器打开首屏无控制台报错 ②`src` 下六层目录齐全，每层至少一个占位文件且职责注释清楚，依赖方向不越界 ③未配 API Key 时自动走 demo 模式、有友好提示而非白屏 ④`npm run verify` 通过 ⑤`git status` 干净，无 `.env`、无 `node_modules` 进入版本库，且 `package.json` 依赖里不存在 `better-sqlite3` / `drizzle-*` |
| **本轮求助点** | 只要骨架与分层，不要顺手实现功能；架构有歧义时先问，不要自行拍板大改 |

> 已回填的事实：分层与依赖铁律取自 `docs/ARCHITECTURE.md`（**定稿 v1.0**，2026-10-18，13781 B / 123 行，主Bot 重写）。
> **已定口径（2026-10-18 拍板）**：①分层统一叫「六层目录结构」，不叫"四层" ②`data/` 层是**本地持久化适配层**，SQLite 方案已否决 ③骨架编号不拆 001a-001f，6 子步并入本卡 §4。
> **文档侧已闭环**：定稿 v1.0 已改为 B 单分支、§2 写明"立项口述四层、落盘展开六层"、数据层改为 `StorageAdapter` + `localStorage`。SQLite 仅出现在第 39 行（依赖移除原因）与第 157 行（ADR-1「背景：初版方案为 drizzle + better-sqlite3」），属**刻意保留的演进痕迹，不是口径错误**，可据此截图。

## 2. 我的 Prompt（原文）

**来源标注（决定这段材料的可信度，请勿改动）**

| 项 | 内容 |
|---|---|
| 下发方 | 主Bot（用户授权代理人） |
| 下发时间 | 2026-10-18 |
| 下发渠道 | Bot 团队协作消息 |
| 同批指令 | 本卡 §1「约束」是同一批次下发的另一条指令（工程基线与分层约束），与本 Prompt 同时到达全栈手 |
| 记录方式 | **逐字粘贴，未润色**。原文中的"四层分层"是当时措辞，与本项目最终口径「六层目录结构」不同，属真实演进痕迹，非笔误，保留原样（说明见 §6） |

> **轮次说明**：本卡 §2 是**第一轮**指令。紧随其后还有**第二轮补充指令**（只修订数据层，砍掉 drizzle + better-sqlite3），已单独归档为 `001b-data-layer-decision.md`。两条不合并——合并会打乱先后顺序，也会抹掉"人类第一次说粗、后来被事实修正"的痕迹。

```text
选题我拍了：B · 第二自我（方向8 个人效能与数字分身）—— 把你乱糟糟的课表/群通知/DDL 倒进去，它找冲突、给重排方案、写回时间轴，还有一个随完成度变化的极简数字分身。

骨架（Next.js + 四层分层 + 设计令牌 + /api/health）继续做，做完接着上 B 的核心，按这个顺序落地，每步一次提交：
1. 数据模型与 store（P0 地基）
Task 实体：id / title / start / end / durationMin / deadline / priority(1-3) / source(text|manual) / done / rawTextOrigin。用 zustand + persist 存 localStorage，契约用 zod 定义并在写入前校验。
2. 文本 → 任务结构化（这是 B 项目的命门，占 Prompt 链 #2）
粘贴框 → 服务端路由调 LLM → 强制结构化 JSON 输出（zod schema + 失败重试 1 次 + 解析失败返回可读错误）→ 前端必须有人工修正表格，让用户改错的行再确认入库。这一层不许"自动就信"。
3. 冲突检测（纯函数 + 单测，这是工程分）
三类冲突：时间重叠、通勤/缓冲不足（两条任务间隔 < 15 分钟）、单日总时长超阈值（默认 10 小时）。全部写成不依赖 React 的纯函数放业务层，配 vitest 单测覆盖边界（首尾相接算不算重叠、跨天任务、零时长）。
4. 重排建议
LLM 只负责"给方案和理由"，不许它算结果：输出 2-3 套时间块 JSON，本地做合法性校验（不重叠、不超阈值、不越界），非法就丢弃并提示。三套方案并排对比，用户选一个 → 一键写回 → 支持撤销（保留上一版快照）。
5. 今日视图 + 数字分身
极简几何形象（SVG/纯 CSS + framer-motion），不做 3D 不做人物立绘。分身状态由完成度和当日负载驱动：满血/疲惫/超载三态 + 进度环 + 呼吸动效。加一个"今日播报"文字条。
6. AI 响应状态
全程要有流式或分步状态提示（解析中/校验中/重排中），错误态给人话不说 stack trace。
```

**这条 Prompt 的意图拆解（记录，便于对照验收）**

1. 选题由人拍板，AI 不参与选题决策；
2. "骨架"与"B 核心"分两段，每步一次提交 —— 这是本卡 6 子步并入一条链的来源；
3. 第 2 步「不许自动就信」= 人机权责边界写进了 Prompt，不是事后补的；
4. 第 3 步「纯函数 + 单测覆盖边界」= 工程分的具体落点；
5. 第 4 步「LLM 只给方案不许算结果 + 本地合法性校验」= 把 AI 幻觉关进笼子的核心约束；
6. 第 5 步「不做 3D 不做人物立绘」= 负面约束先于正面描述。

## 3. AI 的建议 / 产出（摘要 + 关键原文）

> 本节只写**已落盘可核对**的事实，标注复核时间。

### 3.1 架构方案：六层目录 + 依赖方向铁律

分层（取自 `docs/ARCHITECTURE.md` 定稿 v1.0 §2）：

| 层 | 职责 |
|---|---|
| `src/app` | 路由与页面装配层：只做组装与渲染，不写业务判断；`api/ai/[task]/route.ts` 是唯一出网口 |
| `src/ui` | 展示层：纯 props 组件，不 fetch、不读 env、不含算法（`primitives/` + `composites/`） |
| `src/domain` | 业务逻辑层：纯函数 + zod schema，无 IO、无 React、无时间/随机副作用 |
| `src/data` | 本地持久化适配层：`StorageAdapter` 接口（save/load/export/import）+ `local-adapter.ts`（localStorage 实现，zustand persist 挂载点） |
| `src/ai` | AI 编排层：prompt 组装、调用、校验、重试、降级（`guarded.ts` 为四道闸核心） |
| `src/shared` | 常量、类型、无副作用工具 |

依赖方向铁律（逐字抄原文）：
1. `src/app` → `src/ui` / `src/domain` / `src/data` / `src/ai`，只往下调。
2. `src/ui` 只依赖 `src/domain`（schema/类型）与 `src/shared`；**不得** import `data` 或 `ai`。
3. `src/domain` 不 import 任何其他层（含 `zod` 之外的三方库）。
4. `src/data`、`src/ai` 只被 `src/app`（server 侧）调用，不在客户端组件里出现。
5. 密钥只在 server 侧读取：`LLM_API_KEY` 不出现在任何以 `NEXT_PUBLIC_` 前缀的变量里，也不进客户端 bundle。

### 3.2 落盘实测（2026-10-18 复核）

工程基线第 1 步：`.nvmrc`（`24.14.0`）、`package.json`、`package-lock.json`、`tsconfig.json`、`next.config.ts`、`postcss.config.mjs`、`eslint.config.mjs`、`vitest.config.ts`

`src/` 骨架占位（首轮 14 个文件）：`ai/index.ts`、`app/globals.css`、`data/index.ts`、`data/README.md`、`domain/health.ts`、`domain/index.ts`、`domain/README.md`、`domain/schemas/system.ts`、`shared/constants.ts`、`shared/index.ts`、`shared/utils.ts`、`ui/composites/HealthPanel.tsx`、`ui/primitives/{Badge,Button,Card}.tsx`、`ui/primitives/index.ts`

> 之后 16:10 复核发现 `src/domain` 已新增 `schemas/task.ts`、`conflicts.ts`、`planner.ts`、`time.ts`、`avatar.ts` —— 这些属 **002/003/004 三条核心链**，不计入 001 骨架轮，只在对应卡里记。

**复核结论表**

| 项 | 结论 |
|---|---|
| `package-lock.json` | ✅ 已生成 |
| `eslint.config.mjs` | ✅ 已补齐 |
| `node_modules` | ✅ 已安装 |
| `npm run verify` | ✅ 通过（原始输出见 §5） |
| `better-sqlite3` / `drizzle-orm` / `drizzle-kit` / `@types/better-sqlite3` | ✅ 已从 `package.json` 移除，grep 无残留 |
| `ARCHITECTURE.md` 数据层口径 | ✅ 定稿 v1.0 已改 `StorageAdapter` + `localStorage` |
| `src/data` 适配层代码本体 | ⬜ **仍未落盘**：`src/data/` 只有 `index.ts`（`DATA_LAYER_READY = true`）与 `README.md`，`storage.ts` / `local-adapter.ts` 尚未创建；`index.ts` 注释仍写「drizzle 裸行」「SQLite 单文件位于 data/app.db」 |

### 3.3 真实取舍（有原文证据的三条）

1. **TypeScript 锁 5.9.3，不用 7.0.2**。原文理由：「不用 7.0.2：原生编译器刚换代，评委机器上风险 > 收益」。
2. **不用 Vercel AI SDK，改用官方 `openai` SDK 薄封装**。原文理由：「v7 迭代快、错误形态不透明，而本次评分看重"把 AI 幻觉关进笼子"的过程留痕，重试/校验/降级必须自己写才讲得清。用官方 SDK 薄封装，逻辑可见。」
3. 复现性保底：零 `LLM_API_KEY` 时切 `demo` provider，返回结构合法的固定 mock，全链路照常走通。验收命令统一 `npm run verify`。

### 3.4 选型收敛（技术文档第 3 章样本素材）

**决策**：`data/` 层走**本地持久化适配层**（`StorageAdapter` + zustand persist + localStorage + JSON 导入导出），无服务端数据库、无迁移脚本、无 `db:push`。
**理由（精确口径，与 `ARCHITECTURE.md` §1 第 39 行 / ADR-1 一致）**：`better-sqlite3` 确实提供预编译包，所以"装上它一定要编译"是错的；真正的风险是预编译产物与 Node 版本、运行平台强绑定，版本不匹配时安装会回退到本地编译，那时才需要 node-gyp + Visual Studio Build Tools，在评委机器上属于不可控失败。
**理由（用户原始粗口径，保留于 `001b-data-layer-decision.md` §2，勿改）**：指令原话是"评委机器上没预编译包就要 node-gyp + Visual Studio Build Tools"——该措辞已于 2026-10-18 在 `ARCHITECTURE.md` ADR-1 中精化，指令原文不动。
**当前状态（2026-10-18 16:10 复核）——依赖层已收敛，实现层未开始**：

- ✅ 依赖层：四个依赖已删除（`npm install` 重跑 `removed 15 packages`），lock 已重生成，grep 无残留。
- ✅ 文档层：`ARCHITECTURE.md` 定稿 v1.0 已写入 `StorageAdapter` + `local-adapter.ts` 方案；SQLite 仅作为 ADR-1 背景保留（第 157 行），属刻意留的演进痕迹。
- ✅ 集成：`npm run verify` 通过（2026-10-18 16:10 复核：6 文件 65 项全绿，输出见 §5.2）。
- ⬜ 实现层：`src/data/storage.ts` / `local-adapter.ts` 尚未创建，`src/data/index.ts` 仍是占位导出且注释仍写 SQLite。

> 结论口径：**技术选型已在依赖层与文档层收敛完成，实现层尚未开始**。可以证明"AI 给的 SQLite 方案被人类否决并从依赖里清掉"，**不能**声称"适配层已实现"。

### 3.5 已闭环项

`ARCHITECTURE.md` 曾写「选题（A/B）未定」「尚未提交」，现已由主Bot 重写为定稿 v1.0（B 单分支、状态"定稿"），闭环。

## 4. 我如何引导与修正

> 本轮按"6 子步并入 §4"记录（不拆 001a-001f）。下表第 1 行是**已拍板的技术选型收敛**，其余行等 6 子步真实跑完后逐条补。
> **填写纪律**：每行对应一次**实际提交主题**（不写 hash），跑通 `npm run verify` 才填；哪一步没做、或做了没通过，就如实写「缺口：未完成 / 未通过」，**不许补齐成漂亮的六行**。

| # | 现象（AI 写歪/报错/跑不通） | 我的判断 | 我下的指令（原文） | 结果 |
|---|---|---|---|---|
| 1（子步1·选型） | AI 给出的数据层方案是 `drizzle-orm + better-sqlite3` 单文件 SQLite | 方案本身能跑，但**评的是 10 分钟复现**：`better-sqlite3` 是原生模块，评委机器上需 node-gyp + VS Build Tools 编译，装不上就白屏，复现风险远大于收益 | 「砍掉 drizzle + better-sqlite3，`data/` 层改成本地持久化适配层（storage adapter + zustand persist + localStorage + JSON 导入导出），不要服务端数据库、不要迁移脚本、不要 `db:push`。」（**逐字原文已归档到 `001b-data-layer-decision.md` §2，含下发方/时间/渠道标注**） | **依赖层 + 文档层已落盘**；**适配层代码待落盘**（见 §3.4、001b §5） |
| 2（子步5·AI 编排） | `npm run verify` 在 typecheck 阶段报 `src/ai/tasks.ts(191,3): error TS6133: 'input' is declared but its value is never read.` | 工作区在 `e7bc43c` 之后又往前走了，新落盘的 `src/ai/*` 未过 typecheck；单测 54/54 仍绿，说明问题只在类型层，不影响逻辑正确性 | **事后补记 · 2026-10-18 · 由修复者本人回忆**（待回填：现象 / 定位 / 改法 三行） | **已修复**：16:10 复核 6 文件 65 项全绿，红→绿全过程记录在 §5.1 / §5.2 |
| 3-6 | 待 6 子步真实跑完后补 | | | |

## 5. 最终结果（可验证）

- 可运行证据：2026-10-18 16:05，由 Prompt官在仓库根目录实跑 `npm run verify`，**原始输出**：

```text
> vibe-coding-2026@0.1.0 verify
> npm run typecheck && npm run lint && npm run test

> vibe-coding-2026@0.1.0 typecheck
> tsc --noEmit
                              （无输出，通过）

> vibe-coding-2026@0.1.0 lint
> eslint .
                              （无输出，通过）

> vibe-coding-2026@0.1.0 test
> vitest run

 RUN  v5.0.5 <仓库根>            （原文为绝对路径，已按仓库规范替换为相对形式）

 ✓ tests/ai/mode.test.ts (3 tests) 4ms
 ✓ tests/domain/health.test.ts (9 tests) 13ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
   Start at  16:05:31
   Duration  450ms (import 68%, transform 20%, tests 6%, worker 5%)
```

- 验收标准逐条对齐：① ⬜（未跑 `npm ci && npm run dev` 取首屏截图）② ✅ 六层目录齐全（`app/ui/domain/data/ai/shared`）③ ◐ `tests/ai/mode.test.ts` 3 项 + `tests/ai/demo.test.ts` 11 项通过，证明 demo 模式有实现，但"白屏/友好提示"未在浏览器验证 ④ ✅ **16:10 复核通过**（6 文件 65 项；16:08 曾红，原始记录保留在 §5.1）⑤ ◐ 无 `.env`、无 SQLite 依赖；但工作区仍有未提交改动
- 偏差说明：`verify` 通过 ≠ 产品可用。首屏、demo 模式提示、`npm ci` 全新安装三项仍待真实浏览器与干净环境验证，未做就记为未做。

### 5.1 二次复核（2026-10-18 16:08，**记录一次真实的红**）

三条提交落地后（`c5ac80d` / `cf1b37a` / `e7bc43c`），交付官报"5 文件 54 项全绿"。我复核结果分两半，**不整句照抄**：

单测确实全绿（`npm run test` 原文）：

```text
 ✓ tests/ai/mode.test.ts (3 tests) 5ms
 ✓ tests/domain/health.test.ts (9 tests) 12ms
 ✓ tests/domain/avatar.test.ts (9 tests) 12ms
 ✓ tests/domain/planner.test.ts (15 tests) 13ms
 ✓ tests/domain/conflicts.test.ts (18 tests) 16ms

 Test Files  5 passed (5)
      Tests  54 passed (54)
   Start at  16:08:46
   Duration  464ms
```

但 `npm run verify` **整体是红的**，卡在第一步 typecheck：

```text
> vibe-coding-2026@0.1.0 typecheck
> tsc --noEmit

src/ai/tasks.ts(191,3): error TS6133: 'input' is declared but its value is never read.

[exit code: 1]
```

**判断**：不是提交内容有问题，而是**工作区在提交之后又往前走了**——`src/ai/{client,demo,guarded,prompts,tasks}.ts` 是提交后才落盘的未跟踪文件，其中 `tasks.ts` 有一个未使用的参数。所以：

- 交付官那句"verify 全绿"对 `e7bc43c` 那个时刻成立，但对**当前工作区不成立**；
- 001 的验收④以**当前工作区**为准，记 ⬜（红）；
- 这条红本身是有价值的留痕：它证明验收是每次实跑出来的，不是抄别人的结论。

**待办**：`src/ai/tasks.ts:191` 的未使用参数需由落地方修掉（删除或补用），修完重跑 `npm run verify` 再回填本节。

### 5.2 三次复核（2026-10-18 16:10，**红转绿**）

上面那个 typecheck 报错已被修掉，重跑 `npm run verify` 全绿，输出原文：

```text
> npm run typecheck && npm run lint && npm run test

> tsc --noEmit
> eslint .
                              （均无输出，通过）

 RUN  v5.0.5 <仓库根>

 ✓ tests/ai/mode.test.ts (3 tests) 10ms
 ✓ tests/domain/health.test.ts (9 tests) 29ms
 ✓ tests/domain/conflicts.test.ts (18 tests) 28ms
 ✓ tests/domain/avatar.test.ts (9 tests) 25ms
 ✓ tests/domain/planner.test.ts (15 tests) 24ms
 ✓ tests/ai/demo.test.ts (11 tests) 17ms

 Test Files  6 passed (6)
      Tests  65 passed (65)
   Start at  16:10:02
   Duration  1.39s
```

**三次复核对比（同一命令、同一工作区、相隔 5 分钟）**

| 时刻 | 单测 | 整体 verify | 触发变化的原因 |
|---|---|---|---|
| 16:05 | 2 文件 / 12 项 | ✅ 绿 | 骨架基线刚补齐 |
| 16:08 | 5 文件 / 54 项 | ❌ 红（TS6133） | `src/ai/*` 在新提交后落盘，`tasks.ts` 带一个未使用参数 |
| 16:10 | 6 文件 / 65 项 | ✅ 绿 | 该参数已修掉，`tests/ai/demo.test.ts` 同时新增 11 项 |

> 这条链路本身是可复现性的证据：**同一份验收命令在 5 分钟内经历过绿→红→绿**，每次都是实跑，没有一次是抄别人的结论。红的那段保留在 §5.1，不删不覆盖。

## 6. 经验沉淀

- 骨架轮的 Prompt 里，最该提前写死的是：**「评委机器复现成本」这条硬约束**——技术选型先问"零环境能不能装上"，再问"好不好写"，否则 AI 会选工程上更漂亮但装不上的方案。
- **叫法为什么从"四层"收敛成"六层"**：§2 原文写的是"Next.js + 四层分层"，那是下发时的粗略叫法，指的是"路由 / 展示 / 业务 / 数据"四个**概念层**。落盘时展开成 `app / ui / domain / data / ai / shared` **六个实际目录**：概念层里没有位置的"AI 编排"单独成层（它是本项目的风险核心，不该塞进业务层），"shared"是无层级归属的横切目录。所以最终口径定为「六层目录结构」——**这是按实际目录结构校正的演进结果，不是笔误，原文保留不改**。
- **留痕本身也要防"读旧版"**：本卡曾据 `ARCHITECTURE.md` 旧版（16:06 前）记下"仍写 SQLite 口径"，实际定稿 v1.0 已改。教训：引用别的 Bot 的文档前先看 `mtime` 与全文，别拿缓存印象当证据。

## 7. 证据附件

- 截图/录屏目录：`05-Prompt与演进记录/001-骨架架构/`（含必截清单，已加入「ARCHITECTURE 定稿全文截图」）
- 附件清单：待补

## 8. 提交对账

> **本表不写死 hash**：历史冻结前 hash 仍可能变。真实 hash 由交付官在 10-26 代码冻结时出 `docs/COMMIT-MAP.md` 一次性列全。

| 类型 | 提交主题 | 说明 |
|---|---|---|
| 归档（先于代码） | `docs(prompts): 建立Prompt模板与留痕规范` | 本卡与规范文件同批落地，属"先立卡、后实现"的正常顺序 |
| 实现（待提） | `chore: 锁定依赖与工程基线 [prompt:001]` | 骨架第 1 步工程基线：lock 已生成、eslint 配置已补、SQLite 四依赖已删、`npm run verify` 已通过 |

> 口径说明：本卡真实归属提交是「实现」那条；「归档」那条只是卡的载体。
> ⚠️ 历史变动留痕：本仓库 2026-10-18 发生过一次 `git reset` 重做提交，早前记录的 hash 已全部作废（架构文档一度回到未提交状态）。主Bot 已下历史冻结令：**从今往后禁止 reset / amend / rebase，只许往前加**。
