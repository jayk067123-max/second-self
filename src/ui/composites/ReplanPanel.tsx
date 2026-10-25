"use client";

import { DEFAULT_DETECT_CONFIG } from "@/domain/conflicts";

import { useState } from "react";
import { type ReplanPlan } from "@/domain/reflow";
import type { Task } from "@/domain/schemas/task";
import {
  ReplanResponseSchema,
  type ReplanSuccess,
} from "@/domain/schemas/api";
import { dayKeyOf, formatClock, formatDuration, parseIsoToMs } from "@/domain/time";
import { usePlannerStore } from "@/data/store";
import { Badge, Button, Card, CardTitle } from "@/ui/primitives";
import { AiFailureCard } from "./AiFailureCard";
import { computePlanMetrics } from "./planMetrics";

type Phase = "idle" | "loading" | "ready";

/**
 * 重排建议 —— 模型只给方案与理由，合法性由 domain.validatePlan 判定。
 * 被判死的方案连同原因显示出来，用户看得见"AI 没有被无脑信任"。
 */
export function ReplanPanel({
  tasks,
  dayKey,
  now,
  termStartDayKey = null,
}: {
  tasks: Task[];
  dayKey: string;
  /** 冲突规则要求注入 now；与页面共用同一个演示时钟 */
  now: Date;
  termStartDayKey?: string | null;
}) {
  const [inputFingerprint, setInputFingerprint] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReplanSuccess | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[]; raw?: string } | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);
  const applyPlanWithSnapshot = usePlannerStore((s) => s.applyPlanWithSnapshot);

  async function request() {
    if (phase === "loading" || tasks.length === 0) return;
    setPhase("loading");
    setError(null);
    setAppliedTitle(null);
    const fingerprint = JSON.stringify(tasks);
    try {
      const res = await fetch("/api/ai/replan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tasks, dayKey, now: now.toISOString(), termStartDayKey }),
      });
      const json: unknown = await res.json();
      const parsed = ReplanResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError({ message: "服务端返回结构不符合契约，已拒绝使用", issues: [] });
        setPhase("idle");
        return;
      }
      if (!parsed.data.ok) {
        setError({ message: parsed.data.error, issues: parsed.data.issues, raw: parsed.data.raw });
        setPhase("idle");
        return;
      }
      setInputFingerprint(fingerprint);
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
    if (JSON.stringify(usePlannerStore.getState().tasks) !== inputFingerprint) { setError({ message: "任务已变化，请重新生成方案", issues: [] }); return; }
    const outcome = applyPlanWithSnapshot(plan, { dayKey, now: now.toISOString(), termStartDayKey });
    if (!outcome.ok) {
      setError({ message: `写回失败：${outcome.error ?? "未知原因"}`, issues: [] });
      return;
    }
    setAppliedTitle(plan.title);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>重排建议</CardTitle>

        </div>
        <div className="flex items-center gap-2">
          {appliedTitle ? <Badge tone="ok">已写回 · 可撤销</Badge> : null}
          <Button onClick={() => void request()} disabled={tasks.length === 0}
            aria-disabled={phase === "loading" || tasks.length === 0} aria-busy={phase === "loading"}>
            {phase === "loading" ? "重排中…" : "生成重排方案"}
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-micro text-ink-400">先入库几条任务，再来重排。</p>
      ) : null}

      {phase === "loading" && <p role="status">正在寻找合适的安排…</p>}

      {error ? (
        <AiFailureCard
          title="这次重排建议没通过本地校验"
          message={error.message}
          issues={error.issues}
          rawOutput={error.raw}
          onRetry={() => void request()}
          onBack={() => {
            setError(null);
            setPhase("idle");
          }}
          busy={phase === "loading"}
        />
      ) : null}

      {result?.fallback ? (
        <div className="rounded-sm bg-warn-500/10 px-3 py-2 text-micro text-warn-400 ring-1 ring-inset ring-warn-500/30">
          已切换为本地方案
        </div>
      ) : null}

      {phase === "ready" && result ? (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {result.plans.map((plan) => {
              // 方案摘要（条数/总时长/最晚结束）：本地算，不再依赖 domain 已退役的 summarizePlan
              const intervals = plan.blocks
                .map((block) => ({ s: parseIsoToMs(block.start), e: parseIsoToMs(block.end) }))
                .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null);
              const summary = {
                count: plan.blocks.length,
                totalMin: intervals.reduce((sum, x) => sum + Math.round((x.e - x.s) / 60_000), 0),
                lastEnd:
                  intervals.length === 0
                    ? "—"
                    : formatClock(intervals.reduce((max, x) => Math.max(max, x.e), 0)),
              };
              const metrics = computePlanMetrics(plan, tasks, now, { ...DEFAULT_DETECT_CONFIG, termStartDayKey, repeatWindowStartDayKey: dayKey });
              const lockedBroken = metrics.movedLockedTitles.length > 0;
              return (
                <div
                  key={plan.id}
                  className="flex flex-col gap-2 rounded-md bg-ink-800/70 p-3 ring-1 ring-inset ring-ink-700"
                >
                  <p className="text-caption font-semibold text-ink-50">{plan.title}</p>
                  <p className="text-micro leading-relaxed text-ink-300">{plan.rationale}</p>

                  {/* SPEC：方案卡固定 4 个数字 */}
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-sm bg-ink-900/70 px-2 py-1.5 text-micro">
                    <div className="flex justify-between gap-1">
                      <dt className="text-ink-400">挪动</dt>
                      <dd className="font-mono text-ink-100">{metrics.movedCount} 条</dd>
                    </div>
                    <div className="flex justify-between gap-1">
                      <dt className="text-ink-400">冲突</dt>
                      <dd className="font-mono text-ink-100">
                        {metrics.conflictsBefore}→{metrics.conflictsAfter}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-1">
                      <dt className="text-ink-400">偏离</dt>
                      <dd className="font-mono text-ink-100">{metrics.deviationMin} 分</dd>
                    </div>
                    <div className="flex justify-between gap-1">
                      <dt className="text-ink-400">固定课被挪</dt>
                      <dd className={lockedBroken ? "font-mono text-danger-400" : "font-mono text-ok-400"}>
                        {metrics.movedLockedTitles.length} 条
                      </dd>
                    </div>
                  </dl>

                  {lockedBroken ? (
                    <p className="text-micro text-danger-400">
                      动了固定课（{metrics.movedLockedTitles.slice(0, 2).join("、")}），方案作废
                    </p>
                  ) : null}
                  {metrics.conflictsAfter > 0 ? (
                    <p className="text-micro text-warn-400">
                      还剩 {metrics.conflictsAfter} 个冲突
                    </p>
                  ) : (
                    <p className="text-micro text-ok-400">已避开冲突</p>
                  )}

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
                            {startMs !== null ? dayKeyOf(startMs).slice(5) + " " + formatClock(startMs) : "--:--"}–{endMs !== null ? formatClock(endMs) : "--:--"}
                          </span>
                          <span className="truncate">{title}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    variant={appliedTitle === plan.title ? "secondary" : "primary"}
                    className="mt-auto h-8 px-3 text-micro"
                    disabled={lockedBroken}
                    title={lockedBroken ? "固定课被移动，方案作废" : undefined}
                    onClick={() => apply(plan)}
                  >
                    {lockedBroken ? "方案作废" : appliedTitle === plan.title ? "已应用" : "用这套"}
                  </Button>
                </div>
              );
            })}
          </div>

          {result.rejected.length > 0 ? (
            <details className="rounded-sm bg-ink-800/50 px-3 py-2 text-micro text-ink-300">
              <summary className="cursor-pointer select-none">
                不可用的方案（{result.rejected.length} 套）
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


        </>
      ) : null}
    </Card>
  );
}
