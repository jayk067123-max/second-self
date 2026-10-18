import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_STACK_LIMIT,
  SnapshotSchema,
  SnapshotStackSchema,
  canRollback,
  commitWithSnapshot,
  countPendingEdits,
  emptySnapshotStack,
  latestSnapshot,
  needsRollbackConfirm,
  pushSnapshot,
  rollbackTo,
  snapshotHistory,
  snapshotSummary,
  tasksEqual,
} from "@/domain/snapshot";
import type { SnapshotStack } from "@/domain/snapshot";
import type { Task } from "@/domain/schemas/task";
import { DAY, DEMO_NOW, block } from "./support/tasks";

/**
 * 快照栈与回滚单测。
 *
 * 核心断言只有一句：**回滚后拿到的任务集，必须逐字段等于当时存进去的那一份**。
 * 因为回滚是整体替换而不是反向 op 回放，所以这个断言可以写得非常硬 ——
 * 不需要考虑"哪个操作该反着算"，也就没有"某类逆操作写错了"的漏测空间。
 */

const LATER = new Date(DEMO_NOW.getTime() + 60 * 60 * 1000);

function baseTasks(): Task[] {
  return [
    block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
    block(DAY, 10, 0, 11, 0, { id: "b", title: "社团例会", location: "教室A" }),
  ];
}

/** 把 b 从 10:00 挪到 11:00 的"应用后"状态 */
function movedTasks(): Task[] {
  return [
    block(DAY, 9, 0, 10, 0, { id: "a", title: "数据结构", location: "教室A" }),
    block(DAY, 11, 0, 12, 0, { id: "b", title: "社团例会", location: "教室A" }),
  ];
}

function stackAfterOneCommit(): SnapshotStack {
  const commit = commitWithSnapshot(emptySnapshotStack(), baseTasks(), movedTasks(), {
    at: DEMO_NOW,
    source: "proposal#1",
    opSummary: "应用「最小改动」：挪 1 条",
  });
  return commit.stack;
}

describe("pushSnapshot · 入栈与 parent 链", () => {
  it("第一次入栈：parent 为 null，currentId 指向它", () => {
    const stack = pushSnapshot(emptySnapshotStack(), {
      tasks: baseTasks(),
      at: DEMO_NOW,
      source: "manual",
      opSummary: "手动新增两条",
    });
    expect(stack.entries).toHaveLength(1);
    expect(stack.currentId).toBe("snap-001");
    expect(stack.entries[0]?.parentSnapshotId).toBeNull();
    expect(stack.entries[0]?.at).toBe(DEMO_NOW.toISOString());
  });

  it("连续入栈形成 parent 链", () => {
    let stack = emptySnapshotStack();
    stack = pushSnapshot(stack, { tasks: baseTasks(), at: DEMO_NOW, source: "manual", opSummary: "第一次" });
    stack = pushSnapshot(stack, { tasks: movedTasks(), at: LATER, source: "manual", opSummary: "第二次" });
    expect(stack.entries).toHaveLength(2);
    expect(stack.entries[1]?.parentSnapshotId).toBe("snap-001");
    expect(stack.currentId).toBe("snap-002");
  });

  it("不修改传入的栈（纯函数）", () => {
    const empty = emptySnapshotStack();
    pushSnapshot(empty, { tasks: baseTasks(), at: DEMO_NOW, source: "manual", opSummary: "x" });
    expect(empty.entries).toHaveLength(0);
    expect(empty.currentId).toBeNull();
  });

  it("快照持有的是副本：之后改原任务对象不会污染历史", () => {
    const tasks = baseTasks();
    const stack = pushSnapshot(emptySnapshotStack(), {
      tasks,
      at: DEMO_NOW,
      source: "manual",
      opSummary: "快照",
    });
    tasks[0]!.title = "被改过的标题";
    expect(stack.entries[0]?.tasksState[0]?.title).toBe("数据结构");
  });

  it("摘要为空时兜底成「未命名变更」", () => {
    const stack = pushSnapshot(emptySnapshotStack(), {
      tasks: [],
      at: DEMO_NOW,
      source: "manual",
      opSummary: "   ",
    });
    expect(stack.entries[0]?.opSummary).toBe("未命名变更");
  });
});

describe("栈上限 20 · 丢最旧且不留悬空引用", () => {
  it("推 25 次只留最近 20 条，currentId 指向最新", () => {
    let stack = emptySnapshotStack();
    for (let index = 1; index <= 25; index += 1) {
      stack = pushSnapshot(stack, {
        tasks: baseTasks(),
        at: DEMO_NOW,
        source: "manual",
        opSummary: `第 ${index} 次`,
      });
    }
    expect(SNAPSHOT_STACK_LIMIT).toBe(20);
    expect(stack.entries).toHaveLength(20);
    expect(stack.entries[0]?.snapshotId).toBe("snap-006");
    expect(stack.currentId).toBe("snap-025");
  });

  it("被淘汰的快照若还是别人的 parent，引用置 null 而不是悬空", () => {
    let stack = emptySnapshotStack();
    for (let index = 1; index <= 21; index += 1) {
      stack = pushSnapshot(stack, {
        tasks: baseTasks(),
        at: DEMO_NOW,
        source: "manual",
        opSummary: `第 ${index} 次`,
      });
    }
    expect(stack.entries[0]?.snapshotId).toBe("snap-002");
    expect(stack.entries[0]?.parentSnapshotId).toBeNull();
    expect(stack.entries[1]?.parentSnapshotId).toBe("snap-002");
  });
});

describe("rollbackTo · 整体替换，不做反向操作", () => {
  it("回滚后任务集逐字段等于入栈时那一份", () => {
    const before = baseTasks();
    const stack = stackAfterOneCommit();
    const result = rollbackTo(stack, "snap-001", { at: LATER });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(JSON.stringify(result.tasksState)).toBe(JSON.stringify(before));
    // 不是"把 b 反向挪回 10:00"：a 的任何字段都没有被重算过
    expect(result.tasksState[0]).toEqual(before[0]);
    expect(result.tasksState[1]).toEqual(before[1]);
  });

  it("回滚动作本身也入栈（source: rollback），currentId 指向它", () => {
    const stack = stackAfterOneCommit();
    const result = rollbackTo(stack, "snap-001", { at: LATER });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.stack.entries).toHaveLength(2);
    expect(result.snapshot.source).toBe("rollback");
    expect(result.snapshot.opSummary).toBe("回滚到 snap-001");
    expect(result.stack.currentId).toBe("snap-002");
    expect(result.snapshot.tasksState).toEqual(baseTasks());
  });

  it("支持重做回滚（同一个版本可以再跳一次）", () => {
    const first = rollbackTo(stackAfterOneCommit(), "snap-001", { at: LATER });
    expect(first).not.toBeNull();
    if (!first) return;
    const second = rollbackTo(first.stack, "snap-001", { at: LATER });
    expect(second).not.toBeNull();
    if (!second) return;
    expect(second.stack.entries).toHaveLength(3);
    expect(JSON.stringify(second.tasksState)).toBe(JSON.stringify(baseTasks()));
  });

  it("目标版本已被 20 条上限淘汰时返回 null，不抛异常", () => {
    const stack = stackAfterOneCommit();
    expect(rollbackTo(stack, "snap-999", { at: LATER })).toBeNull();
  });

  it("回滚后的状态被标记为已同步（此时不该再弹确认）", () => {
    const result = rollbackTo(stackAfterOneCommit(), "snap-001", { at: LATER });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(countPendingEdits(result.stack, result.tasksState)).toBe(0);
    expect(needsRollbackConfirm(result.stack, result.tasksState)).toBe(false);
  });
});

describe("commitWithSnapshot · 应用方案前的整体快照", () => {
  it("先入栈旧状态、再写回新状态", () => {
    const commit = commitWithSnapshot(emptySnapshotStack(), baseTasks(), movedTasks(), {
      at: DEMO_NOW,
      source: "proposal#1",
      opSummary: "应用「最小改动」：挪 1 条",
    });
    expect(commit.stack.entries).toHaveLength(1);
    expect(commit.stack.entries[0]?.tasksState).toEqual(baseTasks());
    expect(commit.tasksState).toEqual(movedTasks());
    expect(commit.stack.entries[0]?.source).toBe("proposal#1");
  });

  it("写回的状态是副本，改它不会改动栈里的记录", () => {
    const commit = commitWithSnapshot(emptySnapshotStack(), baseTasks(), movedTasks(), {
      at: DEMO_NOW,
      source: "proposal#1",
      opSummary: "应用",
    });
    commit.tasksState[0]!.title = "事后改的";
    expect(commit.stack.entries[0]?.tasksState[0]?.title).toBe("数据结构");
  });
});

describe("未快照的手动修改 · 回滚前必须二次确认", () => {
  it("刚提交完时没有待丢弃的修改", () => {
    const stack = stackAfterOneCommit();
    expect(countPendingEdits(stack, movedTasks())).toBe(0);
    expect(needsRollbackConfirm(stack, movedTasks())).toBe(false);
  });

  it("手改一处 → 计数为 1，需要确认", () => {
    const stack = stackAfterOneCommit();
    const edited = movedTasks();
    edited[0]!.title = "改了个名字";
    expect(countPendingEdits(stack, edited)).toBe(1);
    expect(needsRollbackConfirm(stack, edited)).toBe(true);
  });

  it("新增与删除任务也算改动", () => {
    const stack = stackAfterOneCommit();
    const added = [...movedTasks(), block(DAY, 14, 0, 15, 0, { id: "c", title: "临时加的" })];
    expect(countPendingEdits(stack, added)).toBe(1);

    const removed = movedTasks().slice(0, 1);
    expect(countPendingEdits(stack, removed)).toBe(1);
  });

  it("没有任何快照基准时不弹确认（没有可丢弃的东西）", () => {
    const empty = emptySnapshotStack();
    expect(countPendingEdits(empty, baseTasks())).toBe(0);
    expect(needsRollbackConfirm(empty, baseTasks())).toBe(false);
  });
});

describe("tasksEqual · 规范化比较", () => {
  it("字段顺序不同但取值相同 → 相等", () => {
    const [task] = baseTasks();
    if (!task) throw new Error("夹具异常");
    const reordered = Object.fromEntries(Object.entries(task).reverse()) as Task;
    expect(tasksEqual([task], [reordered])).toBe(true);
  });

  it("缺省值与显式 null 视为同一个意思", () => {
    const [task] = baseTasks();
    if (!task) throw new Error("夹具异常");
    const withUndefined = { ...task, location: undefined } as unknown as Task;
    const withNull = { ...task, location: null };
    expect(tasksEqual([withUndefined], [withNull])).toBe(true);
  });

  it("真改了值就不相等", () => {
    const [task] = baseTasks();
    if (!task) throw new Error("夹具异常");
    expect(tasksEqual([task], [{ ...task, durationMin: task.durationMin + 1 }])).toBe(false);
    expect(tasksEqual([task], [])).toBe(false);
  });
});

describe("历史面板与摘要", () => {
  it("历史倒序（最新在前），currentId 可在其中定位", () => {
    let stack = emptySnapshotStack();
    stack = pushSnapshot(stack, { tasks: baseTasks(), at: DEMO_NOW, source: "manual", opSummary: "一" });
    stack = pushSnapshot(stack, { tasks: movedTasks(), at: LATER, source: "proposal#1", opSummary: "二" });
    const history = snapshotHistory(stack);
    expect(history[0]?.snapshotId).toBe("snap-002");
    expect(history[1]?.snapshotId).toBe("snap-001");
    expect(history.some((entry) => entry.snapshotId === stack.currentId)).toBe(true);
  });

  it("摘要行含时间、来源与说明", () => {
    const [snapshot] = stackAfterOneCommit().entries;
    if (!snapshot) throw new Error("夹具异常");
    const line = snapshotSummary(snapshot);
    expect(line).toContain("proposal#1");
    expect(line).toContain("应用「最小改动」：挪 1 条");
    expect(line).toContain("·");
  });

  it("latestSnapshot / canRollback 反映栈状态", () => {
    const empty = emptySnapshotStack();
    expect(latestSnapshot(empty)).toBeNull();
    expect(canRollback(empty)).toBe(false);

    const stack = stackAfterOneCommit();
    expect(latestSnapshot(stack)?.snapshotId).toBe("snap-001");
    expect(canRollback(stack)).toBe(true);
  });
});

describe("契约与输入校验", () => {
  it("生成出来的快照与快照栈都能通过 zod 校验", () => {
    const stack = stackAfterOneCommit();
    expect(SnapshotStackSchema.safeParse(stack).success).toBe(true);
    const [snapshot] = stack.entries;
    if (!snapshot) throw new Error("夹具异常");
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("来源字符串必须符合约定（proposal#n / manual / parse / rollback）", () => {
    expect(SnapshotSchema.safeParse({ ...stackAfterOneCommit().entries[0], source: "随便写的" }).success).toBe(
      false,
    );
  });

  it("at 不合法时抛错（不允许偷偷读当前时间）", () => {
    expect(() =>
      pushSnapshot(emptySnapshotStack(), {
        tasks: [],
        at: new Date(Number.NaN),
        source: "manual",
        opSummary: "坏时间",
      }),
    ).toThrow(TypeError);
    expect(() => rollbackTo(stackAfterOneCommit(), "snap-001", { at: new Date(Number.NaN) })).toThrow(
      TypeError,
    );
  });
});
