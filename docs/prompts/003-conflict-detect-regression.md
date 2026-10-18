# 003 · 冲突检测规则实现与两处回归

- 日期：2026-10-18
- 编号性质：**核心功能链 #2 of 3**（002 解析 / 003 冲突检测 / 004 重排方案）
- 执行方：逻辑手 ｜ 关联方：全栈手（调用方被契约变更波及）
- 对应提交主题：`feat(domain): 冲突检测四规则 + 重排本地裁决 + 快照栈回滚`（待提）
- 记录性质：**真实记录**。§4 的失败输出由**执行者本人提供原文**（Bot 协作消息，2026-10-18），Prompt官标注来源、未二次编造；§2 下发指令原文由执行者保存并已逐字归档（2026-10-18 补齐）。

## 1. 意图卡（发 Prompt 前填）

| 项 | 内容 |
|---|---|
| **目标** | 在 `src/domain` 实现冲突检测纯函数：时间重叠、缓冲/通勤不足、单日超载、deadline 逼近（四类），带 `severity` 与 `evidence`，`now` 由调用方注入；配 vitest 覆盖边界（首尾相接、跨天、零时长）。**不碰 UI、不碰解析、不碰重排。** |
| **上下文** | ①规则真源：`docs/SPEC-冲突检测与重排交互.md` 的 `rules/v1` 与默认配置（缓冲 30 / 同地点 10 / 跨校区 60 / 容差 5；日容量 600 分钟）②期望结果：`EXPECTED-2026-10-19.md` §二（3 条冲突 C1–C3）与 §三「必须不报」清单（**口径修正 2026-10-18**：本卡初稿写作「5 条误报红线」，两处都对不上——§三 现为 6 条编号项，固化成 `demo-seed.test.ts` 的是 4 条红线；详见 §5）③测试夹具：`tests/domain/support/tasks.ts`，时钟 `DEMO_NOW = 2026-10-19T09:00+08:00` ④架构：`src/domain` 纯函数层，无 IO / 无 React / 无时钟副作用 |
| **约束** | ①`detectConflicts(tasks, config, now)` 三参必填，**不传就类型报错** ②区间语义用半开 `[a,b)`：首尾相接不算重叠 ③同输入三次结果一致（纯函数、无随机）④所有阈值从 `config` 读，**不许在函数里写死** ⑤`severity` 与 `evidence` 必须可解释（供 UI 与人话文案）⑥只依赖 `zod` 与同层文件 |
| **禁止事项** | ①不许内部读 `Date.now()` / `new Date()` ②不许 import 上层（`data` / `ai` / React / IO）③不许把阈值硬编码（写死即视为未实现配置项）④不许改 001 冻结字段的名字与类型 ⑤不许静默降级 severity 或吞掉冲突 ⑥不许在本轮改解析链路与重排算法 |
| **验收标准** | ① 单测覆盖首尾相接 / 跨天 / 零时长三类边界 ② `EXPECTED` §二 的 C1–C3 三条全部命中，数值与 `humanMessage` 可用 ③「必须不报」一条都不误报（`EXPECTED` §三 6 条 / `demo-seed.test.ts` 4 条红线，映射见 §5） ④ `npm run verify` 通过 ⑤ 阈值真的可配：把同地点要求提到 30 分钟时，10 分钟间隔必须报 |
| **本轮求助点** | 只要冲突检测与可解释的 evidence；不要顺手做重排方案、不要动 UI 视觉。 |

## 2. 我的 Prompt（原文）

| 项 | 内容 |
|---|---|
| 下发方 | 主Bot（用户授权代理人） |
| 下发时间 | 2026-10-18 |
| 下发渠道 | Bot 团队协作消息 → 逻辑手 |
| 记录方式 | **逐字粘贴，未润色**；由执行者（逻辑手）保留原文，Prompt官归档 |
| 适用范围 | 这条是 **003 与 004 的共同上游指令**（一次下发、按交付顺序分三批落地），004 只额外补了一条"`reflow` 是今日最强产出"的追加指令 |

```text
开工。你和全栈手 并行，边界切干净，别越线。

你只负责这三个文件 + 对应单测：
- `src/domain/conflicts.ts`
- `src/domain/reflow.ts`
- `src/domain/snapshot.ts`
- `src/domain/schemas/` 下你需要的契约（Task / Conflict / ReflowPlan / Snapshot）
- `tests/domain/conflicts.test.ts`、`reflow.test.ts`、`snapshot.test.ts`

不要碰：`src/ui/`、`src/app/`、`src/data/`、`src/ai/`、`src/shared/constants.ts`、`src/domain/health.ts`、`src/domain/schemas/system.ts`、`next.config.ts`、`package.json`。这些全栈手 在管，你改了就是冲突。

先读这三份，读完再动手：
1. `docs/SPEC-冲突检测与重排交互.md` — 这是你的需求书，规则、默认参数、误报红线、11 条单测用例都在里面，照抄照做，不要自己发明规则。
2. `docs/ARCHITECTURE.md` §0 和 §2 — 架构主张和依赖铁律。
3. `docs/选题定义书.md` §0 红线。

三条不可协商：
1. 纯函数，`now` 参数注入，内部禁止 `Date.now()` / `Math.random()`。同输入多次调用必须完全一致——这条要给评委当可测性证据。
2. 区间用半开 `[a,b)`，首尾相接不算重叠，零间隔归"缓冲不足"报。一条冲突只能有一个来源，不许同一件事报两次。
3. 不执行任何 git 命令。改完文件通知我，交付官 提交。

交付顺序（做完一个报一个，别攒着）：
1. `conflicts.ts` + 单测（最重要，视频里那个红标就是它）
2. `reflow.ts` + 单测（LLM 输出的裁决者，把幻觉关进笼子的地方）
3. `snapshot.ts` + 单测（回滚 = 整体替换，不做反向 op）

每完成一个跑 `npm run verify`，把真实输出贴给我（成功失败都贴原文）。单测数量不设上限，但必须覆盖 SPEC 里那 11 条用例和这些边界：首尾相接、零时长任务、跨天任务（22:00–01:00）、done 任务不报、任务数 <3 时不判超载、差 2 分钟不报。
```

**这条指令的可核验之处（对照 §1 与 §4）**

1. "三条不可协商"里的**半开区间 `[a,b)`、`now` 注入、同输入一致**，与 §1 约束逐条对应；
2. "不要碰 `src/ui`/`src/app`/`src/data`/`src/ai`"是**显式文件级边界**——这也是后来"并行写冲突"能被快速定位的原因（谁越界一眼可查）；
3. 指令里的"必须覆盖……done 任务不报"直接对应 §4.4 那条真实回归——**边界是下发时就点名的，不是我事后补的**。


## 3. 实际产出（2026-10-18）

- 重写 `src/domain/conflicts.ts`（四类规则 + severity + evidence + ruleVersion + 注入 now）
- 新增 `src/domain/reflow.ts`、`src/domain/snapshot.ts`（归 004）
- 新增 `src/domain/schemas/conflict.ts`、`schemas/reflow.ts`、`schemas/snapshot.ts`
- 重写 `tests/domain/conflicts.test.ts`；新增 `tests/domain/reflow.test.ts`、`tests/domain/snapshot.test.ts`、`tests/domain/support/tasks.ts`
- 测试数量**不作断言**，以 `npm test` 输出为准

## 4. 我如何引导与修正（**真实回归，原文照录**）

> 以下三段失败输出**由执行者（逻辑手）提供原文**，非 Prompt官转述；标注来源：Bot 协作消息 · 2026-10-18。修复指令原文未留存，属记录缺口，已在其对应行标明。

### 4.1 回归一：配置项形同虚设（阈值写死）——**本卡最好的一段素材**

```text
FAIL  tests/domain/conflicts.test.ts > detectConflicts · 规则2 缓冲不足（buffer） > 阈值可配：把同地点要求提到 30 分钟后，10 分钟间隔就要报
AssertionError: expected [] to have a length of 1 but got +0
 ❯ tests/domain/conflicts.test.ts:175:21
    173|     const b = block(DAY, 10, 10, 11, 0, { location: "教室A" });
    174|     const buffers = only(detect([a, b], config), "buffer");
    175|     expect(buffers).toHaveLength(1);
    176|     expect(buffers[0]?.evidence.requiredMin).toBe(30);
```

- **现象**：接口看着有 `config`，用例把同地点要求提到 30 分钟后期望报一条 buffer，实际返回空数组。
- **定位**：`resolveVenue()` 里同地点/跨校区写死 10/60，没读 `config.gapMin.*`——阈值"看起来可配，实际不可配"。
- **修法**：`resolveVenue(a, b, config)` 传入配置。
- **为什么值钱**：这是**隐性 bug**，普通 happy-path 用例永远测不出来，只有"改配置再断言"才暴露。写技术文档时按"配置项形同虚设"这一类讲，比讲"少判一个 if"有力。

### 4.2 回归二：类型层红（上游类型改动顶红规则4）

```text
src/domain/conflicts.ts(577,18): error TS7053: Element implicitly has an 'any' type because expression of type 'number' can't be used to index type 'Record<1 | 3 | 2, PriorityBand>'.
src/domain/conflicts.ts(578,23): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ high: number; medium: number; low: number; }'.
```

- **现象**：单测可选绿，但 typecheck 红，卡在规则 4 的优先级查表。
- **定位**：schema 里 `priority` 是 `number`（受 min/max 约束），直接用它下标查 `PRIORITY_BAND` 越界。
- **修法**：加 `priorityBandOf(priority: number)` 做收敛后再查表。
- **性质归类**：**工程约束类红**（类型系统拦截），不是运行期故障——与 001 §5.1 那次 TS6133 同类。这类红必须与"功能错误"分开记，否则会夸大问题严重性。

### 4.3 回归三：并行写冲突（契约被重写，调用方被顶红）

- **现象**：逻辑手重写 `conflicts.ts`（四类规则 + severity + evidence + ruleVersion + 注入 now）期间，全栈手的 UI 与 planner 页调用方全部失效：`conflictType/severity/humanMessage` 不匹配、`detectConflicts` 签名变化，连带 3 处红（`resolveVenue` 写死 10/60/30 未读 config、`PRIORITY_BAND[task.priority]` TS7053、`scripts/parse.ts` 的 `arg` 可能 undefined）。
- **处置（全栈手自述）**：不以回滚自己的版本收场，而是**以新契约为准重写调用方**（`ConflictPanel` 换字段、planner 页改 `detectConflicts(tasks, DEFAULT_DETECT_CONFIG, now)`），修完 122 个单测（当时值）全绿。
- **判断依据（事后补记 · 2026-10-18 · 由全栈手本人回忆）**：
  1. **谁的契约该活，看规格不看先写**。冲突检测有 `docs/SPEC-冲突检测与重排交互.md` 与 `schemas/conflict.ts` 作为单一真源；逻辑手那版带 severity / evidence / ruleVersion / 注入 now，是照规格写的，而自己那版是早期草案（`kind/taskIds/minutes`），功能更弱。**回滚等于让仓库退回规格之前。**
  2. **一次性改调用方，比长期维护两套模型便宜**。回滚会让"两套冲突模型"同时存在，之后每轮都要对账，评审看到两份实现也会怀疑是拼接；而改调用方只有 3 处红 + 一个面板重写，且 `typecheck`/`lint`/单测能立刻证明改对了。
- **过程事实**：发现时**并不知道对方在并行写同一文件**，是 typecheck 突然红才察觉；第一动作是先跑 `lint`/`test` 把红点定位到"调用方"而非规则本身，然后才动代码。这条可作"怎么把 AI 拉回来"的叙事骨架。
- **为什么值钱**：这是**并行协作下的契约冲突**，不是单点 bug。真实开发里最常见、也最能体现"人怎么在多方同时改动时收敛"的一段。写技术文档建议单独立小节。

### 4.4 回归四：done 任务没被排除出重叠判定（**被真实演示数据抓出来的 bug**）

用例（seed 误报红线第 3 条）：把 `t_lab_meet` 标记为 done 后，`overlap` 冲突必须消失。

```text
 FAIL  tests/domain/demo-seed.test.ts > demo-seed · 4 条误报红线一条都不许踩 > ③ done 的任务不参与判定：把答辩准备标记完成后，overlap 消失
AssertionError: expected [ { …(9) } ] to have a length of +0 but got 1
Expected: 0
Received: 1
```

- **定位**：SPEC 写的是"已完成任务只作为'时间已占用'参与规则3的用量，不产生冲突"，而生成"发生序列"时没按 `done` 过滤，规则1/2 仍在给已完成任务报重叠。
- **修法**：规则1/2 吃 `!task.done` 的发生序列；规则3（超载）继续用全量。
- **为什么值钱**：这条不是手写单测造的，是**演示数据 `demo-seed.json` 直接当验收数据**抓出来的——即"测试直接读演示素材、不复制数据"，这是可复现性最硬的证据之一（见 §3.1）。

### 3.1 素材与测试的关系（可复现性证据）

`docs/demo-fixtures/demo-seed.json` 是项目里**唯一一份"验收数据即演示数据"**的素材：`tests/domain/demo-seed.test.ts` **直接读该文件**、不复制数据。所以"演示时看到的冲突与方案"与"单测断言的冲突与方案"是同一份数据来源，不存在两份各自变旧的副本。评委若要核"演示是不是摆拍"，这条就是答案。

## 5. 最终结果（可验证）

- 可运行证据：`npm test` 输出（以实际为准，不写死项数）+ `EXPECTED` §二 三条冲突对账
- 验收标准逐条对齐（**2026-10-18 21:37 由 Prompt官 本机自核，非转述**；树状态：工作区含未提交变更 / HEAD `e642be2`）：

| # | 验收标准 | 结论 | 怎么验（命令 → 看什么） |
|---|---|---|---|
| ① | 单测覆盖首尾相接 / 跨天 / 零时长三类边界 | ✅ | `npx vitest run tests/domain/conflicts.test.ts` → 用例名 `A1-1 首尾相接不算重叠：半开区间 [9,10) 与 [10,11) 交集为空`、`跨天任务与次日凌晨的任务的重叠也能识别（按真实时间戳，不按日历日分组）`、`零时长任务不产生缓冲判定（它没占用任何时刻）` 三条全绿 |
| ② | `EXPECTED` §二 C1–C3 三条全部命中 | ✅ | 加跑 `tests/domain/demo-seed.test.ts` → `冲突总数恰好 3 条，id 与 seed 的 expectedConflicts 完全一致`，且 `① 周三 19:00 两件事完全重合 → overlap high，overlapMin=120`、`② 周二 21:00 首尾相接 → 只出 buffer high（gap=0），不许再出 overlap`、`③ 周二超载 → overload medium，670 分钟超出 600 上限 70 分钟` |
| ③ | 「必须不报」一条都不误报 | ✅（口径修正，见下） | 固化在 `demo-seed.test.ts` 的 4 条：`① 校运会志愿者 11:30 结束 → 启航兼职 13:00 开始：不报缓冲不足`、`② 10-19 只有 1 条任务，不判超载（任务数 < 3）`、`③ done 的任务不参与判定：把答辩准备标记完成后，overlap 消失`、`④ 线上例会 21:30 结束 → 大创讨论 22:00 开始：间隔 30 分钟不报` |
| ④ | `npm run verify` 通过 | ✅（脏树口径，三次实测见下） | `npm run verify` → `Test Files 21 passed (21)` / `Tests 310 passed (310)` / exit 0，时刻 **21:37:28**；**树不干净，按纪律只能记「工作区已验证」，不得写成「HEAD 已验证」** |
| ⑤ | 阈值真的可配：同地点提到 30 分钟时，10 分钟间隔必须报 | ✅ | `tests/domain/conflicts.test.ts` → `阈值可配：把同地点要求提到 30 分钟后，10 分钟间隔就要报` |

- **④ 的三次实测序列（同一条命令，半小时内三个值——这正是"用例数必须带时刻"的现场证据）**：

| 时刻 | HEAD | Test Files | Tests | 说明 |
|---|---|---|---|---|
| 21:37:28 | `e642be2` | 21 passed | **310** | Prompt官 自核 |
| 21:44:57 | `a46d9b4` | 20 passed | **299** | 全栈手 实测（同一时刻树上有 30 项未提交） |
| 21:45:19 | `a46d9b4` | 20 passed | **300** | 全栈手 复测（与上一行 22 秒之差，已追平） |
| 21:45:21 | `a46d9b4` | 20 passed | **300** | Prompt官 复测（与上一行同步） |

  数字**下降不是掉数**。执行方（全栈手）给的算式（2026-10-18 21:47 复核）：

  ```text
   310（删函数前）
   − 15（buildLocalPlans 及其 5 条用例 + reflow.test 里 10 条依赖旧导出的用例，按约定随函数退役）
   +  5（week-filter-integration 3→4、demo.test 兜底断言重写、timetable-reupload 新增 3 等的净增）
   ────
   = 300
  ```

  一句话口径：**「310 → 300 不是掉数：15 条按约定随两个函数退役删除，同期新增 5 条抵消了其中一部分，净减 10 条。」** 注意别说成"同期新增用例抵消了 10 条"——抵消的是 5 条，10 是**净减**，两个数各归各位，说反了就会被追问"到底删了几条"。
  `299` 是 21:44:57 的瞬时值：约一秒后 `week-filter-integration` 从 3 条变 4 条（逻辑手 补的"不注入时不过滤"）。**引用时一律写"时刻 + HEAD + 两行原样"，禁止单独引用 310 / 299 / 300 中的任何一个当"本项目的用例数"。**
- **③ 的口径修正（2026-10-18 自核发现）**：本卡 §1 与 §2 初稿写的「必须不报的 5 条误报红线」，**这个 5 两处都对不上**——`EXPECTED-2026-10-19.md` §三 现为 **6 条编号项**（含 `notice.txt` 零硬冲突、`needsReview` 项不进冲突判定与容量计算、两处更正取最终值），而固化成 `demo-seed.test.ts` 的是 **4 条红线**。三组数字不同源：6 是素材期望清单、4 是单测红线、5 是初稿笔误，**不可互引**。已按实测改口径。
- **上表坐标的有效期（必读）**：`21:37` 那一刻 HEAD 是 `e642be2`；同一批改动在 `21:38–21:39` 继续落地（`2de69ee` → `fe40e1c` → `009444c`），所以表中数字**只对那个时刻成立**，不是当前坐标。待树干净后由本卡 §5 ④ 换成「干净树 + 当时 HEAD」一行；在那之前引用必须连时刻一起引。
- 偏差说明：本轮**同时含 reflow / snapshot 的实现**（归 004），与"只做冲突检测"的意图卡边界不一致，按偏差记录

## 6. 经验沉淀

- 会变的数字别写死：测试数量以 `npm test` 输出为准。
- **"配置可配"必须有一条用例去改配置再断言**，否则等于没配——本轮最值钱的 bug 就是这么抓到的。
- 并行改动时，**以对方新契约为准重写自己的调用方**，比回滚更能保住进度；但前提是新契约有 schema 和单测兜底。
- **同名清单要先确认是同一张清单**：本轮我自己写的「必须不报的红线」就有 5 / 6 / 4 三个数在流传（初稿笔误 / `EXPECTED` §三 / `demo-seed.test.ts`）。**引用数量时写明它出自哪个文件、哪一种口径**，否则同一件事会有三个都"有出处"的值。
- **探查提交来源要看"第一次进这个文件"的提交，不是最后一次触碰**：`git log -S <字段> -- <文件>` 出多行时，最早那条才是引入，最新那条可能只是顺手追加了别的字段。

## 7. 证据附件

- 截图/录屏目录：`05-Prompt与演进记录/003-冲突检测与重排/`（待建）
- 附件清单：三段失败输出原文（已内嵌 §4）；终端截图待补

## 8. 提交对账

> 不写死 hash，10-26 由交付官出 `docs/COMMIT-MAP.md`。

| 类型 | 提交主题 | 说明 |
|---|---|---|
| 实现（已提·跨链） | `27449e2 feat: 界面外壳与数据可移植导出` | **跨链合并提交，不是纯 003 成果**：11 文件 +445/−78，含 `ConflictPanel` 116 行（003）、`DataPortability` 85 行（002/骨架）、`EmptyState/Skeleton/StatusBanner`（001 第 2 子步）、`planner/page.tsx` 122 行（001 第 5 子步）。**只引 003 相关内容时必须注明"同提交还有别的链"** |
| 实现（已提） | `8bb2d8d feat: 冲突检测纯函数与46项单测` | 冲突规则主体与单测；**`needsReview` 字段也是在这条进 `task.ts` 的**（`.default(false)`），不是 `27449e2` / `e40dc40` |
| 实现（待提） | `feat(domain): 冲突检测四规则 + 重排本地裁决 + 快照栈回滚 [prompt:003]` | 注意本条同时含 004 的内容，提交信息已如实写出 |

> **对账提醒（2026-10-18 核对，双方确认）**：`27449e2` 与 `e40dc40` **都没有动 `src/domain/schemas/task.ts`**（`git show --stat` 可核），所以「`needsReview` 随 27449e2/e40dc40 一并提交」的说法不成立。核验命令与结果：
>
> ```text
> $ git log --oneline -S "needsReview" -- src/domain/schemas/task.ts
> b5d1b51 feat(domain): 周次展开接入 repeat.weeks - 范围/单双周/排除周，开学前不产 occurrence
> 8bb2d8d feat: 冲突检测纯函数与46项单测
> ```
>
> 读法：**`8bb2d8d` 让 `needsReview` 进 `task.ts`**（`git show --stat 8bb2d8d` → `src/domain/schemas/task.ts | 60 +-`）；`b5d1b51` 是对同一文件的**第二次触碰**（追加 `repeat.weeks`），不是字段来源。全栈手 2026-10-18 复核后确认同一结论，「随 27449e2/e40dc40 一并提交」一句作废。**两行都不能写成"`needsReview` 由 `b5d1b51` 引入"**——那是把最后一次触碰当引入。
