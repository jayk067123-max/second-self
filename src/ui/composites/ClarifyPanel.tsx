"use client";

import { useMemo, useState } from "react";
import { describeMissing, diagnoseDraft, type ClarifyAnswer } from "@/domain/clarify";
import type { TaskDraft } from "@/domain/schemas/task";
import { Button, Input } from "@/ui/primitives";
import { nextQuestion, pendingCount, resolveAnswer } from "./clarifyQueue";

/**
 * 缺信息追问面板 —— 「一屏一问」，一次只问一句。
 *
 * 三条约束都落在这个文件里：
 *   1. **不写库**：只调 `onPatch(index, patch)` 把字段交回去，落库由 IntakePanel
 *      走同一个 `addDrafts`；
 *   2. 一屏一问，答完自动出下一题；答不上来就「这题先跳过」，绝不卡住；
 *   3. 「剩下的我自己改」随时可退 —— 退出不是失败，已经收进来的照样入库。
 *
 * 为什么不做成弹窗：手机上弹窗挡住输入法，而且用户可能想回头看原文。
 * 这块直接嵌在录入卡里，和修正表共处一页。
 */
export function ClarifyPanel({
  drafts,
  dayKey,
  onPatch,
  onFinish,
  onSkipAll,
}: {
  drafts: TaskDraft[];
  dayKey: string;
  /** 字段回写：调用方必须用 domain 的 `mergeDraftPatch` 合并（唯一合并入口） */
  onPatch: (index: number, patch: Partial<TaskDraft>) => void;
  /** 全部问完 → 去看修正表 */
  onFinish: () => void;
  /** 剩下的我自己改 → 直接看全览修正表 */
  onSkipAll: () => void;
}) {
  const [skipped, setSkipped] = useState<number[]>([]);
  const [freeText, setFreeText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [echoes, setEchoes] = useState<string[]>([]);

  const pending = useMemo(
    () => nextQuestion(drafts, dayKey, skipped),
    [drafts, dayKey, skipped],
  );
  const remaining = useMemo(
    () => pendingCount(drafts, dayKey, skipped),
    [drafts, dayKey, skipped],
  );

  function submit(answer: ClarifyAnswer) {
    if (pending === null) return;
    const outcome = resolveAnswer(pending, answer, dayKey);
    if (!outcome.ok) {
      setHint(outcome.message);
      return;
    }
    setHint(null);
    setFreeText("");
    if (outcome.skipDraft) setSkipped((prev) => [...prev, pending.index]);
    setEchoes((prev) => [...prev, outcome.echo]);
    onPatch(pending.index, outcome.patch);
  }

  // 全部问完：给一个明确的出口，而不是自动跳走（用户要有"我答完了"的实感）
  if (pending === null) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-ok-500/10 px-4 py-3 ring-1 ring-inset ring-ok-500/30">
        <p className="text-caption font-medium text-ok-400">缺的信息都补齐了</p>
        <p className="text-micro leading-relaxed text-ink-300">
          {echoes.length > 0 ? `刚才补了 ${echoes.length} 条。` : ""}
          下面逐条核对一遍，确认没问题就入库。
        </p>
        {echoes.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-micro text-ink-400">
            {echoes.map((echo) => (
              <li key={echo}>{echo}</li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button onClick={onFinish} className="h-9 px-4 text-micro">
            去核对并入库
          </Button>
        </div>
      </div>
    );
  }

  const diagnosis = diagnoseDraft(pending.draft);
  const missingText = describeMissing(diagnosis, dayKey);
  const question = pending.question;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ink-800/70 px-4 py-3.5 ring-1 ring-inset ring-ink-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-micro font-medium text-brand-500">还差一点信息</p>
        <p className="text-micro text-ink-400">
          还有 {remaining} 条要问 · 第 {pending.index + 1} / {drafts.length} 条
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-caption font-medium text-ink-50" title={pending.draft.title}>
          {pending.draft.title}
        </p>
        {missingText !== null ? <p className="mt-0.5 text-micro text-ink-400">{missingText}</p> : null}
      </div>

      <p className="text-body text-ink-100">{question.prompt}</p>

      <div className="grid grid-cols-2 gap-2">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => submit({ source: "option", optionId: option.id })}
            className="flex min-h-11 flex-col items-start justify-center rounded-xl bg-ink-900 px-3 py-2 text-left ring-1 ring-inset ring-ink-600 transition-colors duration-200 hover:bg-ink-700 hover:ring-brand-600"
          >
            <span className="text-caption font-medium text-ink-100">{option.label}</span>
            {option.hint !== undefined ? (
              <span className="text-[11px] text-ink-400">{option.hint}</span>
            ) : null}
          </button>
        ))}
      </div>

      {question.freeInputPlaceholder !== null ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input
              aria-label="自由输入回答"
              value={freeText}
              placeholder={question.freeInputPlaceholder}
              onChange={(event) => {
                setFreeText(event.target.value);
                setHint(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && freeText.trim().length > 0) {
                  submit({ source: "free", text: freeText });
                }
              }}
              className="h-9"
            />
            <Button
              variant="secondary"
              onClick={() => submit({ source: "free", text: freeText })}
              disabled={freeText.trim().length === 0}
              className="h-9 shrink-0 px-3 text-micro"
            >
              就这个
            </Button>
          </div>
          {hint !== null ? <p className="text-micro text-danger-400">{hint}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 pt-2.5">
        <Button
          variant="ghost"
          onClick={() => submit({ source: "skip" })}
          className="h-8 px-2.5 text-micro"
        >
          这题先跳过
        </Button>
        <Button variant="ghost" onClick={onSkipAll} className="h-8 px-2.5 text-micro">
          剩下的我自己改
        </Button>
      </div>
    </div>
  );
}
