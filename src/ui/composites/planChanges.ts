import type { ReplanPlan } from "@/domain/reflow";
import type { Task } from "@/domain/schemas/task";
import { dayKeyOf, formatClock, parseIsoToMs } from "@/domain/time";

/** 固定使用生成时快照，应用方案后仍能准确展示原时间。 */
export function planChanges(plan: ReplanPlan, tasks: readonly Task[]) {
  return plan.blocks.flatMap(block => {
    const task = tasks.find(item => item.id === block.taskId);
    if (task && parseIsoToMs(task.start) === parseIsoToMs(block.start) && parseIsoToMs(task.end) === parseIsoToMs(block.end)) return [];
    return [{ ...block, title: task?.title ?? "任务已删除", beforeStart: task?.start ?? null, beforeEnd: task?.end ?? null, missing: !task }];
  });
}

export function timeRangeLabel(start: string | null, end: string | null): string {
  const from = parseIsoToMs(start), to = parseIsoToMs(end);
  if (from === null || to === null) return "尚未安排";
  const date = (value: number) => { const [year, month, day] = dayKeyOf(value).split("-"); return year + "/" + Number(month) + "/" + Number(day); };
  return date(from) + " " + formatClock(from) + "–" + (dayKeyOf(from) === dayKeyOf(to) ? "" : date(to) + " ") + formatClock(to);
}
