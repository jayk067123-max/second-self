"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/domain/schemas/task";
import { formatClock, parseIsoToMs } from "@/domain/time";
import { shortDate } from "@/shared/datetime";
import { cn } from "@/shared/utils";
import { Button, EmptyState, Input, PriorityMark } from "@/ui/primitives";

/**
 * 「任务」页 —— 全部任务 + 搜索 + 每条可溯源。
 *
 * 和「今日」的分工（用户要求两个视图不能长得像同一页）：
 *   今日 = 时间轴，回答"什么时候、会不会撞"；
 *   任务 = 档案库，回答"这条是从哪来的、原文还找不找得到"。
 * 所以这里不画时间轴、不画冲突，只按时间排一列，并把 rawTextOrigin 摊开。
 */

const SOURCE_LABEL: Record<Task["source"], string> = {
  text: "文本解析",
  manual: "手记",
};

function sortAll(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const sa = parseIsoToMs(a.start) ?? parseIsoToMs(a.deadline) ?? Number.MAX_SAFE_INTEGER;
    const sb = parseIsoToMs(b.start) ?? parseIsoToMs(b.deadline) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.priority - b.priority;
  });
}

/** 一行时间描述：有时间块写「10/20 08:00」，只有截止写「截止 …」 */
function whenText(task: Task): string {
  const start = parseIsoToMs(task.start);
  const deadline = parseIsoToMs(task.deadline);
  if (start !== null) return `${shortDate(task.start)} ${formatClock(start)}`;
  if (deadline !== null) return `截止 ${shortDate(task.deadline)} ${formatClock(deadline)}`;
  return "未排时间";
}

export function TabTasks({ tasks, onGoCapture }: { tasks: Task[]; onGoCapture: () => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = sortAll(tasks);
    if (!q) return sorted;
    // 搜索同时命中标题、地点与原文：用户记得住的往往是原话里的词
    return sorted.filter((task) =>
      [task.title, task.location ?? "", task.rawTextOrigin ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [tasks, query]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜标题、地点或原话"
          aria-label="搜索任务"
          className="h-10 rounded-pill bg-ink-900 px-4 shadow-soft"
        />
      </div>

      <p className="px-1 text-micro text-ink-400">
        {query.trim() ? `命中 ${filtered.length} / 共 ${tasks.length} 条` : `共 ${tasks.length} 条`}
      </p>

      {tasks.length === 0 ? (
        <div className="rounded-card bg-ink-900 px-2 py-2 shadow-card">
          <EmptyState
            bare
            className="py-8"
            icon="＋"
            title="还没有任务"
            description="这里会按时间列出你记过的每一条，连同它当初的原话。"
            action={
              <Button size="lg" onClick={onGoCapture}>
                去随手记
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card bg-ink-900 px-2 py-2 shadow-card">
          <EmptyState
            bare
            icon="○"
            title="没搜到"
            description={`没有含「${query.trim()}」的任务，换个词试试。`}
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                清空搜索
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col rounded-card bg-ink-900 p-1.5 shadow-card">
          {filtered.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-1 rounded-2xl px-2.5 py-2.5 transition-colors duration-150 ease-standard hover:bg-ink-800/60"
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-caption font-medium",
                      task.done ? "text-ink-400 line-through" : "text-ink-100",
                    )}
                  >
                    {task.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-micro text-ink-400">
                    <span className="tnum">{whenText(task)}</span>
                    <span aria-hidden>·</span>
                    <span>{SOURCE_LABEL[task.source]}</span>
                    {task.needsReview ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-warn-400">待你核对</span>
                      </>
                    ) : null}
                    {task.repeat ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>每周重复</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <PriorityMark priority={task.priority} />
              </div>

              {task.rawTextOrigin ? (
                <details className="group">
                  <summary className="w-fit cursor-pointer list-none text-micro text-ink-400 marker:content-none hover:text-ink-300">
                    看原始说明
                  </summary>
                  <p className="mt-1 rounded-xl bg-ink-800/70 px-2.5 py-1.5 text-micro leading-relaxed whitespace-pre-wrap text-ink-300">
                    {task.rawTextOrigin}
                  </p>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
