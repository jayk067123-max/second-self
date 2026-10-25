"use client";
import { useRef, useState } from "react";
import type { CoverageReport, SourceLine } from "@/domain/completeness";
import { mergeDraftPatch } from "@/domain/clarify";
import type { TaskDraft } from "@/domain/schemas/task";
import { dayKeyOf } from "@/domain/time";
import { usePlannerStore } from "@/data/store";
import { Sheet } from "@/ui/Sheet";
import { ClarifyPanel } from "./ClarifyPanel";
import { pendingCount } from "./clarifyQueue";
import { ImageIntake } from "./ImageIntake";
import { TaskCorrectionTable } from "./TaskCorrectionTable";
import { UncoveredNotice } from "./UncoveredNotice";
import { requestParseImage, requestParseText, type IntakeOutcome } from "./intakeClient";

import { PlanningLoading } from "./PlanningLoading";
import { useLoadingCycle } from "./useLoadingCycle";

type Phase = "idle" | "parsing" | "uncovered" | "ask" | "review" | "done" | "error";
type LastInput = { kind: "text"; text: string } | { kind: "image"; file: File; hint: string };
export function IntakePanel() {
  const cycle = useLoadingCycle();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [phase, setPhase] = useState<Phase>("idle");
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [adopted, setAdopted] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [lastInput, setLastInput] = useState<LastInput | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [askRound, setAskRound] = useState(0);
  const asked = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const requestId = useRef(0);
  const [skipped, setSkipped] = useState<number[]>([]);
  const askHistory = useRef<Array<{ drafts: TaskDraft[]; skipped: number[] }>>([]);
  const addDrafts = usePlannerStore(s => s.addDrafts);
  const clock = usePlannerStore(s => s.demoClock.iso);
  const dayKey = dayKeyOf(Date.parse(clock));
  const busy = phase === "parsing";
  const unresolved = coverage?.uncovered.filter(l => !dismissed.includes(l.lineNo) && !adopted.includes(l.lineNo)) ?? [];
  function toQuestions(next = drafts) { asked.current = pendingCount(next, dayKey, []) > 0; setPhase(asked.current ? "ask" : "review"); setAskRound(n => n+1); }
  function applyPatch(index: number, patch: Partial<TaskDraft>) { setDrafts(prev => prev.map((d,i) => i === index ? mergeDraftPatch(d,patch) : d)); setError(""); }
  async function run(input: LastInput) {
    if (busy) return;
    const animation = cycle.start();
    const id = ++requestId.current; setLastInput(input); setPhase("parsing"); setPanelOpen(true); setError(""); setEditIndex(null);
    const outcome: IntakeOutcome = input.kind === "text" ? await requestParseText({ text: input.text, dayKey }) : await requestParseImage({ file: input.file, hint: input.hint, dayKey });
    if (!await animation || id !== requestId.current) return;
    if (outcome.kind === "fail") { setError(outcome.message); setPhase("error"); return; }
    setSkipped([]); askHistory.current = []; setDrafts(outcome.response.tasks); setCoverage(outcome.response.coverage); setDismissed([]); setAdopted([]);
    if (outcome.response.coverage.uncovered.length) setPhase("uncovered");
    else toQuestions(outcome.response.tasks);
  }
  function close() { if (busy) { cycle.cancel(); ++requestId.current; setPhase("idle"); } setPanelOpen(false); }
  function back() {
    setError("");
    if (editIndex !== null) { setEditIndex(null); return; }
    if (phase === "review") {
      if (asked.current) {
        if (!pendingCount(drafts, dayKey, skipped) && askHistory.current.length) { const previous = askHistory.current.pop()!; setDrafts(previous.drafts); setSkipped(previous.skipped); }
        setPhase("ask"); setAskRound(n => n+1); return;
      }
      if (coverage?.uncovered.length) { setPhase("uncovered"); return; }
      close(); return;
    }
    if (phase === "ask" && askHistory.current.length) { const previous = askHistory.current.pop()!; setDrafts(previous.drafts); setSkipped(previous.skipped); setAskRound(n => n+1); return; }
    if (phase === "ask" && coverage?.uncovered.length) { setPhase("uncovered"); return; }
    close();
  }
  function adopt(line: SourceLine) {
    setDrafts(prev => [...prev, { title: line.text.slice(0,200), start:null,end:null,durationMin:0,deadline:null,priority:2,rawTextOrigin:line.text.slice(0,500),needsReview:true,repeat:null }]);
    setAdopted(prev => [...prev,line.lineNo]);
  }
  function confirm() {
    if (unresolved.length) { setPhase("uncovered"); return; }
    const result = addDrafts(drafts,"text");
    if (!result.ok) { setError(result.error ?? "请检查任务信息"); return; }
    setAddedCount(result.added ?? drafts.length); setPhase("done");
  }
  const title = phase === "parsing" ? "正在整理…" : phase === "uncovered" ? "还有这些内容" : phase === "ask" ? "补充一点信息" : phase === "done" ? "已经记好了。" : phase === "error" ? "这次没有整理成功" : editIndex !== null ? "把这条改好" : "核对一下，准备出发。";
  return <section className="add-card intake-card" aria-label="整理日程">
    <div className="intake-heading"><h2>随手一记</h2><span>{dayKey}</span></div>
    <div className="intake-tabs" role="group" aria-label="录入方式"><button aria-pressed={mode === "text"} onClick={() => setMode("text")}>文字</button><button aria-pressed={mode === "image"} onClick={() => setMode("image")}>图片</button></div>
    {mode === "text" ? <><textarea aria-label="粘贴日程文本" value={text} onChange={e => setText(e.target.value)} maxLength={8000} placeholder="把通知、课表或待办贴在这里…" /><div className="intake-actions"><button className="btn btn-green" onClick={() => void run({kind:"text",text})} disabled={text.trim().length < 5 || busy}>{busy ? "整理中…" : "解析成任务"}</button><span>{text.length}/8000</span></div></> : <ImageIntake busy={busy} onSubmit={(file,hint) => void run({kind:"image",file,hint})} />}
    {!panelOpen && phase !== "idle" && <button className="resume-intake" onClick={() => setPanelOpen(true)}>{phase === "parsing" ? "查看整理进度" : phase === "done" ? "查看入库结果" : "继续核对 ↗"}</button>}
    {panelOpen && <Sheet title={title} caption={phase === "ask" ? "01 / 补充" : phase === "review" ? "02 / 核对" : undefined} stepKey={phase + "-" + editIndex + "-" + skipped.length + "-" + askRound} onBack={back} onClose={close} wide={phase === "review"}
      footer={phase === "uncovered" ? <button className="btn btn-green" disabled={!!unresolved.length} onClick={() => toQuestions()}>继续</button> : phase === "review" && editIndex === null ? <><span className="sheet-count">{drafts.length} 条日程</span><button className="btn btn-green" disabled={!drafts.length || drafts.some(d => d.needsReview)} onClick={confirm}>确认入库</button></> : undefined}>
      {phase === "parsing" && <PlanningLoading key={cycle.animationKey} onCycleComplete={cycle.complete} label="正在整理日程" />}
      {phase === "error" && <div className="flow-error"><p role="alert">{error}</p><div className="settings-actions"><button className="btn btn-green" onClick={() => lastInput && void run(lastInput)}>重试</button><button className="btn" onClick={() => { close(); window.dispatchEvent(new Event("second-self:manual-open")); }}>手动添加</button></div></div>}
      {phase === "uncovered" && coverage && <UncoveredNotice coverage={coverage} dismissedLineNos={dismissed} adoptedLineNos={adopted} onAdopt={adopt} onDismiss={n => setDismissed(prev => [...prev,n])} onRestore={n => setDismissed(prev => prev.filter(v => v !== n))} />}
      {phase === "ask" && <ClarifyPanel key={askRound} drafts={drafts} dayKey={dayKey} onPatch={applyPatch} onFinish={() => setPhase("review")} onSkipAll={() => setPhase("review")} skipped={skipped} onAnswer={(index,patch,skip) => { askHistory.current.push({drafts,skipped}); applyPatch(index,patch); if (skip) setSkipped(prev => [...prev,index]); setAskRound(n => n+1); }} />}
      {phase === "review" && <><TaskCorrectionTable drafts={drafts} onChange={applyPatch} onRemove={index => { setDrafts(prev => prev.filter((_,i) => i !== index)); setEditIndex(null); }} onConfirm={confirm} onCancel={close} editIndex={editIndex} onEdit={setEditIndex} hideFooter onAppend={() => { setDrafts(prev => [...prev,{title:"新日程",start:null,end:null,durationMin:0,deadline:null,priority:2,rawTextOrigin:null,needsReview:true,repeat:null}]); setEditIndex(drafts.length); }} />{error && <p className="form-error" role="alert">{error}</p>}</>}
      {phase === "done" && <div className="flow-success"><span className="success-stamp" aria-hidden="true">✓</span><h3>已入库 {addedCount} 条</h3><div className="settings-actions"><button className="btn btn-green" onClick={() => { close(); const date = drafts.find(d => d.start || d.deadline); const iso = date?.start || date?.deadline; window.dispatchEvent(new CustomEvent("second-self:open-day", {detail: iso ? dayKeyOf(Date.parse(iso)) : dayKey})); }}>查看日程</button><button className="btn" onClick={() => { setPhase("idle"); setText(""); setDrafts([]); close(); }}>再记一条</button></div></div>}
    </Sheet>}
  </section>;
}
