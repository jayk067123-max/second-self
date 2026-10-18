# 规则 ↔ 用例对照表（domain 纯函数层）

- 用途：①技术文档第 3/5 章引用；②评委抽检"这条规则到底实现了没有"，30 秒内能验完。
- 口径：**一行一条规则**。判定条件写公式，不写自然语言解释；用例给"文件:行号"，行号对应当前 HEAD。
- 范围：只覆盖 `src/domain/` 的冲突检测、重排裁决、快照回滚。SPEC 的 B2–B5（视觉编码、对比模式、confirm sheet）属于 UI 层，不在本表。
- 所有用例都是纯函数单测：`now` 由参数注入，不读系统时钟，同一输入多次运行结果逐字节一致。

> 行号会随代码演进漂移。若对不上，**按用例名搜**即可（用例名在本表里是全文给出的）。

---

## A1 · 时间重叠（overlap）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| A1 输入 | 半开区间 `[start, end)`；`overlapMin = max(0, min(A.end,B.end) − max(A.start,B.start))` | A1-1 首尾相接不算重叠：半开区间 [9,10) 与 [10,11) 交集为空 | `conflicts.test.ts:36` |
| A1-1 | `overlapMin = 0`（09:00–10:00 vs 10:00–11:00）→ **不报 overlap**，转由规则2 报 buffer | 同上（同一用例内断言 overlap 0 条、buffer 1 条） | `conflicts.test.ts:36` |
| A1-2 | `0 < overlapMin ≤ 0.6×min(时长)` 且 `overlapMin > 5` → **medium** | A1-2 部分重叠 30 分钟判 medium，并给出重叠分钟数 | `conflicts.test.ts:45` |
| A1-3 | 一方完全包含另一方 → **high**（不要求 locked，主Bot 裁决 2026-10-18） | A1-3 一方完全包含另一方判 high（物理上没有可协商空间） | `conflicts.test.ts:54` |
| A1-4 | `0 < overlapMin ≤ minOverlapMin(5)` → **low**（灰点，不刷红） | A1-4 只重叠 3 分钟判 low（灰点，不刷红） | `conflicts.test.ts:63` |
| A1 误报红线 | 同一 `parentId` 的片段互相之间不报（重叠与缓冲都不报） | A1-5 同一父任务拆出的片段互相之间完全不报 | `conflicts.test.ts:72` |
| A1 输入 | 按真实时间戳判定，不按日历日分组（跨天段与次日凌晨段可比） | 跨天任务与次日凌晨的任务的重叠也能识别 | `conflicts.test.ts:78` |
| A1 误报红线 | 任一方 `flexible` 且另一方非 `locked` → 降一档 | 一方可顺延（flexible）且另一方不是固定块时降一档 | `conflicts.test.ts:86` |
| A1 分级 | 部分重叠的 high 只在双方都 `locked` 时给 | 部分重叠要两个固定块硬碰硬才刷红 | `conflicts.test.ts:93` |
| A1 验收 | 真实数据：10-21 19:00 完全重合 → high、`overlapMin=120` | ① 周三 19:00 两件事完全重合 → overlap high，overlapMin=120 | `demo-seed.test.ts:138` |

## A2 · 缓冲不足（buffer）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| A2 输入 | 同一本地日、按 `start` 排序后**相邻**两条，且不重叠（`gap ≥ 0`） | A2-1 同地点首尾相接 | `conflicts.test.ts:106` |
| A2-1 | 同地点（`location` 相同）→ `required=10`；`gap < 10−5` → **medium** | A2-1 同地点首尾相接：gap=0 < 10−5，判 medium | `conflicts.test.ts:106` |
| A2-2 | `gap ≥ required − 5` → 不报 | A2-2 同地点间隔 40 分钟：gap ≥ 10−5，不报 | `conflicts.test.ts:116` |
| A2-3 | 跨校区（含「校外/市区/鼓楼/西湖」）→ `required=60`；`gap < 30` → **high** | A2-3 跨校区 gap=20 低于 60 分钟通勤，判 high | `conflicts.test.ts:122` |
| A2 误报红线 | 两条都 `flexible` → 不报 | A2-4 两条都可顺延时不报 | `conflicts.test.ts:132` |
| A2 误报红线 | 夜间跨日（22:00 后接次日 08:00 前）不套缓冲 | A2-5 21:00 收工接次日 8:00：夜间不套用通勤缓冲 | `conflicts.test.ts:138` |
| A2 误报红线 | 容差 5 分钟：差 2 分钟不报 | 差 2 分钟不报（容差 5 分钟，避免过度敏感） | `conflicts.test.ts:144` |
| A2 分级 | 任一 `location` 为 null → **low**（信息不足降档且不刷红） | 地点未知时降为灰点 | `conflicts.test.ts:190` |
| A2 输入 | 零时长 / 无 `start` 的任务不参与 | 零时长任务不产生缓冲判定 | `conflicts.test.ts:198` |
| A2 配置 | 三档阈值可配（改 `sameVenue` 立刻改变判定） | 阈值可配：把同地点要求提到 30 分钟后，10 分钟间隔就要报 | `conflicts.test.ts:204` |
| **补充定义** | 同校区不同楼 `required = sameCampus(20)`（SPEC 只有三档） | 【本项目补充定义】同校区不同楼：间隔 20 分钟不报（三教105 → 三教201） | `conflicts.test.ts:154` |
| **补充定义** | 线上/远程 → 按 `default(30)` 计，不按同地点 10 计 | 【本项目补充定义】线上地点按默认 30 分钟算，不按同地点 10 分钟算 | `conflicts.test.ts:171` |
| **补充定义** | 线上 接 线下 `gap=0` → high（seed 那条 buffer 的判据） | 【本项目补充定义】线上 接 线下、gap=0 → high | `conflicts.test.ts:180` |
| A2 验收 | 真实数据：18:30–21:00 接 21:00–21:30 → 只出 buffer high，且**不许**再出 overlap | ② 周二 21:00 首尾相接 → 只出 buffer high（gap=0），不许再出 overlap | `demo-seed.test.ts:150` |
| A2 验收 | 真实数据：10-24 志愿者 11:30 → 兼职 13:00 不报；线上例会 21:30 → 大创 22:00 不报 | ① 校运会志愿者…不报缓冲不足 / ④ 线上例会…不报 | `demo-seed.test.ts:181`、`207` |

## A3 · 单日超载（overload）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| A3 | `usedMin = Σ 当日占用`；`overMin = usedMin − dayCapacityMin(600)`；`overMin > 0` 且任务数 ≥ 3 | A3-1 5 条任务共 700 分钟：超出 100 分钟判 medium | `conflicts.test.ts:220` |
| A3 分级 | `0.10×cap < overMin ≤ 0.25×cap` → medium | 同上（over=100） | `conflicts.test.ts:220` |
| A3 分级 | `overMin > 0.25×cap(150)` → **high**（按分级表，主Bot 裁决 2026-10-18） | A3-3 3 条任务 900 分钟含一条 done 120 分钟 | `conflicts.test.ts:240` |
| A3 误报红线 | 当日任务数 < `overloadMinTasks(3)` → 不判超载 | A3-2 2 条任务共 800 分钟：任务数 < 3 不判超载 | `conflicts.test.ts:235` |
| A3 切分 | 跨天任务按本地 00:00 切开，两端分别计入 | A3-4 跨夜 22:00–01:00 按零点切开：当日 120 + 次日 60 | `conflicts.test.ts:257` |
| A3 误报红线 | 微任务（`durationMin < 15` 且无地点）从 `usedMin` 剔除 | 微任务（< 15 分钟且无地点）从日用量里剔除 | `conflicts.test.ts:265` |
| **补充定义** | locked 集中日（当日 locked ≥ 已用量 50%）→ 超载只出 medium | 锁定集中日（固定块占一半以上）超载只出 medium，不出红 | `conflicts.test.ts:277` |
| A3 | `classMin > classLoadWarnMin(480)` → 独立一条 medium 预警（与超载并存） | 固定课满载预警与超载可并存，且独立成一条 | `conflicts.test.ts:289` |
| A3 误报红线 | 已有 done 时按 `usedMin − 已完成分钟` 判定 | 已完成的任务仍计入当日已用量，再按剩余量判定 | `conflicts.test.ts:303` |
| A3 验收 | 真实数据：10-20 共 7 条 670 分钟 → medium、超 70 | ③ 周二超载 → overload medium，670 分钟超出 600 上限 70 分钟 | `demo-seed.test.ts:168` |
| A3 验收 | 真实数据：10-19 只有 1 条任务 → 不判超载 | ② 10-19 只有 1 条任务，不判超载（任务数 < 3） | `demo-seed.test.ts:190` |

## A4 · 截止日逼近（deadline）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| A4 | `remainH = (deadline − now)/3600`；`slackH = remainH − estRemainH`；`slackH < 0` → **high** | 已经排不下（slack < 0）判 high | `conflicts.test.ts:320` |
| A4 | `remainH < leadHours[priority]` 且 `slackH ≥ 0` → **medium** | 进入提前预警窗口但仍排得下：medium | `conflicts.test.ts:328` |
| A4 | 已逾期（`remainH < 0`）→ **high** | 已逾期的任务判 high（事实发生了） | `conflicts.test.ts:336` |
| A4 误报红线 | `status === done` → 不报 | done 任务不产生截止提醒 | `conflicts.test.ts:344` |
| A4 分级 | `progress ≥ 0.8` → 最高只出 low | 进度 ≥ 0.8 的任务最高只出灰点 | `conflicts.test.ts:349` |
| A4 误报红线 | deadline 无具体时刻 → 视为当日 23:59 | 没有具体时刻的 deadline 视为当日 23:59 | `conflicts.test.ts:356` |
| A4 | 未进预警窗口 → 不报（不是漏报，是别打扰） | 还没进预警窗口的任务不报 | `conflicts.test.ts:365` |
| A4 误报红线 | 当日 overload 已为 high 时，同任务 deadline 降为 medium | 当日超载已刷红时，截止卡降为 medium | `conflicts.test.ts:370` |
| A4 验收 | 真实数据：10-31 两条在 10-19 时距今 294h > 72h → 不报；拨到 10-29 才进窗口 | 10-19 时都还没进预警窗口 / 把时钟拨到 10-29 | `demo-seed.test.ts:220`、`224` |
| A4 验收 | 真实数据：10-27 的微积分作业在 10-19 时约 207h，48h 窗口外 → 不报 | 微积分作业：10-19 时距 10-27 还有约 207 小时 | `demo-seed.test.ts:243` |

## A5 · 全局去重、排序与上限

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| A5-1 | 同一对任务只出一条：overlap 优先于 buffer | 同一对任务只出一条冲突：重叠优先，不再重复报缓冲 | `conflicts.test.ts:387` |
| A5-2 | 排序：severity → date → 当天时间 → 类型固定序 | 排序固定：severity（high→low）→ date → 当天时间 → 类型 | `conflicts.test.ts:395`、`demo-seed.test.ts:127` |
| A5 验收 | 同输入三次运行输出逐字节一致（含 `detectedAt`） | 同输入三次运行输出逐字节一致（确定性） | `conflicts.test.ts:407` |
| §0.3 | `conflictId = \`${type}:${sortedTaskIds.join('+')}\``（超载按天用日期做键） | 冲突 id 形状固定 | `conflicts.test.ts:419` |
| §0.3 | `humanMessage` ≤ 40 字且必须含数字锚点 | humanMessage 全部 ≤ 40 字且带数字锚点 | `conflicts.test.ts:428` |
| A5-3 | 卡片上限 `maxCards(5)`，其余折叠 | 卡片上限：前 5 条展示，其余折叠为「另外 N 条」 | `conflicts.test.ts:445` |
| §0.2 | 空输入返回 `[]`；`now` 非法直接抛 `TypeError` | 空输入返回空数组 / now 不合法时立刻抛错 | `conflicts.test.ts:457`、`461` |
| §0.2 | 纯函数：不修改入参 | 不修改入参（纯函数） | `conflicts.test.ts:465` |
| — | UI 辅助：`conflictedTaskIds` / `CONFLICT_TYPE_LABEL` | conflictedTaskIds 汇总 / CONFLICT_TYPE_LABEL 覆盖 4 类 | `conflicts.test.ts:473`、`481` |
| A5 验收 | 真实数据：冲突总数恰好 3 条，id 与 `expectedConflicts` 完全一致 | 冲突总数恰好 3 条，id 与 seed 的 expectedConflicts 完全一致 | `demo-seed.test.ts:115` |

## 重复任务（SPEC 未定义，本项目扩展）

| 规则 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| 数据口径 | 「每周二晚 9 点」是**一条** Task（`repeat.weekly/ [2]`），不落多行 | 一条 weekly 任务仍然只有一条记录（seed/契约用例内断言） | `conflicts.test.ts:492`、`528` |
| 展开窗口 | 窗口由调用方传入，长度为 `repeatHorizonDays(14)`；只看窗口不看"今天" | weekly 任务在两周窗口内展开出两个周二 / 展开只看窗口、不看今天 | `conflicts.test.ts:568`、`579` |
| 展开规则 | 时刻与时长取自任务本身；`byDay` 多天逐个展开 | byDay 多天时逐个展开（周一 + 周三 → 两周 4 次） | `conflicts.test.ts:588` |
| 展开边界 | 单次任务原样返回、不按窗口过滤 | 单次任务原样返回，不按窗口过滤 | `conflicts.test.ts:560` |
| 展开边界 | 无具体时段的重复安排不展开（交给规则4） | 没有具体时段的重复安排不展开 | `conflicts.test.ts:594` |
| 展开边界 | 窗口倒置返回 `[]`；非法窗口抛错 | 窗口倒置返回空，窗口非法抛错 | `conflicts.test.ts:599` |
| 检测 | 重复任务逐次参与规则1/2/3 | 周二 21:00 的例会能撞上下周二 21:00 结束的会 | `conflicts.test.ts:609` |
| id 唯一 | 涉及重复任务时 id 带 `@发生日期`，普通任务 id 形状不变 | 两周都撞 → 两条冲突、id 不同 / 已写死的单次任务 id 形状不变 | `conflicts.test.ts:620`、`630` |
| 窗口外 | 14 天以后的撞车不算今天要处理的事 | 窗口之外（14 天以后）的撞车不算今天要处理的事 | `conflicts.test.ts:638` |

## B1 · 重排方案本地合法性裁决（`reflow.ts`）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| B1 闸1 | 结构不合法（zod）→ 进 `rejected`，不抛异常 | 结构不合法的方案被拒，而不是抛异常 | `reflow.test.ts:330` |
| B1 闸2 | 不改 `locked`：移动 / 删除固定块一律丢弃该 op | 固定块不可移动 / 固定块不可删除 | `reflow.test.ts:126`、`141` |
| B1 闸2 | 时长 > 0；`move` 不得改时长（要改走 `resize`） | move 不得改变时长（改了就该用 resize） | `reflow.test.ts:164` |
| B1 闸2 | `resize` 只在 `flexible === true` 时允许（缩水） | 未标记可压缩的任务不得被改变时长 | `reflow.test.ts:175` |
| B1 闸2 | 不越作息窗口（默认 07:00–23:00，可配） | 越出作息窗口被拒 / 默认作息窗口是 07:00–23:00，可配置 | `reflow.test.ts:190`、`436` |
| B1 闸2 | 不造跨天块 | 跨天块被拒（时间轴画不出跨两列的块） | `reflow.test.ts:201` |
| B1 闸2 | 不违背 deadline 前置 | 违背 deadline 前置被拒 | `reflow.test.ts:212` |
| B1 闸2 | done 任务不需要重排 | 已完成的任务不需要重排 | `reflow.test.ts:227` |
| B1 闸2 | 幻觉 id（方案里不存在的任务）被拒 | 模型编出来的任务 id 被拒（幻觉 id 关进笼子） | `reflow.test.ts:239` |
| B1 闸2 | `add` 的 id 由本地按位置生成、`rank` 由本地赋值、模型自带数字无效 | 新增准备时间块 / 多套方案按 rank 排序 / 模型自带数字也没用 | `reflow.test.ts:80`、`341`、`365` |
| B1 闸3 | 逐条丢弃后重试一次；仍不合法则整套作废 | 坏动作被丢、好动作照常执行（丢弃并重试一次的可见行为） | `reflow.test.ts:250` |
| B1 闸3 | 成套动作允许穿过中间重叠态（全局性质只在落地后判） | 成套动作允许穿过中间重叠态：两个 move 一起挪开 | `reflow.test.ts:274` |
| B1 闸3 | 落地后仍重叠 / 超日容量 → 拒 | 挪到别人身上（落地后仍重叠）被拒 | `reflow.test.ts:152` |
| B1 闸4 | 冲突数没变好（0→0）或上升 → 不呈现 | 冲突数没变（0→0）也要作废 / 冲突数上升的方案直接不呈现 | `reflow.test.ts:298`、`313` |
| B1 信任指标 | `lockedTouched` 恒为 0；动了 fixed 的方案作废 | 动 locked 任务的方案直接作废 | `demo-seed.test.ts:321`、`370` |
| B1 指标 | `movedCount` / `deviationMin` / `conflictsBefore→After` 全部本地实算 | 把第二件事挪到 11:00：冲突 1→0，挪 1 条，偏离 60 分钟 | `reflow.test.ts:44`、`448` |
| B1 牺牲项 | 只报告**新增**的代价（22:00 后仍做事 / 早八被占用） | 牺牲项只报告新增的代价 | `reflow.test.ts:463` |
| B1 确定性 | 同输入两次裁决结果一致；不修改入参；`now` 非法抛错 | 同输入两次裁决结果完全一致 / 不修改入参任务集 / now 不合法时抛错 | `reflow.test.ts:392`、`402`、`413` |
| B1 验收 | 真实数据 A/B/C 三套方案：冲突 3→2，偏离 6600 / 840 / 150 分钟 | A 保截止日 / B 保精力 / C 保缓冲 | `demo-seed.test.ts:266`、`283`、`298` |
| B1 落地 | `applyProposal` 返回整体替换用的新任务集，任务数不变 | applyProposal 返回整体替换用的新任务集 / 方案落地后仍然是同一批任务 | `reflow.test.ts:423`、`demo-seed.test.ts:384` |

## B6 · 快照栈与回滚（`snapshot.ts`）

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| B6 | 应用方案前整体快照入栈；parent 链正确 | 第一次入栈：parent 为 null，currentId 指向它 / 连续入栈形成 parent 链 | `snapshot.test.ts:57`、`70` |
| B6 | 栈上限 20，超出丢最旧 | 推 25 次只留最近 20 条，currentId 指向最新 | `snapshot.test.ts:110` |
| B6 | 被淘汰快照作为 parent 时引用置 null，不留悬空 id | 被淘汰的快照若还是别人的 parent，引用置 null | `snapshot.test.ts:126` |
| B6 | **回滚 = 整体替换 tasksState**，不做反向 op | 回滚后任务集逐字段等于入栈时那一份 | `snapshot.test.ts:143` |
| B6 | 回滚动作本身入栈（`source: 'rollback'`），支持重做回滚 | 回滚动作本身也入栈 / 支持重做回滚 | `snapshot.test.ts:156`、`168` |
| B6 | 目标版本已被淘汰 → 返回 null，不抛异常 | 目标版本已被 20 条上限淘汰时返回 null | `snapshot.test.ts:179` |
| B6 保护条件 | 有未快照手改 → 回滚前需二次确认，计数即文案里的 N | 手改一处 → 计数为 1，需要确认 / 新增与删除任务也算改动 | `snapshot.test.ts:224`、`232` |
| B6 | 快照持有副本，改原对象不污染历史 | 快照持有的是副本 / 写回的状态是副本 | `snapshot.test.ts:86`、`206` |
| B6 | 精确比较前先规范化（字段顺序、`undefined` vs `null`） | 字段顺序不同但取值相同 → 相等 / 缺省值与显式 null 视为同一个意思 | `snapshot.test.ts:249`、`256` |
| B6 验收 | 回滚后 `JSON.stringify` 与快照逐字段一致（B7-6） | 回滚后任务集逐字段等于入栈时那一份 | `snapshot.test.ts:143` |
| B6 | 历史面板倒序 + 摘要行含时间/来源/说明 | 历史倒序（最新在前） / 摘要行含时间、来源与说明 | `snapshot.test.ts:273`、`283` |
| B6 | 快照与栈都过 zod；来源串必须符合约定 | 生成出来的快照与快照栈都能通过 zod 校验 / 来源字符串必须符合约定 | `snapshot.test.ts:304`、`312` |

## C · 测试素材与锚定时间

| SPEC 编号 | 判定条件 | 对应用例名 | 用例位置 |
|---|---|---|---|
| C | 锚定时间 = `demoNow`（`2026-10-19T09:00+08:00`），不是运行时 now | 锚定时间就是 seed 里的 demoNow | `demo-seed.test.ts:108` |
| C | seed 的 18 条任务全部通过 `TaskSchema`（演示数据不是特例） | 18 条任务全部通过 TaskSchema | `demo-seed.test.ts:94` |
| C | 9 locked / 6 flexible / 0 done 与 seed 一致 | 锁定/可挪的分布与 seed 一致 | `demo-seed.test.ts:102` |
| C | 3 条冲突 + 4 条误报红线全部对得上 | ③ done 的任务不参与判定：把答辩准备标记完成后，overlap 消失 | `demo-seed.test.ts:197` |

---

## 怎么用这份表（评委抽检路线，约 30 秒/条）

1. 挑一条规则（例如 A2-3 跨校区缓冲）；
2. 按"用例位置"打开 `tests/domain/conflicts.test.ts:122`；
3. 看 `it(...)` 里的输入三条时间与地点，直接心算 `gap` 与 `required`；
4. 回到 `src/domain/conflicts.ts` 搜 `resolveVenue`，确认阈值的来源是 `config` 而不是写死的字面量；
5. 改一个数字跑 `npm test -- tests/domain/conflicts.test.ts`，看它变红 —— **能变红才说明规则真的在起作用**。

## 补充定义清单（SPEC 原文没有、本项目补的）

凡本表标 **【本项目补充定义】** 的行，都属于这一类。原则：**宁可少一条规则，不留一条说不清来源的规则。**

| 补充项 | 判据 | 为什么补 | 代码位置 |
|---|---|---|---|
| locked 集中日 | 当日 `lockedMin / usedMin ≥ 0.5` → 超载只出 medium | SPEC 只写"locked 集中日只出 medium"，没定义"集中"，规则无法生效 | `conflicts.ts` `LOCKED_CONCENTRATED_RATIO` |
| 同校区不同楼 | `sameCampus = 20` 分钟 | SPEC 只有 同地点10/跨校区60/默认30；按 30 算会把正常课间全刷黄（seed 里 20 分钟课间很常见） | `conflicts.ts` `resolveVenue` |
| 线上/远程地点 | 按 `default(30)` 计，不按同地点 10 计 | 线上会无通勤成本，但也不该被当成"同一间屋子"，否则线上会互相之间会被误判 | `conflicts.ts` `resolveVenue` |
| 重复任务展开 | 窗口 = 注入 `now` 起 `repeatHorizonDays(14)` 天 | SPEC 只有 `date` 字段，没有周期语义；不展开则"周二 21:00 例会"在演示日根本撞不上 | `time.ts` `expandOccurrences` |
| 超载 id 用日期 | `overload:<date>`、`overload:<date>@class` | SPEC §0.3 的 `${type}:${taskIds}` 在按天成立的规则上会让 id 随任务增删抖动 | `conflicts.ts` `buildConflict` |
