import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import { applyPlan, type ReplanPlan } from "@/domain/reflow";
import type { Task } from "@/domain/schemas/task";
import { parseIsoToMs } from "@/domain/time";

/**
 * 方案卡的 4 个数字（SPEC · 重排方案卡固定指标）：
 *   挪动 N 条 / 冲突 X→Y / 偏离 M 分钟 / 固定课被挪 0 条（非 0 直接作废）
 *
 * 这里只做"把 domain 的纯函数结果拼成卡片要的数字"，不含任何判定逻辑 ——
 * 合法性由 reflow 的裁决器决定，冲突由 conflicts 的规则决定，本文件只读数。
 */
export interface PlanMetrics {
  movedCount: number;
  conflictsBefore: number;
  conflictsAfter: number;
  /** 被移动任务的开始时间偏移总和（分钟）。原本没排时段的任务不算偏离。 */
  deviationMin: number;
  /** 被移动的固定课标题；非空即方案作废（locked 是用户权威标记） */
  movedLockedTitles: string[];
}

export function computePlanMetrics(
  plan: ReplanPlan,
  tasks: readonly Task[],
  now: Date,
  config = DEFAULT_DETECT_CONFIG,
): PlanMetrics {
  const next = applyPlan(tasks, plan);
  const before = detectConflicts(tasks, config, now);
  const after = detectConflicts(next, config, now);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  let movedCount = 0;
  let deviationMin = 0;
  const movedLockedTitles: string[] = [];

  for (const block of plan.blocks) {
    const original = byId.get(block.taskId);
    if (!original) continue;
    if (original.start === block.start && original.end === block.end) continue;

    movedCount += 1;
    if (original.locked) movedLockedTitles.push(original.title);

    const from = parseIsoToMs(original.start);
    const to = parseIsoToMs(block.start);
    // 原来没排时段 = 新排入，不算"偏离用户既有安排"
    if (from !== null && to !== null) {
      deviationMin += Math.round(Math.abs(to - from) / 60_000);
    }
  }

  return {
    movedCount,
    conflictsBefore: before.length,
    conflictsAfter: after.length,
    deviationMin,
    movedLockedTitles,
  };
}
