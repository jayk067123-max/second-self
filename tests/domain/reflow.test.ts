import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFLOW_CONFIG,
  adjudicateProposal,
  applyPlan,
  applyProposal,
  buildLocalProposals,
  judgeProposals,
  summarizePlan,
  summarizeProposal,
  validatePlan,
  type JudgeInputs,
  type ProposalCandidate,
  type ReflowOp,
  type ReplanPlan,
} from "@/domain/reflow";
import type { Task } from "@/domain/schemas/task";
import { DAY, DEMO_NOW, NEXT_DAY, block, ddl, hhmm, todo } from "./support/tasks";

/**
 * 重排裁决器单测 —— 这是"把幻觉关进笼子"那一层的验收。
 *
 * 每个用例的套路都一样：先造一个**带冲突的现状**，再让"模型"给一套动作，
 * 断言本地代码要么把它改对了，要么把它判死。裁决结果里的冲突数永远是
 * 本地实算的，用例直接断言这些数字 —— 模型自称的数字在这个模块里不存在。
 */

const inputs: JudgeInputs = { now: DEMO_NOW };

function candidate(ops: ReflowOp[], label = "最小改动"): ProposalCandidate {
  return { id: "proposal#1", rank: 1, label, ops };
}

/** 两条首尾相接的同地点课，天然一条 buffer 冲突 */
function baseline(): Task[] {
  return [
    block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
    block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会", location: "教室A" }),
  ];
}

describe("adjudicateProposal · 合法方案必须通过并实算指标", () => {
  it("把第二件事挪到 11:00：冲突 1→0，挪 1 条，偏离 60 分钟", () => {
    const tasks = baseline();
    const result = adjudicateProposal(
      candidate([
        { type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) },
      ]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.conflictsBefore).toBe(1);
    expect(result.value.proposal.conflictsAfter).toBe(0);
    expect(result.value.proposal.movedCount).toBe(1);
    expect(result.value.proposal.deviationMin).toBe(60);
    expect(result.value.proposal.lockedTouched).toBe(0);
    expect(result.value.proposal.rank).toBe(1);
    expect(result.value.droppedOps).toEqual([]);
  });

  it("可压缩的任务允许 resize：压缩时长后解除重叠", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
      block(DAY, 9, 30, 10, 30, { id: "b", title: "社团例会", location: "教室A", flexible: true }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "resize", taskId: "b", start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.conflictsAfter).toBe(0);
    expect(result.value.tasksAfter.find((t) => t.id === "b")?.durationMin).toBe(30);
  });

  it("新增准备时间块：id 由本地生成，动作顺序不乱", () => {
    const tasks = baseline();
    const result = adjudicateProposal(
      candidate([
        { type: "move", taskId: "b", start: hhmm(NEXT_DAY, 10, 0), end: hhmm(NEXT_DAY, 11, 0) },
        {
          type: "add",
          title: "前往活动室（缓冲）",
          start: hhmm(DAY, 10, 30),
          end: hhmm(DAY, 11, 0),
          location: "活动室",
        },
      ]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.ops).toHaveLength(2);
    expect(result.value.proposal.conflictsAfter).toBe(0);
    // 新增不是"挪动"
    expect(result.value.proposal.movedCount).toBe(1);
    // 跨天移动 24 小时
    expect(result.value.proposal.deviationMin).toBe(24 * 60);
    expect(result.value.tasksAfter.map((t) => t.id)).toContain("added-2");
    // 补出来的缓冲块天然可调
    expect(result.value.tasksAfter.find((t) => t.id === "added-2")?.flexible).toBe(true);
  });

  it("动作顺序影响结果：先删后移可以成功", () => {
    const tasks = baseline();
    const result = adjudicateProposal(
      candidate([
        { type: "remove", taskId: "b" },
      ]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasksAfter).toHaveLength(1);
    expect(result.value.proposal.conflictsAfter).toBe(0);
  });
});

describe("adjudicateProposal · 非法动作逐条丢弃", () => {
  it("固定块不可移动：动作被丢，方案随之作废（没有一条动作通过）", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "高等数学", location: "教室A", locked: true }),
      block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "a", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("固定块");
  });

  it("固定块不可删除", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "高等数学", locked: true }),
      block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会" }),
    ];
    const result = adjudicateProposal(candidate([{ type: "remove", taskId: "a" }]), tasks, inputs);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("固定块");
  });

  it("挪到别人身上（落地后仍重叠）被拒", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 9, 30), end: hhmm(DAY, 10, 30) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 重叠是"全局"性质，在整体闸判：措辞是"落地后仍然重叠"
    expect(result.rejection.reasons.join()).toContain("仍然重叠");
  });

  it("move 不得改变时长（改了就该用 resize）", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 30) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("移动不得改变时长");
  });

  it("未标记可压缩的任务不得被改变时长", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
      block(DAY, 9, 30, 10, 30, { id: "b", title: "社团例会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "resize", taskId: "b", start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("可压缩");
  });

  it("越出作息窗口被拒（默认 07:00–23:00）", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 6, 0), end: hhmm(DAY, 7, 0) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("作息窗口");
  });

  it("跨天块被拒（时间轴画不出跨两列的块）", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 23, 30), end: hhmm(NEXT_DAY, 0, 30) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("作息窗口");
  });

  it("违背 deadline 前置被拒", () => {
    const tasks: Task[] = [
      block(DAY, 8, 0, 9, 0, { id: "c", title: "交材料", location: "教室A", deadline: hhmm(DAY, 10, 0) }),
      block(DAY, 9, 0, 10, 0, { id: "d", title: "别的会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "c", start: hhmm(DAY, 10, 0), end: hhmm(DAY, 11, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("截止时间之后");
  });

  it("已完成的任务不需要重排", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "a", title: "写完了", done: true })];
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "a", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("已完成");
  });

  it("模型编出来的任务 id 被拒（幻觉 id 关进笼子）", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "ghost", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("不存在的任务");
  });

  it("坏动作被丢、好动作照常执行（丢弃并重试一次的可见行为）", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "高等数学", location: "教室A", locked: true }),
      block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([
        { type: "remove", taskId: "a" }, // 删固定块 → 该 op 被丢
        { type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }, // 好动作
      ]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.droppedOps).toHaveLength(1);
    // 被丢的原因要具体：这句会回灌给 AI 层做定向修复
    expect(result.value.droppedOps[0]?.reason).toContain("固定块");
    expect(result.value.proposal.rejected?.[0]?.reason).toContain("固定块");
    expect(result.value.proposal.ops).toHaveLength(1);
    expect(result.value.proposal.ops[0]?.type).toBe("move");
    expect(result.value.proposal.conflictsAfter).toBe(0);
  });

  it("成套动作允许穿过中间重叠态：两个 move 一起挪开，整体闸只看落地结果", () => {
    // 这是 seed 里 C 方案的形态：19:00 撞在一起的两件事要一起拆开，
    // 第一步挪完的中间态必然还重叠着，逐条判会把正确方案错杀。
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "实验室例会", location: "实验楼B305" }),
      block(DAY, 9, 0, 10, 0, { id: "b", title: "答辩准备", location: "图书馆研讨室" }),
    ];
    const result = adjudicateProposal(
      candidate([
        { type: "move", taskId: "a", start: hhmm(DAY, 8, 30), end: hhmm(DAY, 9, 30) },
        { type: "move", taskId: "b", start: hhmm(DAY, 10, 0), end: hhmm(DAY, 11, 0) },
      ]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.droppedOps).toHaveLength(0);
    expect(result.value.proposal.movedCount).toBe(2);
    expect(result.value.proposal.conflictsAfter).toBe(0);
  });
});

describe("adjudicateProposal · 效果闸：变不更好的方案不上桌", () => {
  it("冲突数没变（0→0）也要作废", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
      block(DAY, 12, 0, 13, 0, { id: "b", title: "社团例会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 13, 0), end: hhmm(DAY, 14, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("没有变好");
  });

  it("冲突数上升的方案直接不呈现", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
      block(DAY, 9, 30, 10, 30, { id: "b", title: "社团例会", location: "教室A" }),
      block(DAY, 14, 0, 15, 0, { id: "c", title: "复盘", location: "教室A" }),
    ];
    // 把 c 挪到和 a 重叠的位置 → 动作闸会先拦下，说明"变差"根本进不来
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "c", start: hhmm(DAY, 9, 15), end: hhmm(DAY, 10, 15) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(false);
  });
});

describe("judgeProposals · 模型输出整批裁决", () => {
  it("结构不合法的方案被拒，而不是抛异常", () => {
    const report = judgeProposals(
      [{ label: "瞎编的", ops: [{ type: "teleport", taskId: "a" }] }],
      baseline(),
      inputs,
    );
    expect(report.accepted).toHaveLength(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]?.reasons.join()).toContain("字段");
  });

  it("多套方案按 rank 排序，rank 由本地按顺序赋值，模型无权指定", () => {
    const report = judgeProposals(
      [
        {
          label: "最小改动",
          ops: [{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }],
        },
        {
          label: "最快收尾",
          ops: [
            { type: "move", taskId: "b", start: hhmm(NEXT_DAY, 10, 0), end: hhmm(NEXT_DAY, 11, 0) },
          ],
        },
      ],
      baseline(),
      inputs,
    );
    expect(report.accepted).toHaveLength(2);
    expect(report.accepted[0]?.proposal.rank).toBe(1);
    expect(report.accepted[1]?.proposal.rank).toBe(2);
    expect(report.accepted[0]?.proposal.label).toBe("最小改动");
    expect(report.rejected).toHaveLength(0);
  });

  it("模型自带数字也没用：冲突数一律本地实算", () => {
    const report = judgeProposals(
      [
        {
          label: "最小改动",
          conflictsAfter: 0,
          movedCount: 99,
          lockedTouched: 7,
          ops: [{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }],
        },
      ],
      baseline(),
      inputs,
    );
    const accepted = report.accepted[0];
    expect(accepted?.proposal.movedCount).toBe(1);
    expect(accepted?.proposal.lockedTouched).toBe(0);
    expect(accepted?.proposal.conflictsAfter).toBe(0);
  });

  it("空批次返回空结果，不抛错", () => {
    const report = judgeProposals([], baseline(), inputs);
    expect(report).toEqual({ accepted: [], rejected: [] });
  });
});

describe("裁决器的纯函数性质", () => {
  it("同输入两次裁决结果完全一致", () => {
    const tasks = baseline();
    const ops: ReflowOp[] = [
      { type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) },
    ];
    const first = adjudicateProposal(candidate(ops), tasks, inputs);
    const second = adjudicateProposal(candidate(ops), tasks, inputs);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("不修改入参任务集", () => {
    const tasks = baseline();
    const snapshot = JSON.stringify(tasks);
    adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      tasks,
      inputs,
    );
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });

  it("now 不合法时抛错（不允许偷偷读当前时间）", () => {
    expect(() =>
      adjudicateProposal(
        candidate([{ type: "remove", taskId: "b" }]),
        baseline(),
        { now: new Date(Number.NaN) },
      ),
    ).toThrow(TypeError);
  });

  it("applyProposal 返回整体替换用的新任务集", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const applied = applyProposal(result.value);
    expect(applied).toBe(result.value.tasksAfter);
    expect(applied.find((task) => task.id === "b")?.start).toBe(hhmm(DAY, 11, 0));
  });

  it("默认作息窗口是 07:00–23:00，可配置", () => {
    expect(DEFAULT_REFLOW_CONFIG).toEqual({ dayStartMin: 420, dayEndMin: 1380 });
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      baseline(),
      { now: DEMO_NOW, config: { dayStartMin: 0, dayEndMin: 24 * 60 } },
    );
    expect(result.ok).toBe(true);
  });
});

describe("方案摘要文案", () => {
  it("一行概括挪动条数、冲突前后、偏离分钟、固定课被挪条数", () => {
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      baseline(),
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = summarizeProposal(result.value.proposal);
    expect(summary).toContain("挪动 1 条");
    expect(summary).toContain("冲突 1→0");
    expect(summary).toContain("偏离 60 分钟");
    expect(summary).toContain("固定课被挪 0 条");
  });

  it("牺牲项只报告新增的代价", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
      block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会", location: "教室A" }),
    ];
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "b", start: hhmm(DAY, 22, 0), end: hhmm(DAY, 23, 0) }]),
      tasks,
      inputs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.sacrifices.join()).toContain("22:00 后仍有任务");
  });
});

describe("DDL 任务与无时间块任务", () => {
  it("纯 DDL 任务不出现在动作面里，但会影响冲突计数", () => {
    const tasks: Task[] = [
      ddl(hhmm(DAY, 12, 0), { id: "d", title: "交材料", estateMin: 120 }),
      block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
    ];
    // 现状：DDL 已过期（DAY 12:00 早于 DEMO_NOW）→ 1 条 high 冲突
    const result = adjudicateProposal(
      candidate([{ type: "move", taskId: "a", start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]),
      tasks,
      inputs,
    );
    // 挪一条不解决 DDL 冲突 → 冲突数没下降 → 方案作废
    expect(result.ok).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────
 * 以下 15 条来自原 `tests/domain/planner.test.ts`。
 * `src/domain/planner.ts` 按 ARCHITECTURE §2 的目录口径并入 reflow 后，
 * 用例跟着搬过来；**断言一字未改**，只换了夹具与 import 路径 ——
 * 迁移不顺手改行为，是这类重构唯一能被信任的做法。
 * ───────────────────────────────────────────────────────────── */

function planOf(blocks: Array<{ taskId: string; start: string; end: string }>): ReplanPlan {
  return { id: "p1", title: "测试方案", rationale: "测试用", blocks };
}

describe("validatePlan · 合法方案", () => {
  it("不重叠、在窗口内、时长不缩水的方案通过", () => {
    const a = todo(60, { title: "作业" });
    const b = todo(30, { title: "复盘" });
    const plan = planOf([
      { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
      { taskId: b.id, start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) },
    ]);
    const result = validatePlan(plan, [a, b], DAY);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("validatePlan · 非法方案必须被拦下", () => {
  const a = todo(60, { title: "作业" });
  const b = todo(30, { title: "复盘" });

  it("方案内部重叠", () => {
    const plan = planOf([
      { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
      { taskId: b.id, start: hhmm(DAY, 9, 45), end: hhmm(DAY, 10, 15) },
    ]);
    const result = validatePlan(plan, [a, b], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("方案内部重叠");
  });

  it("越过作息窗口（07:00–23:00）", () => {
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 6, 0), end: hhmm(DAY, 7, 0) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("超出作息窗口");
  });

  it("把任务压缩到原定时长以下", () => {
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 9, 30) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("被压缩");
  });

  it("排到 deadline 之后", () => {
    const tight = todo(30, { title: "交材料", deadline: hhmm(DAY, 9, 0) });
    const plan = planOf([{ taskId: tight.id, start: hhmm(DAY, 10, 0), end: hhmm(DAY, 10, 30) }]);
    const result = validatePlan(plan, [tight], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("截止时间之后");
  });

  it("落地后当日总量超过上限（含未覆盖任务）", () => {
    const planned = todo(300, { title: "计划内" });
    const untouched = block(DAY, 14, 0, 20, 0, { title: "计划外" });
    const plan = planOf([{ taskId: planned.id, start: hhmm(DAY, 8, 0), end: hhmm(DAY, 13, 0) }]);
    const result = validatePlan(plan, [planned, untouched], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("超过上限");
  });

  it("不存在的任务 id", () => {
    const plan = planOf([{ taskId: "ghost", start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("不存在的任务");
  });

  it("空方案", () => {
    const result = validatePlan(planOf([]), [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("没有任何时间块");
  });
});

describe("applyPlan", () => {
  it("写回时间块且不修改原数组", () => {
    const a = todo(60, { title: "作业" });
    const b = todo(30, { title: "别动我" });
    const original = [a, b];
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 30) }]);
    const next = applyPlan(original, plan);

    expect(original[0]?.start).toBeNull();
    expect(next[0]?.start).toBe(hhmm(DAY, 9, 0));
    expect(next[0]?.durationMin).toBe(90);
    expect(next[1]).toEqual(b);
  });
});

describe("buildLocalProposals · 无模型时的确定性兜底", () => {
  it("没有冲突时不硬造方案", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", location: "教室A" }),
      block(DAY, 12, 0, 13, 0, { id: "b", location: "教室A" }),
    ];
    expect(buildLocalProposals(tasks, inputs)).toEqual([]);
  });

  it("有冲突时产出提案，且每一套都过了裁决器（冲突数下降、locked 未动）", () => {
    const tasks = baseline();
    const proposals = buildLocalProposals(tasks, inputs);
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      expect(proposal.proposal.conflictsAfter).toBeLessThan(proposal.proposal.conflictsBefore);
      expect(proposal.proposal.lockedTouched).toBe(0);
      expect(proposal.proposal.ops.length).toBeGreaterThan(0);
      expect(proposal.tasksAfter).toHaveLength(tasks.length);
    }
  });

  it("候选全是固定块时返回空（挪不动就不提议）", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { id: "a", location: "教室A", locked: true }),
      block(DAY, 10, 0, 11, 0, { id: "b", location: "教室A", locked: true }),
    ];
    expect(buildLocalProposals(tasks, inputs)).toEqual([]);
  });

  it("确定性：同输入两次结果完全一致", () => {
    const tasks = baseline();
    expect(JSON.stringify(buildLocalProposals(tasks, inputs))).toBe(
      JSON.stringify(buildLocalProposals(tasks, inputs)),
    );
  });

  it("now 不合法时抛错", () => {
    expect(() => buildLocalProposals(baseline(), { now: new Date(Number.NaN) })).toThrow(TypeError);
  });
});

describe("summarizePlan · 旧方案摘要（ReplanPanel 当前还在读它）", () => {
  it("汇总覆盖项数、总时长与结束时间", () => {
    const a = todo(60);
    const b = todo(30);
    const summary = summarizePlan(
      planOf([
        { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
        { taskId: b.id, start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) },
      ]),
    );
    expect(summary.count).toBe(2);
    expect(summary.totalMin).toBe(90);
    expect(summary.lastEnd).toBe("11:00");
  });
});