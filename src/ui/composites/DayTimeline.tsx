"use client";

import type { Task } from "@/domain/schemas/task";
import { PRIORITY_LABEL } from "@/domain/schemas/task";
import { formatClock, formatDuration, parseIsoToMs } from "@/domain/time";
import { shortDate } from "@/shared/datetime";
import { Badge, Card, CardText, CardTitle, Dot, EmptyState } from "@/ui/primitives";
import { cn } from "@/shared/utils";

/**
 * 今日时间轴 —— 只渲染，不做业务判定。
 * 是否冲突由 props 传进来的集合决定（判定在 domain 里，已单测）。
 */
export function DayTimeline({
  tasks,
  conflictIds,
  onToggle,
  onRemove,
}: {
  tasks: Task[];
  conflictIds: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const sorted = [...tasks].sort((a, b) => {
    const sa = parseIsoToMs(a.start);
    const sb = parseIsoToMs(b.start);
    if (sa === null && sb === null) return a.priority - b.priority;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa - sb;
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <CardTitle>今日时间轴</CardTitle>
          <CardText className="mt-1">点勾选记完成，分身会跟着变</CardText>
        </div>
        <span className="font-mono text-micro text-ink-400">{tasks.length} 条</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="今天还是空的"
          description="把群通知或课表粘到上方「粘贴 → 结构化」，解析成任务后这里会按时间排开。"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-ink-700">
          {sorted.map((task) => {
            const startMs = parseIsoToMs(task.start);
            const endMs = parseIsoToMs(task.end);
            const hasBlock = startMs !== null && endMs !== null && endMs > startMs;
            const conflicted = conflictIds.has(task.id);
            const deadlineMs = parseIsoToMs(task.deadline);
            return (
              <li key={task.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`完成 ${task.title}`}
                  checked={task.done}
                  onChange={() => onToggle(task.id)}
                  className="size-4 shrink-0 accent-brand-500"
                />
                <span className="w-24 shrink-0 font-mono text-micro text-ink-300">
                  {hasBlock ? `${formatClock(startMs)}–${formatClock(endMs)}` : "未排时段"}
                  {!hasBlock && conflicted ? <Dot tone="danger" /> : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-caption",
                    task.done ? "text-ink-400 line-through" : "text-ink-100",
                  )}
                  title={task.rawTextOrigin ?? task.title}
                >
                  {task.title}
                </span>
                {conflicted && hasBlock ? (
                  <Badge tone="danger" className="shrink-0">
                    冲突
                  </Badge>
                ) : null}
                <Badge tone={task.priority === 1 ? "danger" : task.priority === 2 ? "neutral" : "brand"} className="shrink-0">
                  {PRIORITY_LABEL[task.priority as 1 | 2 | 3]}
                </Badge>
                <span className="w-20 shrink-0 text-right font-mono text-micro text-ink-400">
                  {task.durationMin > 0 ? formatDuration(task.durationMin) : "—"}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-micro text-ink-400">
                  {deadlineMs !== null ? `DDL ${shortDate(task.deadline)}` : ""}
                </span>
                <button
                  type="button"
                  aria-label={`删除 ${task.title}`}
                  onClick={() => onRemove(task.id)}
                  className="size-7 shrink-0 rounded-sm text-ink-400 transition-colors hover:bg-danger-500/15 hover:text-danger-400"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
