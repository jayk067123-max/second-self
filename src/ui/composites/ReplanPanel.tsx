"use client";

import { useState } from "react";
import { summarizePlan, type ReplanPlan } from "@/domain/planner";
import type { Task } from "@/domain/schemas/task";
import {
  ReplanResponseSchema,
  type ReplanSuccess,
} from "@/domain/schemas/api";
import { formatClock, formatDuration, parseIsoToMs } from "@/domain/time";
import { usePlannerStore } from "@/store/planner";
import { Badge, Button, Card, CardText, CardTitle } from "@/ui/primitives";
import { AiErrorNotice } from "./AiErrorNotice";
import { AiStatusSteps, type AiStep } from "./AiStatusSteps";

type Phase = "idle" | "loading" | "ready";

/**
 * 重排建议 —— 模型只给方案与理由，合法性由 domain.validatePlan 判定。
 * 被判死的方案连同原因显示出来，用户看得见"AI 没有被无脑信任"。
 */
export function ReplanPanel({ tasks, dayKey }: { tasks: Task[]; dayKey: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReplanSuccess | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);
  const applyPlanWithSnapshot = usePlannerStore((s) => s.applyPlanWithSnapshot);

  async function request() {
    setPhase("loading");
    setError(null);
    setAppliedTitle(null);
    try {
      const res = await fetch("/api/ai/replan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tasks, dayKey }),
      });
      const json: unknown = await res.json();
      const parsed = ReplanResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError({ message: "服务端返回结构不符合契约，已拒绝使用", issues: [] });
        setPhase("idle");
        return;
      }
      if (!parsed.data.ok) {
        setError({ message: parsed.data.error, issues: parsed.data.issues });
        setPhase("idle");
        return;
      }
      setResult(parsed.data);
      setPhase("ready");
    } catch (err) {
      setError({
        message: err instanceof Error ? `请求失败：${err.message}` : "请求失败，请检查网络",
        issues: [],
      });
      setPhase("idle");
    }
  }

  function apply(plan: ReplanPlan) {
    const outcome = applyPlanWithSnapshot(plan);
    if (!outcome.ok) {
      setError({ message: `写回失败：${outcome.error ?? "未知原因"}`, issues: [] });
      return;
    }
    setAppliedTitle(plan.title);
  }

  const steps: AiStep[] =
    phase === "loading"
      ? [
          { label: "请求重排方案（模型只给思路）", status: "active" },
          { label: "本地合法性校验：不重叠 / 不越界 / 不超载", status: "idle" },
          { label: "等你挑一套", status: "idle" },
        ]
      : phase === "ready"
        ? [
            { label: "请求重排方案（模型只给思路）", status: "done" },
            {
              label: "本地合法性校验：不重叠 / 不越界 / 不超载",
              status: "done",
              detail: result ? `否决 ${result.rejected.length} 套` : undefined,
            },
            { label: "等你挑一套", status: "active" },
          ]
        : [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>重排建议</CardTitle>
          <CardText className="mt-1">最多三套方案并排对比，选中即写回，可撤销</CardText>
        </div>
        <div className="flex items-center gap-2">
          {appliedTitle ? <Badge tone="ok">已写回 · 可撤销</Badge> : null}
          <Button onClick={() => void request()} disabled={phase === "loading" || tasks.length === 0}>
            {phase === "loading" ? "重排中…" : "生成重排方案"}
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-micro text-ink-400">先入库几条任务，再来重排。</p>
      ) : null}

      <AiStatusSteps steps={steps} />

      {error ? (
        <AiErrorNotice
          message={error.message}
          issues={error.issues}
          onRetry={() => void request()}
          retryLabel="重新生成"
        />
      ) : null}

      {result?.fallback ? (
        <div className="rounded-sm bg-warn-500/10 px-3 py-2 text-micro text-warn-400 ring-1 ring-inset ring-warn-500/30">
          模型给的方案全部没通过本地校验，已自动改用确定性兜底方案。下面是能落地的那几套。
        </div>
      ) : null}

      {phase === "ready" && result ? (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {result.plans.map((plan) => {
              const summary = summarizePlan(plan);
              return (
                <div
                  key={plan.id}
                  className="flex flex-col gap-2 rounded-md bg-ink-800/70 p-3 ring-1 ring-inset ring-ink-700"
                >
                  <p className="text-caption font-semibold text-ink-50">{plan.title}</p>
                  <p className="text-micro leading-relaxed text-ink-300">{plan.rationale}</p>
                  <p className="font-mono text-micro text-ink-400">
                    {summary.count} 项 · {formatDuration(summary.totalMin)} · 最晚到 {summary.lastEnd}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {plan.blocks.map((block) => {
                      const startMs = parseIsoToMs(block.start);
                      const endMs = parseIsoToMs(block.end);
                      const title =
                        tasks.find((t) => t.id === block.taskId)?.title ?? "（任务已被删除）";
                      return (
                        <li key={`${plan.id}-${block.taskId}`} className="flex gap-2 text-micro text-ink-200">
                          <span className="shrink-0 font-mono text-ink-400">
                            {startMs !== null ? formatClock(startMs) : "--:--"}–{endMs !== null ? formatClock(endMs) : "--:--"}
                          </span>
                          <span className="truncate">{title}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    variant={appliedTitle === plan.title ? "secondary" : "primary"}
                    className="mt-auto h-8 px-3 text-micro"
                    onClick={() => apply(plan)}
                  >
                    {appliedTitle === plan.title ? "已应用" : "用这套"}
                  </Button>
                </div>
              );
            })}
          </div>

          {result.rejected.length > 0 ? (
            <details className="rounded-sm bg-ink-800/50 px-3 py-2 text-micro text-ink-300">
              <summary className="cursor-pointer select-none">
                被本地校验否决的方案（{result.rejected.length} 套）
              </summary>
              <ul className="mt-2 space-y-1.5">
                {result.rejected.map((rejected) => (
                  <li key={rejected.title}>
                    <span className="text-danger-400">{rejected.title}</span>
                    <ul className="ml-3 list-inside list-disc text-ink-400">
                      {rejected.issues.slice(0, 4).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {result.timings.length > 0 ? (
            <p className="font-mono text-micro text-ink-400">
              {result.timings.map((t) => `${t.phase} ${t.ms}ms`).join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
