"use client";

import { useState } from "react";
import type { CoverageReport, SourceLine } from "@/domain/completeness";
import type { AiMode } from "@/domain/schemas/api";
import type { TaskDraft } from "@/domain/schemas/task";
import { todayKey } from "@/domain/time";
import { SAMPLE_INTAKE_TEXT } from "@/shared/samples";
import { usePlannerStore } from "@/data/store";
import { Badge, Button, Card, CardText, CardTitle, Textarea } from "@/ui/primitives";
import { AiFailureCard } from "./AiFailureCard";
import { AiStatusSteps, type AiStep } from "./AiStatusSteps";
import { ImageIntake } from "./ImageIntake";
import { TaskCorrectionTable } from "./TaskCorrectionTable";
import { UncoveredNotice } from "./UncoveredNotice";
import { requestParseImage, requestParseText, type IntakeOutcome } from "./intakeClient";

type Phase = "idle" | "parsing" | "review" | "done";
type IntakeMode = "text" | "image";

/** 重试要用的输入快照：点「一键重试」时不该让用户重选图 */
type LastInput =
  | { kind: "text"; text: string }
  | { kind: "image"; file: File; hint: string };

/**
 * 录入 → 解析 → 人工修正 → 入库。两个入口（粘贴文本 / 上传图片）共用一套状态机。
 *
 * 三条不许违反的约束：
 *   1. 任何结果都要落到可见界面：没有静默失败、没有白屏；
 *   2. 解析成功不等于完整性通过 —— `coverage.uncovered` 必须展示给用户，
 *      每一行原文要么进库、要么被用户明确确认不重要；
 *   3. 结构校验在客户端再做一次（intakeClient 里），不信任任何外部返回。
 */
export function IntakePanel() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<IntakeMode>("text");
  // dayKey 挂载时定一次：domain 的 todayKey 要求调用方注入时间，不许函数内读时钟
  const [dayKey] = useState(() => todayKey(Date.now()));
  const [phase, setPhase] = useState<Phase>("idle");
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[]; raw?: string } | null>(
    null,
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [timings, setTimings] = useState<Array<{ phase: string; ms: number }>>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [dismissedLines, setDismissedLines] = useState<number[]>([]);
  const [adoptedLines, setAdoptedLines] = useState<number[]>([]);
  const [lastInput, setLastInput] = useState<LastInput | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const addDrafts = usePlannerStore((s) => s.addDrafts);

  function resetResult() {
    setError(null);
    setDrafts([]);
    setNotes([]);
    setTimings([]);
    setCoverage(null);
    setDismissedLines([]);
    setAdoptedLines([]);
  }

  function applyOutcome(outcome: IntakeOutcome) {
    if (outcome.kind === "fail") {
      setError({ message: outcome.message, issues: outcome.issues, raw: outcome.raw });
      setPhase("idle");
      return;
    }
    setAiMode(outcome.response.mode);
    setTimings(outcome.response.timings);
    setDrafts(outcome.response.tasks);
    setNotes(outcome.response.droppedIssues);
    setCoverage(outcome.response.coverage);
    setPhase("review");
  }

  async function runText(snapshot: { text: string }) {
    setPhase("parsing");
    resetResult();
    setLastInput({ kind: "text", text: snapshot.text });
    applyOutcome(await requestParseText({ text: snapshot.text, dayKey }));
  }

  async function runImage(snapshot: { file: File; hint: string }) {
    setPhase("parsing");
    resetResult();
    setLastInput({ kind: "image", file: snapshot.file, hint: snapshot.hint });
    applyOutcome(await requestParseImage({ file: snapshot.file, dayKey, hint: snapshot.hint }));
  }

  function retry() {
    if (lastInput === null) return;
    if (lastInput.kind === "text") void runText({ text: lastInput.text });
    else void runImage({ file: lastInput.file, hint: lastInput.hint });
  }

  /** 把"没看懂"的一行补成任务：进修正表，用户可以再编辑，也可以直接确认 */
  function adoptLine(line: SourceLine) {
    const title = line.text.replace(/^[\s\d.、)）]+/, "").slice(0, 200);
    const draft: TaskDraft = {
      title: title.length > 0 ? title : line.text.slice(0, 200),
      start: null,
      end: null,
      durationMin: 0,
      deadline: null,
      priority: 2,
      rawTextOrigin: line.text.slice(0, 500),
      needsReview: true,
      repeat: null,
    };
    setDrafts((prev) => [...prev, draft]);
    setAdoptedLines((prev) => [...prev, line.lineNo]);
  }

  function confirm() {
    const result = addDrafts(drafts, "text");
    if (!result.ok) {
      setError({ message: `入库失败：${result.error ?? "未知原因"}`, issues: [] });
      return;
    }
    setAddedCount(result.added ?? drafts.length);
    setDrafts([]);
    setPhase("done");
  }

  const busy = phase === "parsing";
  const steps: AiStep[] =
    phase === "parsing"
      ? [
          { label: mode === "image" ? "压缩图片并上传" : "提交原文", status: "active" },
          { label: "调用模型结构化 + zod 校验", status: "idle" },
          { label: "逐行核对完整性", status: "idle" },
          { label: "等你人工核对", status: "idle" },
        ]
      : phase === "review"
        ? [
            { label: mode === "image" ? "压缩图片并上传" : "提交原文", status: "done" },
            {
              label: "调用模型结构化 + zod 校验",
              status: "done",
              detail:
                aiMode === "demo" ? "demo 模式" : `${timings.length} 个阶段 · 已过契约`,
            },
            {
              label: "逐行核对完整性",
              status: "done",
              detail: coverage === null ? "未核对" : coverage.verified ? "已用原文重算" : "图片路径未复核",
            },
            { label: "等你人工核对", status: "active" },
          ]
        : [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>随手一记 → 结构化</CardTitle>
          <CardText className="mt-1">
            群通知、课表截图、作业照片都行，不用填字段；漏掉的每一行都会请你确认
          </CardText>
        </div>
        {aiMode ? (
          <Badge tone={aiMode === "live" ? "brand" : "warn"}>
            {aiMode === "live" ? "真实模型" : "demo 模式"}
          </Badge>
        ) : null}
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="录入方式">
        {(
          [
            { key: "text", label: "粘贴文本" },
            { key: "image", label: "上传图片" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={mode === tab.key}
            type="button"
            onClick={() => setMode(tab.key)}
            disabled={busy}
            className={
              "rounded-pill px-3 py-1.5 text-micro font-medium transition-colors " +
              (mode === tab.key
                ? "bg-brand-600/25 text-brand-300 ring-1 ring-inset ring-brand-600/50"
                : "bg-ink-800 text-ink-300 hover:text-ink-100")
            }
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto self-center text-micro text-ink-400">{dayKey}</span>
      </div>

      {mode === "text" ? (
        <>
          <Textarea
            aria-label="粘贴日程文本"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE_INTAKE_TEXT}
            maxLength={8000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void runText({ text })} disabled={text.trim().length < 5 || busy}>
              {busy ? "解析中…" : "解析成任务"}
            </Button>
            <Button variant="secondary" onClick={() => setText(SAMPLE_INTAKE_TEXT)} disabled={busy}>
              填入示例
            </Button>
            <span className="ml-auto text-micro text-ink-400">{text.trim().length} / 8000 字</span>
          </div>
        </>
      ) : (
        <ImageIntake busy={busy} onSubmit={(file, hint) => void runImage({ file, hint })} />
      )}

      {busy ? <AiStatusSteps steps={steps} /> : null}

      {error ? (
        <AiFailureCard
          message={error.message}
          issues={error.issues}
          rawOutput={error.raw}
          onRetry={retry}
          onManualFix={() => {
            // 出路二：转到手动新增，用户自己把这条录进去
            document.getElementById("manual-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
            document.getElementById("manual-title")?.focus();
          }}
          onBack={() => {
            setError(null);
            setPhase("idle");
          }}
          busy={busy}
        />
      ) : null}

      {phase === "review" && drafts.length > 0 ? (
        <>
          <AiStatusSteps steps={steps} />
          {notes.length > 0 ? (
            <div className="rounded-sm bg-warn-500/10 px-3 py-2 text-micro text-warn-400 ring-1 ring-inset ring-warn-500/30">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
          {coverage !== null ? (
            <UncoveredNotice
              coverage={coverage}
              dismissedLineNos={dismissedLines}
              adoptedLineNos={adoptedLines}
              onAdopt={adoptLine}
              onDismiss={(lineNo) => setDismissedLines((prev) => [...prev, lineNo])}
              onRestore={(lineNo) =>
                setDismissedLines((prev) => prev.filter((value) => value !== lineNo))
              }
            />
          ) : null}
          <TaskCorrectionTable
            drafts={drafts}
            onChange={(index, patch) =>
              setDrafts((prev) =>
                prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
              )
            }
            onRemove={(index) => setDrafts((prev) => prev.filter((_, i) => i !== index))}
            onConfirm={confirm}
            onCancel={() => {
              setDrafts([]);
              setPhase("idle");
            }}
          />
        </>
      ) : null}

      {phase === "done" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-ok-500/10 px-3 py-2 text-caption text-ok-400 ring-1 ring-inset ring-ok-500/30">
          <span>已入库 {addedCount} 条，去下面「今日时间轴」看冲突和重排建议。</span>
          <Button
            variant="ghost"
            className="h-8 px-3 text-micro"
            onClick={() => {
              setText("");
              resetResult();
              setPhase("idle");
            }}
          >
            再记一条
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
