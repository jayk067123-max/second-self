"use client";

import { useState } from "react";
import { ParseTasksResponseSchema, type AiMode } from "@/domain/schemas/api";
import type { TaskDraft } from "@/domain/schemas/task";
import { todayKey } from "@/domain/time";
import { SAMPLE_INTAKE_TEXT } from "@/shared/samples";
import { usePlannerStore } from "@/store/planner";
import { Badge, Button, Card, CardText, CardTitle, Textarea } from "@/ui/primitives";
import { AiErrorNotice } from "./AiErrorNotice";
import { AiStatusSteps, type AiStep } from "./AiStatusSteps";
import { TaskCorrectionTable } from "./TaskCorrectionTable";

type Phase = "idle" | "parsing" | "review" | "done";

/**
 * 粘贴 → 解析 → 人工修正 → 入库。
 * 状态机只有 4 个态，任何结果都能落到可见的界面上（没有静默失败）。
 */
export function IntakePanel() {
  const [text, setText] = useState("");
  // dayKey 挂载时定一次：domain 的 todayKey 要求调用方注入时间，不许函数内读时钟
  const [dayKey] = useState(() => todayKey(Date.now()));
  const [phase, setPhase] = useState<Phase>("idle");
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [mode, setMode] = useState<AiMode | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [timings, setTimings] = useState<Array<{ phase: string; ms: number }>>([]);
  const [addedCount, setAddedCount] = useState(0);

  const addDrafts = usePlannerStore((s) => s.addDrafts);

  async function parse() {
    setPhase("parsing");
    setError(null);
    setNotes([]);
    setDrafts([]);
    setTimings([]);
    try {
      const res = await fetch("/api/ai/parse-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), dayKey }),
      });
      const json: unknown = await res.json();
      const parsed = ParseTasksResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError({ message: "服务端返回结构不符合契约，已拒绝使用", issues: [] });
        setPhase("idle");
        return;
      }
      setMode(parsed.data.mode);
      setTimings(parsed.data.timings);
      if (!parsed.data.ok) {
        setError({ message: parsed.data.error, issues: parsed.data.issues });
        setPhase("idle");
        return;
      }
      setDrafts(parsed.data.tasks);
      setNotes(parsed.data.droppedIssues);
      setPhase("review");
    } catch (err) {
      setError({
        message: err instanceof Error ? `请求失败：${err.message}` : "请求失败，请检查网络",
        issues: [],
      });
      setPhase("idle");
    }
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

  const steps: AiStep[] =
    phase === "parsing"
      ? [
          { label: "调用模型解析文本", status: "active" },
          { label: "按 zod 契约校验字段", status: "idle" },
          { label: "等你人工核对", status: "idle" },
        ]
      : phase === "review"
        ? [
            { label: "调用模型解析文本", status: "done", detail: mode === "demo" ? "demo 模式" : "已完成" },
            { label: "按 zod 契约校验字段", status: "done", detail: `${timings.length} 个阶段` },
            { label: "等你人工核对", status: "active" },
          ]
        : [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>粘贴 → 结构化</CardTitle>
          <CardText className="mt-1">群通知 / 课表 / DDL 原样贴进来，一行一件事</CardText>
        </div>
        {mode ? (
          <Badge tone={mode === "live" ? "brand" : "warn"}>
            {mode === "live" ? "真实模型" : "demo 模式"}
          </Badge>
        ) : null}
      </div>

      <Textarea
        aria-label="粘贴日程文本"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={SAMPLE_INTAKE_TEXT}
        maxLength={8000}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void parse()} disabled={text.trim().length < 5 || phase === "parsing"}>
          {phase === "parsing" ? "解析中…" : "解析成任务"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setText(SAMPLE_INTAKE_TEXT)}
          disabled={phase === "parsing"}
        >
          填入示例
        </Button>
        <span className="ml-auto text-micro text-ink-400">{text.trim().length} / 8000 字</span>
      </div>

      {phase === "parsing" ? <AiStatusSteps steps={steps} /> : null}

      {error ? (
        <AiErrorNotice
          message={error.message}
          issues={error.issues}
          onRetry={() => void parse()}
          retryLabel="重新解析"
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
              setPhase("idle");
            }}
          >
            再粘一段
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
