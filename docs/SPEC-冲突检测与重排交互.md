# SPEC · 冲突检测与重排交互（实现规格）

- 面向：全栈手（唯一实现依据）、映像官（交互与演示验收）、评委（可测性检查）
- 状态：v1.0 · 2026-10-18
- 上位文件：`docs/选题定义书.md`（红线与 P0 范围以该文件为准）
- 性质：**实现规格，不是产品文档**。规则必须可判定、可写单测；交互必须可验收。

---

## 0. 通用约定

### 0.1 数据模型（实现基准）

```ts
type Priority = 'high' | 'medium' | 'low';
type ConflictType = 'overlap' | 'buffer' | 'overload' | 'deadline';

interface Task {
  id: string;                 // uuid
  title: string;
  date: string;               // 'YYYY-MM-DD' 本地日
  start: string | null;       // 'HH:mm'；无具体时刻的任务为 null
  end: string | null;         // 'HH:mm'
  durationMin: number;        // 由 start/end 推导；跨天任务按 0.3 节切分后分别记
  deadline: string | null;    // ISO 本地时间，'2026-10-26T12:00'
  priority: Priority;
  location: string | null;
  locked: boolean;            // true = 固定块（课表/排班），重排不得移动
  flexible: boolean;          // true = 可顺延/可压缩
  progress?: number;          // 0-1，可缺省
  status: 'todo' | 'done';
  estateMin?: number;         // 完成该任务的估算工作量，缺省 = durationMin
}
```

### 0.2 检测函数签名（必须纯函数）

```ts
function detectConflicts(
  tasks: Task[],
  config: DetectConfig,
  now: Date           // 必须由调用方注入，函数内禁止 Date.now()
): Conflict[];
```

- 同样的输入必须得到同样的输出（顺序也稳定：先 severity，再时间）。
- 单次运行只读任务、不写任务、不调网络。

### 0.3 统一输出结构

```ts
interface Conflict {
  conflictId: string;               // `${conflictType}:${sortedTaskIds.join('+')}`
  conflictType: ConflictType;
  involvedTaskIds: string[];
  severity: 'high' | 'medium' | 'low';
  humanMessage: string;             // 中文，≤40 字，必须含数字锚点
  date: string;                     // 冲突归属日，用于时间轴定位
  evidence: Record<string, number | string>;  // 公式中间量，供解释与单测断言
  ruleVersion: 'rules/v1';
  detectedAt: string;               // = now.toISOString()
}
```

### 0.4 配置项（可调，默认值如下）

```ts
interface DetectConfig {
  gapMin: {                      // 规则2 缓冲
    default: 30;                 // 默认最小间隔（分钟）
    sameVenue: 10;               // 同地点
    crossCampus: 60;             // 跨校区/校外（location 含「校外/市区/鼓楼/西湖」等标签）
    tolerance: 5;                // 容差：差距 ≥ 所需-5 分钟不报
  };
  dayCapacityMin: 600;           // 规则3 每日硬性占用上限（10 小时）
  classLoadWarnMin: 480;         // 规则3 固定课满载预警（8 小时）
  overloadMinTasks: 3;           // 规则3 当日任务数 < 3 不判超载
  leadHours: { high: 72; medium: 48; low: 24 };   // 规则4 提前预警窗口
  minOverlapMin: 5;              // 规则1 小于等于 5 分钟的重叠降级不刷红
  maxCards: 5;                   // 冲突卡片最多 5 条，其余折叠
}
```

---

# A. 冲突检测 4 类规则

> 所有规则共享的输入：当日未完成（`status !== 'done'`）的任务。
> 已完成任务只作为"时间已占用"参与规则 3 的已用量计算，不产生冲突。

---

## A1. 时间重叠（overlap）

### 判定输入
两条同 `date`、均有 `start/end` 的任务 A、B。区间一律按**半开区间** `[start, end)` 处理。

### 判定公式

```
overlapMin = max(0, min(A.end, B.end) − max(A.start, B.start))
命中条件：overlapMin > 0
```

**首尾相接的定论：`09:00–10:00` 与 `10:00–11:00` 不算时间重叠冲突。**

理由（写进答辩口径）：

1. 区间数学上两项交集为空（长度 0），重叠的本质是"同一时刻被占两次"，首尾相接并不存在被占两次的时刻；
2. 真实课表/排班里首尾相接是高频率正常形态（8:00–9:40 接 10:00 是常态），若算冲突必然满屏红，触发误报红线；
3. "零间隔赶场"这个真实痛点由**规则 2 缓冲不足**负责捕获，一条冲突只出一个来源，避免同一件事被报两次。

### 分级
| severity | 条件 |
|---|---|
| high | `overlapMin ≥ 0.6 × min(A.durationMin, B.durationMin)`，或一方完全包含另一方 |
| medium | 其余 `overlapMin > minOverlapMin(5)` |
| low | `0 < overlapMin ≤ 5`（只记不红，灰点标记） |

### 误报红线
- 同一父任务拆分出的多个片段（拆课/分段排班，`parentId` 相同）互相之间不报；
- 任一方 `flexible === true` 且另一方 `locked === false` 时，降一档（可协商的占用）；
- `locked` 双方都 true 才允许出 high；
- 地点不同但跨天的任务不做重叠比较。

### humanMessage 模板
> `周三 14:00 的两件事完全重叠，你被安排了两次`

### 单测用例
| 用例 | 输入 | 期望 |
|---|---|---|
| A1-1 | 09:00–10:00 vs 10:00–11:00 | **0 条**（首尾相接不报，交给规则2） |
| A1-2 | 09:00–10:00 vs 09:30–10:30 | 1 条，medium，overlapMin=30 |
| A1-3 | 09:00–11:00 vs 09:30–10:00 | 1 条，high（完全包含） |
| A1-4 | 09:00–10:03 vs 10:00–11:00 | 1 条，low（3 分钟，灰点） |
| A1-5 | 同父任务两片段 09:00–10:00 / 10:00–11:00 | 0 条 |

---

## A2. 缓冲不足（buffer）

### 判定输入
同一 `date` 内按 `start` 排序后相邻的两条任务 A（前）、B（后），均有 `start/end`，且**不满足规则 1 命中条件**（gap ≥ 0）。若 gap < 0 已由规则 1 覆盖，本规则跳过，避免重复报。

### 判定公式

```
gapMin      = B.start − A.end            // 分钟；< 0 则跳过
requiredMin = 按地点表取值：
              A.location === B.location !== null  → sameVenue(10)
              任一 location 命中校外标签集合        → crossCampus(60)
              其余（含任一为 null）                → default(30)

命中条件：gapMin < requiredMin − tolerance(5)
```

即 `gapMin ∈ [0, requiredMin − 5)` 时命中。

### 分级
| severity | 条件 |
|---|---|
| high | `gapMin < 0.5 × requiredMin`（基本来不及） |
| medium | 其余命中情况 |
| low | 任一 `location` 为 null（信息不足，降一档且不刷红） |

### 误报红线
- 两条都 `flexible === true` → 不报（都能挪，报出来没意义）；
- `gapMin ≥ requiredMin − tolerance` → 不报（差 2 分钟不算，避免过度敏感）；
- 任一任务为全天任务 / 无 `start` → 不参与；
- 夜间时段（22:00 之后接次日 08:00 前）不套用缓冲，只按跨天常规间隔处理。

### humanMessage 模板
> `课程 10:00 结束，社团 10:05 开始，路上至少要 30 分钟`

### 单测用例
| 用例 | 输入 | 期望 |
|---|---|---|
| A2-1 | 09:00–10:00 教室A → 10:00–11:00 教室A | 1 条 medium（gap=0 < 10−5） |
| A2-2 | 09:00–10:00 教室A → 10:40–11:30 教室A | 0 条（gap=40 ≥ 5） |
| A2-3 | 09:00–10:00 校区A → 10:20–11:00 市区鼓楼 | 1 条 high（gap=20 < 30，required=60） |
| A2-4 | 两条均 flexible | 0 条 |
| A2-5 | 21:00–22:00 → 次日 08:00 起 | 0 条 |

---

## A3. 单日超载（overload）

### 判定输入
某个 `date` 当日**全部任务**（含已完成，用于已用量）。

### 判定公式

```
usedMin   = Σ 当日任务占用分钟（见切分规则）
availableMin = dayCapacityMin(600)
overMin   = usedMin − availableMin
命中条件：overMin > 0 且 当日任务数 ≥ overloadMinTasks(3)
固定课用量 classMin > classLoadWarnMin(480) → 另出一条 medium 预警（与超载可并存）
```

**跨天任务切分规则**：以本地日界 `00:00` 切分，两端分别计入各自日期；例 `22:00–01:00` → 当日 120 分钟 + 次日 60 分钟。无具体时刻的任务（纯 DDL/备忘）不计入 `usedMin`，只参与规则 4。

### 分级
| severity | 条件 |
|---|---|
| high | `overMin > 0.25 × capacity`（超 150 分钟以上） |
| medium | `0.10 × capacity < overMin ≤ 0.25 × capacity` |
| low | `0 < overMin ≤ 0.10 × capacity`（灰点，不刷红） |

### 误报红线
- 微任务不计：`durationMin < 15` 且 `location === null` 的任务从 `usedMin` 剔除（买饭、回消息这类）；
- 当日任务数 < 3 不判超载（单双任务排满不等于超载）；
- 已有 ≥1 个 `done` 任务时，按 `usedMin − 已完成分钟` 的剩余量判定（人已经做完一部分了）；
- 考试日/活动日等 `locked` 集中日，超载只出 medium，不出 high（不可抗）。

### 本项目补充定义 · `locked` 集中日降级（正式条款）

> **本项目补充定义**（不属于规则名称里的通用口径，由本项目定义并实现；逻辑手 已按此实现，两侧必须一致）

```
lockedMin = 当日所有 locked 任务的占用分钟之和
usedMinEff = usedMin − 当日已完成分钟
命中：lockedMin ≥ 0.5 × usedMinEff
效果：该日 overload 的 severity 上限锁为 medium，即使 overMin 已达 high 阈值也不得升到 high
```

- 理由：考试日、校运会、排班日这类"不可抗"的满载日，用户没有可操作空间，报 high 只会制造焦虑，不产生任何行动价值。
- 边界：`usedMinEff = 0` 时不触发；`lockedMin` 只统计 `date` 为当日、带具体时段的任务；纯 DDL 任务不计入。
- 输出：`evidence` 里必须同时带 `lockedMin`、`usedMinEff`、`lockRatio`（= lockedMin ÷ usedMinEff），便于 UI 解释"这天是考试日，没得挪"。

### humanMessage 模板
> `周三已排 11 小时 20 分，超出每天 10 小时上限 1 小时 20 分`

### 单测用例
| 用例 | 输入 | 期望 |
|---|---|---|
| A3-1 | 5 条任务共 700 分钟 | 1 条 medium（overMin=100） |
| A3-2 | 2 条任务共 800 分钟 | 0 条（任务数 < 3） |
| A3-3 | 3 条任务 900 分钟（含 1 条 done 120 分钟） | 1 条 **high**（扣除已完成 120 分钟后 overMin = 780 − 600 = 180 > 150） |

> 用例行**以分级表为准**，本条的数字只是举例；一旦两者冲突，改用例、不改分级表。
| A3-4 | 跨夜 22:00–01:00 | 当日 120 分钟，次日 60 分钟 |

---

## A4. 截止日逼近（deadline）

### 判定输入
带 `deadline` 且 `status !== 'done'` 的任务。

### 判定公式

```
remainH   = (deadline − now) / 3600
slackH    = remainH − estRemainH
            其中 estRemainH = Σ(该任务 estateMin ?? durationMin) / 60
            （若存在显式阻塞关系，累加阻塞任务估算；P0 可先不做阻塞图）

命中条件（任一）：
  slackH < 0                                        → high（已经排不下）
  remainH < leadHours[priority] 且 slackH ≥ 0       → medium
  remainH < 0                                       → high（已逾期）
```

`leadHours` 默认：high 72h / medium 48h / low 24h。

### 分级
| severity | 条件 |
|---|---|
| high | `slackH < 0` 或已逾期 |
| medium | 命中提前预警窗口但尚能排下 |
| low | `progress ≥ 0.8` 但仍未完成（进度已高，只是提醒，灰点） |

### 误报红线
- `deadline` 无具体时刻 → 视为当日 `23:59`；
- `status === 'done'` 或 `progress ≥ 0.8` → 最高只出 low，不刷红；
- 同一任务的「超载」与「截止」不同时刷两条红：若当日 `overload` 已为 high，该任务的 `deadline` 卡降为 medium（信息合并，避免红屏）。

### humanMessage 模板
> `「数据结构实验二」还有 2 天截止，但你已经排不下它了`

---

## A5. 全局去重、排序与上限

1. **同对任务去重**：A、B 同时命中 overlap 与 buffer → 只保留 overlap（更强），buffer 记入 `evidence.mergedInto`。
2. **排序**：severity（high→low）→ date → start 时间 → conflictType 固定序（overlap, buffer, overload, deadline）。
3. **上限**：卡片区最多展示 `maxCards=5` 条；其余折叠为「另外 N 条」可展开列表。
4. **同一条任务多冲突**：合并为一张卡片，右侧挂 badge（`重叠` `来不及` `超时`），不重复刷屏。

### 验收（全栈手自测门槛）
- 11 条单测用例全绿；
- 用 `docs/demo-fixtures/` 三份素材跑通解析 + 检测，无异常、无 0 分钟任务；
- 三次相同输入运行，输出 JSON 完全一致（确定性）。

---

# B. 重排方案差异高亮的交互规格

## B1. 概念与数据

```ts
interface Proposal {
  id: string;
  rank: 1 | 2 | 3;                // 1 为推荐
  label: string;                  // '最小改动' | '最优休息' | '最快收尾'
  ops: Op[];                      // move / resize / add / remove
  conflictsBefore: number;
  conflictsAfter: number;         // 必须由本地校验器实算，不信 LLM
  movedCount: number;
  deviationMin: number;           // Σ|newStart − baselineStart|
  lockedTouched: number;          // 必须恒为 0
  sacrifices: string[];           // ['周五 22:00 后仍有任务','周六早八被占用']
  rejected?: { reason: string }[] // 被校验器拒掉的 op 说明，仅调试可见
}
```

**校验器（本地，权威）**：任何 proposal 应用前必须逐条通过
`不重叠 / 不超日容量 / 不改 locked / 不违背 deadline 前置 / 时长 > 0`，
不通过的 op 丢弃并重试一次，仍不通过则该方案整体作废，不呈现给用户。

## B2. 差异的视觉编码（必须全局一致）

| 变更类型 | 时间轴上的画法 | 卡片上的标签 |
|---|---|---|
| **被移动** | 原位置留 30% 透明虚线"幽灵块"，新位置实块，两者用细虚线弧连接（移动距离 >1 小时时弧线带方向箭头） | `⇄ 挪了 90 分钟` |
| **新增**（如自动补出的准备时间） | 左侧 3px 绿色竖条 + 块内 `+` 角标 | `＋ 新增 45 分钟` |
| **删除** | 原位置红色 40% 透明块 + 删除线 | `− 已移除` |
| **时长变化** | 块上下缘加双向箭头带，长度差部分用斜纹填充 | `+15 分钟` / `−30 分钟` |
| **未变动** | 60% 透明度弱化，仅保留轮廓 | 无 |
| **仍存在冲突** | 保留红色脉冲条（不隐藏！） | `⚠ 还剩 1 个冲突` |

原则：**变化项必须比未变动项更"吵"**。用户扫一眼应能回答"它动了哪几条、动了多少"。

## B3. 方案卡片摘要（每卡固定 4 个数字 + 1 行牺牲项）

```
挪动 3 条   冲突 4→1   偏离原计划 70 分钟   固定课被挪 0 条
牺牲：周六早八被占用 · 周五 22:00 后仍有任务
```

- `冲突 4→1` 是核心指标，箭头配色：下降绿、持平灰、上升红（上升方案直接不展示）。
- `固定课被挪 0 条` 是信任指标，显示为绿色对勾；若非 0 则该方案作废（不应存在）。
- 推荐卡（rank=1）加 1px 高亮边框 + `推荐` 徽标，但**不默认选中**，避免用户随手点。

## B4. 并排布局与对比模式

- ≥1280px：2–3 列并排，同一纵向时间轴基准线对齐（关键：三列日期刻度必须对齐，便于横向比对）。
- 900–1280px：横向滚动，一次显示 2 列。
- <900px：纵向堆叠，每列顶部吸顶显示摘要数字。
- **对比模式**：点任一张方案的 `对比` → 左侧固定"当前计划"作为基线，右侧切换方案；鼠标悬停任一任务块，两列中同 id 任务同时高亮（联动），并浮层显示 `原：周三 14:00 → 新：周四 09:00`。
- 键盘：`←/→` 切换方案，`Enter` 接受，`Esc` 退出对比。无障碍不是加分项，是验收项。

## B5. 接受写回前的预览（confirm sheet）

点击 `应用这套方案` 后，先弹出确认层，内容必须是**变更清单**而不是"确定吗"：

```
将应用「最小改动」方案
───────────────────────────
⇄ 周三 14:00–15:40 社团例会 → 周三 19:00–20:40
⇄ 周四 09:00–10:40 数据结构 → 保留不动
＋ 新增 周三 18:20–19:00 前往活动室（缓冲）

风险：周五 22:00 后仍有 1 个任务
冲突：4 → 1
[返回对比]        [应用这套方案] ← 主按钮，文案不用"确定"
```

应用后动效：时间轴块 400ms 拼图位移，分身表情变化，顶部 toast `已应用 · 可回滚`（toast 内直接带 `回滚` 按钮，常驻 5 秒；之后从历史面板进入）。

## B6. 回滚点定义

- **每次 apply 前**创建快照，形成版本栈：
  ```ts
  interface Snapshot {
    snapshotId: string;
    parentSnapshotId: string | null;
    at: string;                 // ISO
    source: 'manual' | `proposal#${number}` | 'parse' | 'rollback';
    opSummary: string;          // '应用「最小改动」：挪 3 条'
    tasksState: Task[];         // 整体快照，不做反向 op
  }
  ```
- **回滚 = 整体替换 tasksState**，绝不靠反向 op 回放（反向 op 是最容易出错的一类代码）。
- 回滚动作本身也入栈（`source: 'rollback'`），因此支持"重做回滚"。
- 栈上限 20 个快照，超出丢弃最旧；P0 阶段不做跨会话持久化的历史。
- **保护条件**：若 apply 后用户手动编辑过任务且尚未生成新快照，回滚前必须二次确认：
  `将丢弃你刚才的 1 处手动修改，继续？`
- 历史面板：倒序列出 `时间 · 摘要 · 来源`，点击任一条可直接跳到该版本（time-travel 简版），当前版本高亮。

## B7. 交互验收清单（映像官 + 评委共用）

1. 首屏到"看到冲突"≤ 10 秒，且无需阅读任何说明文字；
2. 三个数字指标（挪动条数 / 冲突 X→Y / 偏离分钟）在任何屏幕宽度都可见；
3. 未变动项永远比变动项更弱（颜色、透明度、描边都满足）；
4. 对比模式悬停联动在同一帧内响应（无延迟等待）；
5. 接受后 400ms 内完成视觉位移，且 toast 内回滚按钮可点；
6. 回滚后时间轴 100% 还原，diff 验证：`JSON.stringify` 快照一致；
7. 全流程不出现聊天输入框、不出现必须联网才可用的按钮。

---

## C. 测试素材

见 `docs/demo-fixtures/`：

- **解析演示素材**：`docs/demo-fixtures/notice.txt`（436 字节 / 8 行；任务条数与期望值见 `EXPECTED-2026-10-19.md` 第一节，以冻结版实测为准，本文件不重复登记条数），用于 S3 镜头① 的粘贴解析演示；
- **冲突与方案演示数据**：`docs/demo-fixtures/demo-seed.json`（18 条 / 3 冲突），用于 S2 冲突画面、方案对比与固定块不被移动的验收；
- **回归素材**：`docs/demo-fixtures/04-排班混合-回归用.txt`（独立回归素材 · 15 条版，与当前 notice.txt 正文**不同**，带注释头），仅回归测试用，**禁止入镜**；
- **补充测试集**：`02-相对时间表达.txt`、`03-DDL轰炸.txt`，只给开发与回归；
- **期望结果表**：`EXPECTED-2026-10-19.md`，是单测与旁白的双重基准（**目标值，10-21 验证前不算实测**）。

锚定时间：**不是运行时 now，而是注入的 `DEMO_NOW = 2026-10-19T09:00+08:00`**（周一）。解析、检测、单测、录像全部使用该值；代码中禁止以 `Date.now()` / `new Date()` 作为默认时钟。原因与 10-27 录制日的逐条漂移证据见期望表第六节。
