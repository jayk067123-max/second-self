import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import type { Conflict } from "@/domain/conflicts";
import { TaskSchema, type Task } from "@/domain/schemas/task";
import { adjudicateProposal, type Adjudication, type ReflowOp } from "@/domain/reflow";

/**
 * 与 `docs/demo-fixtures/demo-seed.json` 对齐的验收测试。
 *
 * 这是全项目唯一一份"别人也能对着看"的验收：seed 里 18 条任务、3 条冲突、
 * 4 条误报红线、3 套重排方案目标，全部来自演示数据本身，不是为测试造的玩具数据。
 * 评委可以打开 seed 逐条核对这里断言的东西 —— 这就是可验证性的意思。
 *
 * 两处刻意的转换（seed 的字段口径与我们落库的 Task 不同，转换只在这里做一次）：
 * - seed 用 `date + 'HH:mm'`，我们用 ISO 时间戳（跨天任务必须能表达真实时刻）；
 * - seed 用 `priority: 'high'|'medium'|'low'`，我们落库用 1/2/3。
 */

const SEED_URL = new URL("../../docs/demo-fixtures/demo-seed.json", import.meta.url);

interface SeedTask {
  id: string;
  title: string;
  date: string | null;
  start: string | null;
  end: string | null;
  durationMin: number;
  deadline: string | null;
  priority: "high" | "medium" | "low";
  location: string | null;
  locked: boolean;
  flexible: boolean;
  status: "todo" | "done";
  estateMin?: number;
}

interface SeedFile {
  demoNow: string;
  tasks: SeedTask[];
  expectedConflicts: Array<{ conflictId: string; conflictType: string; severity: string }>;
  falsePositiveChecks: string[];
  expectedProposalTargets: { allProposals: { lockedTaskIds: string[]; lockedTouched: number } };
}

const seed = JSON.parse(readFileSync(fileURLToPath(SEED_URL), "utf8")) as SeedFile;

/** '2026-10-26T09:00' → 本地时区的 ISO 字符串（不带 Z 的写法按本地时间解析） */
function localIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
}

const PRIORITY_TO_NUMBER: Record<SeedTask["priority"], 1 | 2 | 3> = {
  high: 1,
  medium: 2,
  low: 3,
};

/** seed 的 Task → 我们落库的 Task（唯一一处口径转换） */
function toTask(raw: SeedTask): Task {
  const hasBlock = raw.date !== null && raw.start !== null && raw.end !== null;
  return {
    id: raw.id,
    title: raw.title,
    start: hasBlock ? localIso(`${raw.date}T${raw.start}`) : null,
    end: hasBlock ? localIso(`${raw.date}T${raw.end}`) : null,
    durationMin: raw.durationMin,
    deadline: raw.deadline === null ? null : localIso(raw.deadline),
    priority: PRIORITY_TO_NUMBER[raw.priority],
    source: "manual",
    done: raw.status === "done",
    rawTextOrigin: null,
    location: raw.location,
    locked: raw.locked,
    flexible: raw.flexible,
    parentId: null,
    repeat: null,
    needsReview: false,
    estateMin: raw.estateMin,
  };
}

const tasks: Task[] = seed.tasks.map(toTask);
const DEMO_NOW = new Date(seed.demoNow);

const detect = (now: Date = DEMO_NOW): Conflict[] =>
  detectConflicts(tasks, DEFAULT_DETECT_CONFIG, now);

const judge = (ops: ReflowOp[]): Adjudication =>
  adjudicateProposal({ id: "proposal#1", rank: 1, label: "测试方案", ops }, tasks, { now: DEMO_NOW });

describe("demo-seed · 数据契约", () => {
  it("18 条任务全部通过 TaskSchema（演示数据不是特例）", () => {
    expect(tasks).toHaveLength(18);
    for (const task of tasks) {
      const parsed = TaskSchema.safeParse(task);
      expect(parsed.success, `${task.id} 未通过契约`).toBe(true);
    }
  });

  it("锁定/可挪的分布与 seed 一致：9 条 locked、6 条 flexible、0 条已完成", () => {
    expect(tasks.filter((task) => task.locked)).toHaveLength(9);
    expect(tasks.filter((task) => task.flexible)).toHaveLength(6);
    expect(tasks.filter((task) => task.done)).toHaveLength(0);
  });

  it("锚定时间就是 seed 里的 demoNow（不是运行时 now）", () => {
    expect(seed.demoNow).toBe("2026-10-19T09:00:00+08:00");
    expect(DEMO_NOW.getTime()).toBe(Date.parse("2026-10-19T09:00:00+08:00"));
  });
});

describe("demo-seed · 必须报出且只报出这 3 条", () => {
  it("冲突总数恰好 3 条，id 与 seed 的 expectedConflicts 完全一致", () => {
    const conflicts = detect();
    expect(conflicts).toHaveLength(3);
    expect(new Set(conflicts.map((conflict) => conflict.conflictId))).toEqual(
      new Set([
        "overlap:t_defense+t_lab_meet",
        "buffer:t_meet+t_weekly",
        "overload:2026-10-20",
      ]),
    );
  });

  it("排序契约：severity（high→low）→ date → 当天时间 → 类型", () => {
    const walk = detect().map(
      (conflict) => `${conflict.severity}|${conflict.date}|${conflict.conflictType}`,
    );
    expect(walk).toEqual([
      "high|2026-10-20|buffer",
      "high|2026-10-21|overlap",
      "medium|2026-10-20|overload",
    ]);
  });

  it("① 周三 19:00 两件事完全重合 → overlap high，overlapMin=120", () => {
    const overlap = detect().find((conflict) => conflict.conflictType === "overlap");
    expect(overlap?.severity).toBe("high");
    expect(overlap?.date).toBe("2026-10-21");
    expect(overlap?.evidence.overlapMin).toBe(120);
    // 两条时间块完全相同 → 判成"完全包含"分支
    expect(overlap?.evidence.containment).toBe(1);
    expect(overlap?.involvedTaskIds).toEqual(["t_defense", "t_lab_meet"]);
    expect(overlap?.humanMessage).toContain("19:00");
    expect(overlap?.humanMessage).toContain("完全重叠");
  });

  it("② 周二 21:00 首尾相接 → 只出 buffer high（gap=0），不许再出 overlap", () => {
    const buffer = detect().find((conflict) => conflict.conflictType === "buffer");
    expect(buffer?.severity).toBe("high");
    expect(buffer?.date).toBe("2026-10-20");
    expect(buffer?.evidence.gapMin).toBe(0);
    expect(buffer?.evidence.requiredMin).toBe(30);
    expect(buffer?.involvedTaskIds).toEqual(["t_meet", "t_weekly"]);

    // 同一条不许被规则1 再报一次（首尾相接不算重叠）
    const doubleReport = detect().filter(
      (conflict) =>
        conflict.conflictType === "overlap" &&
        conflict.involvedTaskIds.includes("t_meet") &&
        conflict.involvedTaskIds.includes("t_weekly"),
    );
    expect(doubleReport).toHaveLength(0);
  });

  it("③ 周二超载 → overload medium，670 分钟超出 600 上限 70 分钟", () => {
    const overload = detect().find((conflict) => conflict.conflictType === "overload");
    expect(overload?.severity).toBe("medium");
    expect(overload?.date).toBe("2026-10-20");
    expect(overload?.evidence.usedMin).toBe(670);
    expect(overload?.evidence.overMin).toBe(70);
    expect(overload?.evidence.capacityMin).toBe(600);
    expect(overload?.evidence.taskCount).toBe(7);
    expect(overload?.involvedTaskIds).toHaveLength(7);
  });
});

describe("demo-seed · 4 条误报红线一条都不许踩", () => {
  it("① 校运会志愿者 11:30 结束 → 启航兼职 13:00 开始：不报缓冲不足", () => {
    const falsePositive = detect().find(
      (conflict) =>
        conflict.involvedTaskIds.includes("t_volunteer") &&
        conflict.involvedTaskIds.includes("t_job"),
    );
    expect(falsePositive).toBeUndefined();
  });

  it("② 10-19 只有 1 条任务，不判超载（任务数 < 3）", () => {
    const monday = detect().filter(
      (conflict) => conflict.conflictType === "overload" && conflict.date === "2026-10-19",
    );
    expect(monday).toHaveLength(0);
  });

  it("③ done 的任务不参与判定：把答辩准备标记完成后，overlap 消失", () => {
    const withDone = tasks.map((task) =>
      task.id === "t_lab_meet" ? { ...task, done: true } : task,
    );
    const conflicts = detectConflicts(withDone, DEFAULT_DETECT_CONFIG, DEMO_NOW);
    expect(conflicts.filter((conflict) => conflict.conflictType === "overlap")).toHaveLength(0);
    // 剩下周二那条 buffer 与周二超载
    expect(conflicts).toHaveLength(2);
  });

  it("④ 线上例会 21:30 结束 → 大创讨论 22:00 开始：间隔 30 分钟不报", () => {
    // 只看相邻两条之间的规则（overlap / buffer），超载卡是另一码事
    const falsePositive = detect().find(
      (conflict) =>
        (conflict.conflictType === "buffer" || conflict.conflictType === "overlap") &&
        conflict.involvedTaskIds.includes("t_weekly") &&
        conflict.involvedTaskIds.includes("t_dachuang"),
    );
    expect(falsePositive).toBeUndefined();
  });
});

describe("demo-seed · 三条只有 deadline 的任务", () => {
  it("10-19 时都还没进预警窗口：10-31 距今 294 小时 > 72 小时", () => {
    expect(detect().filter((conflict) => conflict.conflictType === "deadline")).toHaveLength(0);
  });

  it("把时钟拨到 10-29：10-31 的两条进 72 小时窗口（medium），微积分作业已逾期（high）", () => {
    const later = detect(new Date("2026-10-29T09:00:00+08:00"));
    const deadlines = later.filter((conflict) => conflict.conflictType === "deadline");
    expect(deadlines.map((conflict) => conflict.involvedTaskIds[0]).sort()).toEqual([
      "t_calc",
      "t_defense_ddl",
      "t_scholar",
    ]);

    const defense = deadlines.find((conflict) => conflict.involvedTaskIds.includes("t_defense_ddl"));
    expect(defense?.severity).toBe("medium");
    // 54 小时到期，还要 8 小时工作量 → 还排得下，所以不是 high
    expect(defense?.evidence.remainH).toBe(54);
    expect(defense?.evidence.slackH).toBe(46);

    const calc = deadlines.find((conflict) => conflict.involvedTaskIds.includes("t_calc"));
    expect(calc?.severity).toBe("high");
  });

  it("微积分作业：10-19 时距 10-27 还有约 207 小时，远在 48 小时窗口外，不报", () => {
    const calcTask = tasks.find((task) => task.id === "t_calc");
    expect(calcTask).toBeDefined();
    if (!calcTask) return;

    // 10-19 09:00 → 10-27 23:59 ≈ 207 小时，priority=medium 的预警窗口只有 48 小时
    expect(detectConflicts([calcTask], DEFAULT_DETECT_CONFIG, DEMO_NOW)).toHaveLength(0);

    // 拨到 10-27 12:00：只剩不到 12 小时，进窗口 → medium（还排得下 2 小时工作量）
    const closeBy = detectConflicts(
      [calcTask],
      DEFAULT_DETECT_CONFIG,
      new Date("2026-10-27T12:00:00+08:00"),
    );
    expect(closeBy).toHaveLength(1);
    expect(closeBy[0]?.conflictType).toBe("deadline");
    expect(closeBy[0]?.severity).toBe("medium");
    expect(closeBy[0]?.evidence.remainH).toBe(12);
    expect(closeBy[0]?.evidence.leadHours).toBe(48);
  });
});

describe("demo-seed · 重排方案的验收目标（A / B / C）", () => {
  it("A 保截止日：答辩准备挪到 10-26 09:00–11:00，冲突 3→2，偏离 6600 分钟", () => {
    const result = judge([
      {
        type: "move",
        taskId: "t_defense",
        start: localIso("2026-10-26T09:00"),
        end: localIso("2026-10-26T11:00"),
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.conflictsBefore).toBe(3);
    expect(result.value.proposal.conflictsAfter).toBe(2);
    expect(result.value.proposal.lockedTouched).toBe(0);
    expect(result.value.proposal.deviationMin).toBe(6600);
  });

  it("B 保精力：答辩准备挪到 10-22 09:00–11:00，冲突 3→2，偏离 840 分钟", () => {
    const result = judge([
      {
        type: "move",
        taskId: "t_defense",
        start: localIso("2026-10-22T09:00"),
        end: localIso("2026-10-22T11:00"),
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.conflictsAfter).toBe(2);
    expect(result.value.proposal.deviationMin).toBe(840);
  });

  it("C 保缓冲：例会前移 30 分钟、答辩推到 21:00，间隔 30 分钟，偏离 150 分钟", () => {
    const result = judge([
      {
        type: "move",
        taskId: "t_lab_meet",
        start: localIso("2026-10-21T18:30"),
        end: localIso("2026-10-21T20:30"),
      },
      {
        type: "move",
        taskId: "t_defense",
        start: localIso("2026-10-21T21:00"),
        end: localIso("2026-10-21T23:00"),
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.conflictsAfter).toBe(2);
    expect(result.value.proposal.deviationMin).toBe(150);
    // 牺牲项必须自己承认：周三 23:00 才结束
    expect(result.value.proposal.sacrifices.join()).toContain("22:00 后仍有任务");
  });

  it("三套方案的 lockedTouched 必须都是 0（这就是「固定课被挪 0 条」的实现依据）", () => {
    const proposals: ReflowOp[][] = [
      [
        {
          type: "move",
          taskId: "t_defense",
          start: localIso("2026-10-26T09:00"),
          end: localIso("2026-10-26T11:00"),
        },
      ],
      [
        {
          type: "move",
          taskId: "t_defense",
          start: localIso("2026-10-22T09:00"),
          end: localIso("2026-10-22T11:00"),
        },
      ],
      [
        {
          type: "move",
          taskId: "t_lab_meet",
          start: localIso("2026-10-21T18:30"),
          end: localIso("2026-10-21T20:30"),
        },
        {
          type: "move",
          taskId: "t_defense",
          start: localIso("2026-10-21T21:00"),
          end: localIso("2026-10-21T23:00"),
        },
      ],
    ];

    const lockedIds = new Set(seed.expectedProposalTargets.allProposals.lockedTaskIds);
    expect(lockedIds.size).toBe(9);

    for (const ops of proposals) {
      const result = judge(ops);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.proposal.lockedTouched).toBe(seed.expectedProposalTargets.allProposals.lockedTouched);
      for (const op of ops) {
        // 方案只许动非 locked 的任务
        expect(lockedIds.has(op.type === "add" ? "" : op.taskId)).toBe(false);
      }
    }
  });

  it("动 locked 任务的方案直接作废（9 条固定课一条都不许挪）", () => {
    const result = judge([
      {
        type: "move",
        taskId: "t_lin_mon",
        start: localIso("2026-10-19T10:00"),
        end: localIso("2026-10-19T11:40"),
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.join()).toContain("固定块");
  });

  it("方案落地后仍然是同一批任务（整体替换，不产生重复）", () => {
    const result = judge([
      {
        type: "move",
        taskId: "t_defense",
        start: localIso("2026-10-22T09:00"),
        end: localIso("2026-10-22T11:00"),
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasksAfter).toHaveLength(18);
    expect(new Set(result.value.tasksAfter.map((task) => task.id)).size).toBe(18);
  });
});
