import type { TimetableBlock } from "@/domain/schedule";
import type { Task } from "@/domain/schemas/task";
import { isoWeekdayOf, minutesFromLocalMidnight, parseIsoToMs } from "@/domain/time";

/**
 * 「重传课表」面板的**旧表侧**取样：从当前任务里挑出可能属于这张课表的条目。
 *
 * 判据只认 `locked`（固定块）。**"有地点"不能当判据**：种子里「社团负责人会议」
 * 「答辩准备」「校运会志愿者培训」都带地点，一旦按"有地点"取样，它们在新表里当然找不到
 * → 被算成 5 条"删除" → 用户点一次确认就被真删掉。课表落地时一定是固定块
 * （学校排的课，与 `ManualAddForm` 里「固定课（重排不许移动）」那个勾同一个语义），
 * 没标固定的安排本来也不该被新课表覆盖。
 *
 * 光有 `locked` 还挡不住「启航兼职」（固定、有地点、周日）。所以再加一条范围线——
 * **新表里整周都没有的星期几，视为不归这张课表管**，不参与比对。取舍写在明处：
 * 宁可少删（漏报一门被取消的课），也不误删用户的安排；而"新表整个星期几都没有"
 * 通常意味着那天本来就没课，不是"课被取消了"。
 *
 * 反向保证：只要新表里出现那一天（例如新课表排了周日的课），该天的条目**照常参与比对**，
 * 这里没有按课程名做白名单。
 */
export function courseBlocksOf(
  tasks: readonly Task[],
  scopeWeekdays?: ReadonlySet<number>,
): TimetableBlock[] {
  const blocks: TimetableBlock[] = [];
  for (const task of tasks) {
    if (task.start === null || task.end === null) continue;
    if (task.locked !== true) continue;
    const startMs = parseIsoToMs(task.start);
    if (startMs === null) continue;
    const weekday = isoWeekdayOf(startMs);
    if (scopeWeekdays !== undefined && !scopeWeekdays.has(weekday)) continue;
    blocks.push({
      taskId: task.id,
      title: task.title,
      weekday,
      startMinute: minutesFromLocalMidnight(startMs),
      durationMin: Math.max(1, task.durationMin),
      location: task.location ?? null,
    });
  }
  return blocks;
}
