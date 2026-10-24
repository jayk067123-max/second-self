import { applyPlan, validatePlan, type ReplanPlan } from "./reflow";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "./conflicts";
import { dayKeyOf, msFromDayKey } from "./time";
import type { Task } from "./schemas/task";

export interface PlanContext { dayKey: string; now?: string; termStartDayKey?: string | null }
/** Shared server/client guard. AI output is a proposal, never authority. */
export function guardPlan(plan: ReplanPlan, tasks: readonly Task[], context: PlanContext) {
  const issues: string[] = [];
  const now = new Date(context.now ?? new Date(msFromDayKey(context.dayKey, 0)).toISOString());
  const detect = { ...DEFAULT_DETECT_CONFIG, termStartDayKey: context.termStartDayKey ?? null, repeatWindowStartDayKey: context.dayKey };
  const seen = new Set<string>();
  if (!plan.blocks.length) issues.push("方案没有任何变更");
  for (const block of plan.blocks) {
    const task = tasks.find(t => t.id === block.taskId);
    if (seen.has(block.taskId)) issues.push("同一任务重复出现");
    seen.add(block.taskId);
    if (!task) { issues.push("方案包含不存在的任务"); continue; }
    const changed = task.start !== block.start || task.end !== block.end;
    if (changed && (task.locked || task.repeat || task.done)) issues.push("固定、周期或已完成安排不可自动移动：" + task.title);
    if (changed && task.start && dayKeyOf(Date.parse(task.start)) !== context.dayKey) issues.push("只可移动所选日期的任务：" + task.title);
    if (context.now && changed && Date.parse(block.start) < now.getTime()) issues.push("不能把任务排入已过去的时间");
    const blockDay = dayKeyOf(Date.parse(block.start));
    const verdict = validatePlan({ ...plan, blocks: [block] }, tasks, blockDay);
    issues.push(...verdict.issues);
  }
  const after = applyPlan(tasks, plan);
  const beforeConflicts = detectConflicts(tasks, detect, now);
  const afterConflicts = detectConflicts(after, detect, now);
  const beforeKeys = new Set(beforeConflicts.map(c=>c.conflictId+"@"+c.date));
  // 同时检查顺延日的周期安排，不受默认两周窗口遗漏影响。
  for (const day of new Set(plan.blocks.map(block => dayKeyOf(Date.parse(block.start))))) {
    const targetConfig = { ...detect, repeatWindowStartDayKey: day };
    const before = new Set(detectConflicts(tasks, targetConfig, now).map(c => c.conflictId+"@"+c.date));
    for (const conflict of detectConflicts(after, targetConfig, now)) {
      if (conflict.conflictType !== "deadline" && !before.has(conflict.conflictId+"@"+conflict.date) && conflict.involvedTaskIds.some(id=>seen.has(id))) issues.push("顺延日期存在冲突："+conflict.humanMessage);
    }
  }
  for (const c of afterConflicts) {
    if (c.conflictType !== "deadline" && !beforeKeys.has(c.conflictId+"@"+c.date) && c.involvedTaskIds.some(id=>seen.has(id))) issues.push("方案引入新冲突："+c.humanMessage);
  }
  if (beforeConflicts.length && afterConflicts.length >= beforeConflicts.length) issues.push("方案未减少冲突，请调整后重新生成");
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
