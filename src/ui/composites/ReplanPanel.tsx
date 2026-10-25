"use client";

import { useState } from "react";
import { DEFAULT_DETECT_CONFIG } from "@/domain/conflicts";
import type { ReplanPlan } from "@/domain/reflow";
import type { Task } from "@/domain/schemas/task";
import { ReplanResponseSchema, type ReplanSuccess } from "@/domain/schemas/api";
import { usePlannerStore } from "@/data/store";
import { computePlanMetrics } from "./planMetrics";
import { planChanges, timeRangeLabel } from "./planChanges";

type Phase = "idle" | "loading" | "ready";

export function ReplanPanel({ tasks, dayKey, now, termStartDayKey = null }: {
  tasks: Task[]; dayKey: string; now: Date; termStartDayKey?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReplanSuccess | null>(null);
  const [baseline, setBaseline] = useState<Task[]>([]);
  const [fingerprint, setFingerprint] = useState("");
  const [selected, setSelected] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState("");
  const applyPlan = usePlannerStore(s => s.applyPlanWithSnapshot);
  const active = result?.plans.find(plan => plan.id === selected);
  const config = { ...DEFAULT_DETECT_CONFIG, termStartDayKey, repeatWindowStartDayKey: dayKey };
  const metrics = active ? computePlanMetrics(active, baseline, now, config) : null;
  const changes = active ? planChanges(active, baseline) : [];
  const stale = !!result && JSON.stringify(tasks) !== fingerprint;
  const blocked = !!metrics?.movedLockedTitles.length || changes.some(change => change.missing);

  async function request() {
    if (phase === "loading" || tasks.length === 0) return;
    setPhase("loading"); setError(""); setApplied(""); setResult(null);
    const original = tasks;
    try {
      const response = await fetch("/api/ai/replan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tasks: original, dayKey, now: now.toISOString(), termStartDayKey }),
      });
      const parsed = ReplanResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("方案格式有误，请重新生成");
      if (!parsed.data.ok) throw new Error(parsed.data.error);
      setBaseline(original); setFingerprint(JSON.stringify(original));
      setResult(parsed.data); setSelected(parsed.data.plans[0]?.id ?? ""); setPhase("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法生成，请稍后重试"); setPhase("idle");
    }
  }

  function apply(plan: ReplanPlan) {
    if (JSON.stringify(usePlannerStore.getState().tasks) !== fingerprint) {
      setError("日程已变化，请重新生成方案"); return;
    }
    const outcome = applyPlan(plan, { dayKey, now: now.toISOString(), termStartDayKey });
    if (!outcome.ok) { setError(outcome.error ?? "未能应用，请重新生成"); return; }
    setApplied(plan.id); setError("");
  }

  return <section className="replan-panel" aria-label="重排方案">
    <div className="replan-toolbar"><p>{phase === "loading" ? "正在寻找合适的时间…" : applied ? "日程已更新" : "看看怎么调整"}</p>
      <button type="button" className="btn btn-green" onClick={() => void request()} disabled={!tasks.length}
        aria-disabled={phase === "loading" || !tasks.length} aria-busy={phase === "loading"}>
        {phase === "loading" ? "生成中…" : result ? "重新生成" : "生成重排方案"}
      </button>
    </div>
    {phase === "loading" && <div className="replan-loading" role="status"><span className="loading-orbit" aria-hidden="true" />正在整理调整方案</div>}
    {error && <p className="replan-warning" role="alert">{error}</p>}
    {!tasks.length && <p className="replan-empty">先添加几条日程</p>}
    {phase === "ready" && result && <>
      {result.fallback && <p className="replan-mode">AI暂未给出可用方案，已使用本地规划</p>}
      {!!result.plans.length && <div className="replan-choices" role="group" aria-label="选择方案">{result.plans.map((plan, index) =>
        <button type="button" key={plan.id} aria-pressed={selected === plan.id} onClick={() => setSelected(plan.id)}>
          <span className="replan-choice-number">{String(index + 1).padStart(2, "0")}</span><span>{plan.title}</span>
        </button>
      )}</div>}
      {active && metrics && <article className="replan-comparison" aria-label={active.title + "调整对照"}>
        <div className="replan-overview"><div><span className="replan-eyebrow">这套方案</span><h3>{active.title}</h3></div>
          <div className="replan-stat"><span>整体冲突</span><strong>{metrics.conflictsBefore}<i aria-hidden="true">→</i>{metrics.conflictsAfter}</strong></div>
        </div>
        <div className="replan-change-head"><h4>调整 {changes.length} 项</h4><span>其余安排不变</span></div>
        <ol className="replan-change-list">{changes.map(change => <li key={change.taskId}>
          <h4>{change.title}</h4><div className="replan-time-change">
            <div className="replan-time-before"><span>原安排</span><p>{timeRangeLabel(change.beforeStart, change.beforeEnd)}</p></div>
            <span className="replan-change-arrow" aria-label="调整为">→</span>
            <div className="replan-time-after"><span>调整后</span><p>{timeRangeLabel(change.start, change.end)}</p></div>
          </div>
        </li>)}</ol>
        {!changes.length && <p className="replan-empty">这套方案没有时间变动</p>}
        {blocked ? <p className="replan-warning" role="alert">方案涉及固定安排或已删除任务，暂不可采用</p>
          : metrics.conflictsAfter > 0 ? <p className="replan-caution">仍有 {metrics.conflictsAfter} 处冲突需要处理</p>
          : <p className="replan-clear">✓ 已避开冲突</p>}
        {stale && !applied && <p className="replan-warning" role="status">日程已变化，请重新生成</p>}
        <div className="replan-apply"><span>{applied ? "已应用 · 可撤销" : "确认后才会更新日程"}</span>
          <button type="button" className="btn btn-green" disabled={blocked || stale || !changes.length || !!applied} onClick={() => apply(active)}>
            {applied === active.id ? "已采用" : applied ? "已采用其他方案" : "采用这套安排"}
          </button>
        </div>
      </article>}
      {!active && <p className="replan-empty">暂时没有可行的调整，请手动修改日程</p>}
      {result.rejected.length > 0 && <details className="replan-rejected"><summary>未采用的建议 · {result.rejected.length}</summary>
        {result.rejected.map((plan, index) => <p key={index}><strong>{plan.title}</strong> · {plan.issues[0] ?? "未通过日程校验"}</p>)}
      </details>}
    </>}
  </section>;
}
