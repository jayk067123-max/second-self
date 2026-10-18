"use client";

import { useMemo } from "react";
import {
  DEFAULT_DETECT_CONFIG,
  minutesOnDay,
  type Conflict,
  type Severity,
} from "@/domain/conflicts";
import { tasksOnDay } from "@/domain/avatar";
import type { Task } from "@/domain/schemas/task";
import { formatClock, parseIsoToMs, weekdayLabel } from "@/domain/time";
import { shortDate } from "@/shared/datetime";
import { cn } from "@/shared/utils";
import { PriorityMark } from "@/ui/primitives";

/**
 * 近三天时间轴 —— 只渲染，不判定。
 *
 * 三条刻意的设计：
 * 1. **一行一件事**。手机上单手滑，两行一件会让「今天有几件」数不清；
 *    只有"正在进行"的那条才有第二行（还剩多少分钟），因为那是此刻唯一要行动的信息。
 * 2. **冲突贴着发生处**，不另开面板。看到 19:00 那两行，中间就该有一句"完全重叠"，
 *    再让他去别处找解释，等于要他对照两次。
 * 3. **不用分割线**（用户口径）。三天靠留白与圆角分组，靠视觉间距分层。
 */

type Entry =
  | { kind: "task"; task: Task }
  | { kind: "note"; conflict: Conflict };

const SEVERITY_STYLE: Record<Severity, { wrap: string; mark: string }> = {
  high: { wrap: "bg-prio-high-bg", mark: "bg-danger-500" },
  medium: { wrap: "bg-prio-mid-bg", mark: "bg-warn-500" },
  low: { wrap: "bg-ink-800", mark: "bg-ink-400" },
};

function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const sa = parseIsoToMs(a.start);
    const sb = parseIsoToMs(b.start);
    if (sa === null && sb === null) return a.priority - b.priority;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa - sb;
  });
}

/** 把冲突插到它涉及的第一条任务下面；超载是整天的事，挂到日头 */
function splitDayConflicts(dayTasks: Task[], dayConflicts: Conflict[]) {
  const afterTask = new Map<string, Conflict[]>();
  const atHead: Conflict[] = [];
  for (const conflict of dayConflicts) {
    if (conflict.conflictType === "overload") {
      atHead.push(conflict);
      continue;
    }
    const anchor = conflict.involvedTaskIds.find((id) => dayTasks.some((t) => t.id === id));
    if (!anchor) {
      atHead.push(conflict);
      continue;
    }
    const list = afterTask.get(anchor);
    if (list) list.push(conflict);
    else afterTask.set(anchor, [conflict]);
  }
  return { afterTask, atHead };
}

function compactMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

function ConflictNote({ conflict }: { conflict: Conflict }) {
  const style = SEVERITY_STYLE[conflict.severity];
  return (
    <li className={cn("ml-2 mr-1 my-0.5 flex items-start gap-2 rounded-xl px-2.5 py-1.5", style.wrap)}>
      {/* "!" 用 CSS 画，不依赖字体里有没有 emoji，换机器也不会变成彩色符号 */}
      <span
        aria-hidden
        className={cn(
          "mt-[1px] grid size-4 shrink-0 place-items-center rounded-[5px] text-[9px] font-bold leading-none text-on-solid",
          style.mark,
        )}
      >
        !
      </span>
      <p className="min-w-0 text-micro leading-snug text-ink-200">{conflict.humanMessage}</p>
    </li>
  );
}

export function ThreeDayAgenda({
  tasks,
  days,
  conflicts,
  nowMs,
}: {
  tasks: Task[];
  days: { dayKey: string; label: string }[];
  conflicts: Conflict[];
  /** 演示时钟：`正在进行` 的判定用它，不读系统时间 */
  nowMs: number;
}) {
  const limitMin = DEFAULT_DETECT_CONFIG.dayCapacityMin;
  const totalCount = useMemo(
    () => days.reduce((sum, day) => sum + tasksOnDay(tasks, day.dayKey).length, 0),
    [tasks, days],
  );

  return (
    <section className="rounded-card bg-ink-900 px-1.5 py-2 shadow-card sm:px-2.5 sm:py-3">
      <p className="sr-only">近三天共 {totalCount} 件事</p>

      {days.map((day, dayIndex) => {
        const dayTasks = sortTasks(tasksOnDay(tasks, day.dayKey));
        const dayConflicts = conflicts.filter((c) => c.date === day.dayKey);
        const { afterTask, atHead } = splitDayConflicts(dayTasks, dayConflicts);
        const loadMin = minutesOnDay(tasks, day.dayKey);
        const ratio = limitMin === 0 ? 0 : loadMin / limitMin;
        const over = ratio >= 1;
        const near = !over && ratio >= 0.7;

        const entries: Entry[] = [];
        for (const task of dayTasks) {
          entries.push({ kind: "task", task });
          for (const conflict of afterTask.get(task.id) ?? []) {
            entries.push({ kind: "note", conflict });
          }
        }

        return (
          <div
            key={day.dayKey}
            className={cn(dayIndex > 0 && "mt-1.5", "rounded-3xl px-1 pb-1.5 pt-2")}
          >
            <div className="flex items-center gap-2 px-2">
              <h2 className="text-section font-semibold text-ink-50">{day.label}</h2>
              <span className="tnum text-micro text-ink-400">
                {weekdayLabel(day.dayKey)} {day.dayKey.slice(5).replace("-", "/")}
              </span>
              {/* 负载只在"要紧"时出现：正常的一天不写 1:40/10:00，那是噪音 */}
              {over ? (
                <span className="tnum ml-auto text-micro font-semibold text-danger-400">
                  超上限 {compactMinutes(loadMin - limitMin)}
                </span>
              ) : near ? (
                <span className="tnum ml-auto text-micro text-warn-400">
                  {compactMinutes(loadMin)}/{compactMinutes(limitMin)}
                </span>
              ) : null}
            </div>

            {atHead.map((conflict) => (
              <ul key={conflict.conflictId} className="mt-0.5">
                <ConflictNote conflict={conflict} />
              </ul>
            ))}

            {entries.length === 0 ? null : (
              <ul className="mt-0.5 flex flex-col">
                {entries.map((entry) =>
                  entry.kind === "note" ? (
                    <ConflictNote key={entry.conflict.conflictId} conflict={entry.conflict} />
                  ) : (
                    <TaskRow key={entry.task.id} task={entry.task} nowMs={nowMs} />
                  ),
                )}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function TaskRow({ task, nowMs }: { task: Task; nowMs: number }) {
  const startMs = parseIsoToMs(task.start);
  const endMs = parseIsoToMs(task.end);
  const hasBlock = startMs !== null && endMs !== null && endMs > startMs;
  const ongoing = hasBlock && startMs <= nowMs && nowMs < endMs;
  const remainMin = hasBlock ? Math.round((endMs - nowMs) / 60000) : 0;
  const deadlineMs = parseIsoToMs(task.deadline);

  const meta = ongoing
    ? `正在进行 · 还剩 ${remainMin} 分`
    : hasBlock
      ? task.location
      : deadlineMs !== null
        ? `截止 ${shortDate(task.deadline)} ${formatClock(deadlineMs)}`
        : task.location;

  return (
    <li
      className={cn(
        "group flex items-center gap-2.5 rounded-2xl px-2 py-2 transition-colors duration-150 ease-standard",
        ongoing ? "bg-brand-500/8" : "hover:bg-ink-800/70",
      )}
    >
      <span className="tnum w-9 shrink-0 font-mono text-micro text-ink-400">
        {hasBlock ? formatClock(startMs) : "DDL"}
      </span>

      {/* 这一层必须自己给行高：外层 body 是 1.7，不给的话行盒被撑到 25.5px，一行变两行高 */}
      <span className="min-w-0 flex-1 truncate text-caption leading-[1.5]">
        <span className={cn(task.done ? "text-ink-400 line-through" : "text-ink-100")}>
          {task.title}
        </span>
        {meta ? (
          <>
            <span aria-hidden className="mx-1.5 text-micro text-ink-500">
              ·
            </span>
            <span className={cn("text-micro", ongoing ? "text-accent-300" : "text-ink-400")}>
              {meta}
            </span>
          </>
        ) : null}
      </span>

      <PriorityMark priority={task.priority} className="w-10 justify-end" />
    </li>
  );
}
