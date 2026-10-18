"use client";

import { type Conflict, describeConflict } from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { Badge, Card, CardText, CardTitle } from "@/ui/primitives";

const KIND_LABEL: Record<Conflict["kind"], string> = {
  overlap: "时间重叠",
  buffer: "缓冲不足",
  "daily-overload": "单日超载",
};

const KIND_TONE: Record<Conflict["kind"], "danger" | "warn" | "warn"> = {
  overlap: "danger",
  buffer: "warn",
  "daily-overload": "warn",
};

export function ConflictPanel({
  conflicts,
  tasks,
}: {
  conflicts: Conflict[];
  tasks: Task[];
}) {
  const counts = conflicts.reduce<Record<string, number>>((acc, conflict) => {
    acc[conflict.kind] = (acc[conflict.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>冲突检测</CardTitle>
          <CardText className="mt-1">纯函数判定：重叠 / 缓冲不足 15 分钟 / 单日超 10 小时</CardText>
        </div>
        <Badge tone={conflicts.length === 0 ? "ok" : "danger"}>
          {conflicts.length === 0 ? "无冲突" : `${conflicts.length} 项待处理`}
        </Badge>
      </div>

      {conflicts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(counts) as Conflict["kind"][]).map((kind) => (
            <span key={kind} className="font-mono text-micro text-ink-400">
              {KIND_LABEL[kind]} × {counts[kind]}
            </span>
          ))}
        </div>
      ) : null}

      {conflicts.length === 0 ? (
        <p className="rounded-sm bg-ok-500/10 px-3 py-4 text-center text-caption text-ok-400 ring-1 ring-inset ring-ok-500/25">
          今天的时间安排互不打架，缓冲也留够了。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conflicts.map((conflict, index) => (
            <li
              key={`${conflict.kind}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-sm bg-ink-800/70 px-3 py-2"
            >
              <Badge tone={KIND_TONE[conflict.kind]}>{KIND_LABEL[conflict.kind]}</Badge>
              <span className="min-w-0 flex-1 text-caption text-ink-200">
                {describeConflict(conflict, tasks)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
