"use client";

import type { TaskDraft } from "@/domain/schemas/task";
import { PRIORITY_LABEL } from "@/domain/schemas/task";
import { isoToLocalInput, localInputToIso, minutesToInput } from "@/shared/datetime";
import { cn } from "@/shared/utils";
import { Button, Input, Select } from "@/ui/primitives";

/**
 * 人工修正表 —— 第二道防线的核心。
 * AI 解析结果**不直接入库**，必须先在这里逐行核对/改错，用户点"确认入库"才落库。
 */
export function TaskCorrectionTable({
  drafts,
  onChange,
  onRemove,
  onConfirm,
  onCancel,
  confirmLabel = "确认入库",
}: {
  drafts: TaskDraft[];
  onChange: (index: number, patch: Partial<TaskDraft>) => void;
  onRemove: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}) {
  function patchTime(index: number, field: "start" | "end", value: string) {
    const draft = drafts[index];
    if (!draft) return;
    const nextIso = localInputToIso(value);
    const patch: Partial<TaskDraft> = { [field]: nextIso, needsReview: false };
    const startIso = field === "start" ? nextIso : draft.start;
    const endIso = field === "end" ? nextIso : draft.end;
    if (startIso && endIso) {
      const diff = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
      if (Number.isFinite(diff) && diff >= 0) patch.durationMin = diff;
    } else if (field === "start" && nextIso === null) {
      patch.end = null;
    }
    onChange(index, patch);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-micro text-ink-400">
          共 {drafts.length} 条 · 黄色行是 AI 自评没把握的（needsReview），优先核对这几条。改完再确认。
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} className="h-8 px-3 text-micro">
            放弃
          </Button>
          <Button onClick={onConfirm} className="h-8 px-3 text-micro" disabled={drafts.length === 0}>
            {confirmLabel}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm ring-1 ring-inset ring-ink-700">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[2.2fr_1.3fr_1.3fr_0.8fr_1fr_1.4fr_2rem] gap-2 bg-ink-800/80 px-2 py-1.5 text-micro font-medium text-ink-400">
            <span>标题</span>
            <span>开始</span>
            <span>结束</span>
            <span>时长(分)</span>
            <span>优先级</span>
            <span>截止</span>
            <span />
          </div>
          <ul className="divide-y divide-ink-700">
            {drafts.map((draft, index) => (
              <li
                key={`${index}-${draft.rawTextOrigin ?? draft.title}`}
                className={cn(
                  "grid grid-cols-[2.2fr_1.3fr_1.3fr_0.8fr_1fr_1.4fr_2rem] items-center gap-2 px-2 py-1.5",
                  draft.needsReview && "bg-warn-500/[0.06]",
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <Input
                    aria-label={`第 ${index + 1} 条标题`}
                    value={draft.title}
                    onChange={(e) => onChange(index, { title: e.target.value, needsReview: false })}
                    className="h-8"
                  />
                  {draft.needsReview ? (
                    <span className="shrink-0 rounded-pill bg-warn-500/15 px-1.5 py-0.5 text-[10px] text-warn-400">
                      待确认
                    </span>
                  ) : null}
                </div>
                <Input
                  aria-label={`第 ${index + 1} 条开始时间`}
                  type="datetime-local"
                  value={isoToLocalInput(draft.start)}
                  onChange={(e) => patchTime(index, "start", e.target.value)}
                  className="h-8 px-2 text-micro"
                />
                <Input
                  aria-label={`第 ${index + 1} 条结束时间`}
                  type="datetime-local"
                  value={isoToLocalInput(draft.end)}
                  onChange={(e) => patchTime(index, "end", e.target.value)}
                  className="h-8 px-2 text-micro"
                />
                <Input
                  aria-label={`第 ${index + 1} 条时长`}
                  type="number"
                  min={0}
                  max={1440}
                  step={5}
                  value={minutesToInput(draft.durationMin)}
                  onChange={(e) =>
                    onChange(index, { durationMin: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="h-8 px-2 text-micro"
                />
                <Select
                  aria-label={`第 ${index + 1} 条优先级`}
                  value={draft.priority}
                  onChange={(e) =>
                    onChange(index, { priority: Number(e.target.value) as 1 | 2 | 3 })
                  }
                  className="h-8 px-2 text-micro"
                >
                  {[1, 2, 3].map((p) => (
                    <option key={p} value={p}>
                      {p} · {PRIORITY_LABEL[p as 1 | 2 | 3]}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`第 ${index + 1} 条截止时间`}
                  type="datetime-local"
                  value={isoToLocalInput(draft.deadline)}
                  onChange={(e) => onChange(index, { deadline: localInputToIso(e.target.value) })}
                  className="h-8 px-2 text-micro"
                />
                <button
                  type="button"
                  aria-label={`删除第 ${index + 1} 条`}
                  onClick={() => onRemove(index)}
                  className="h-8 w-8 rounded-sm text-ink-400 transition-colors hover:bg-danger-500/15 hover:text-danger-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
