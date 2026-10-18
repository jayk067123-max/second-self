"use client";

import { useState } from "react";
import {
  CONFLICT_TYPE_LABEL,
  describeConflict,
  foldConflicts,
  DEFAULT_DETECT_CONFIG,
  type Conflict,
  type Severity,
} from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { Badge, Button, Card, CardText, CardTitle, StatusBanner } from "@/ui/primitives";

const SEVERITY_TONE: Record<Severity, "danger" | "warn" | "brand"> = {
  high: "danger",
  medium: "warn",
  low: "brand",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "必须处理",
  medium: "建议处理",
  low: "留意",
};

/**
 * 冲突面板 —— 纯展示。
 * 判定全在 domain/conflicts.ts（纯函数、有单测）；这里只负责把证据摊开让人看懂。
 */
export function ConflictPanel({
  conflicts,
  tasks,
}: {
  conflicts: Conflict[];
  tasks: Task[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, foldedCount } = foldConflicts(conflicts, DEFAULT_DETECT_CONFIG);
  const visible = expanded ? conflicts : shown;
  const highCount = conflicts.filter((c) => c.severity === "high").length;
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>冲突检测</CardTitle>
          <CardText className="mt-1">
            4 条规则全本地判定：重叠 / 来不及 / 单日超载 / 截止逼近
          </CardText>
        </div>
        <Badge tone={conflicts.length === 0 ? "ok" : highCount > 0 ? "danger" : "warn"}>
          {conflicts.length === 0 ? "无冲突" : `${conflicts.length} 项 · ${highCount} 项紧急`}
        </Badge>
      </div>

      {conflicts.length === 0 ? (
        <StatusBanner tone="ok" title="无冲突">
          时间安排互不打架，缓冲也留够了。
        </StatusBanner>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((conflict) => (
              <li
                key={`${conflict.conflictId}-${conflict.date}`}
                className="flex flex-col gap-1 rounded-2xl bg-ink-800/70 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONE[conflict.severity]}>
                    {CONFLICT_TYPE_LABEL[conflict.conflictType]}
                  </Badge>
                  <span className="text-caption text-ink-200">{describeConflict(conflict)}</span>
                  <span className="ml-auto shrink-0 font-mono text-micro text-ink-400">
                    {conflict.date}
                  </span>
                </div>
                {conflict.involvedTaskIds.length > 0 ? (
                  <p className="truncate text-micro text-ink-400">
                    {conflict.involvedTaskIds
                      .map((id) => titleById.get(id) ?? "已删除任务")
                      .join(" / ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {foldedCount > 0 ? (
            <Button
              variant="ghost"
              className="h-8 w-fit px-3 text-micro"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收起" : `另外 ${foldedCount} 条`}
            </Button>
          ) : null}
          <p className="text-micro text-ink-400">
            规则版本 {conflicts[0]?.ruleVersion ?? "—"} · 分级 {SEVERITY_LABEL.high} /{" "}
            {SEVERITY_LABEL.medium} / {SEVERITY_LABEL.low}
          </p>
        </>
      )}
    </Card>
  );
}
