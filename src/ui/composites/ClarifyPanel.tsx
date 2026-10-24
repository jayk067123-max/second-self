"use client";
import { useState } from "react";
import type { ClarifyAnswer } from "@/domain/clarify";
import type { TaskDraft } from "@/domain/schemas/task";
import { nextQuestion, pendingCount, resolveAnswer } from "./clarifyQueue";

export function ClarifyPanel({ drafts, dayKey, onFinish, onSkipAll, skipped, onAnswer }: {
  drafts: TaskDraft[]; dayKey: string; onPatch: (i:number,p:Partial<TaskDraft>) => void;
  onFinish: () => void; onSkipAll: () => void; skipped: number[];
  onAnswer: (i:number,p:Partial<TaskDraft>,skip:boolean) => void;
}) {
  const pending = nextQuestion(drafts,dayKey,skipped);
  if (!pending) return <div className="clarify-complete"><span className="success-stamp" aria-hidden="true">✓</span><h3>可以开始核对了</h3><button className="btn btn-green" onClick={onFinish}>核对任务</button></div>;
  return <Question key={pending.index + pending.question.id} pending={pending} remaining={pendingCount(drafts,dayKey,skipped)} dayKey={dayKey} onAnswer={onAnswer} onSkipAll={onSkipAll} />;
}
function Question({pending,remaining,dayKey,onAnswer,onSkipAll}: {
  pending: NonNullable<ReturnType<typeof nextQuestion>>; remaining: number; dayKey: string;
  onAnswer: (i:number,p:Partial<TaskDraft>,skip:boolean) => void; onSkipAll: () => void;
}) {
  const [text,setText] = useState(""), [error,setError] = useState("");
  function submit(answer: ClarifyAnswer) {
    const result = resolveAnswer(pending,answer,dayKey);
    if (!result.ok) { setError(result.message); return; }
    onAnswer(pending.index,result.patch,result.skipDraft);
  }
  return <section className="clarify-question">
    <div className="question-context"><span>第 {pending.index+1} 条</span><span>还需补充 {remaining} 条</span></div>
    <h3>{pending.draft.title}</h3><p className="question-prompt">{pending.question.prompt}</p>
    <div className="question-options">{pending.question.options.map(option => <button key={option.id} onClick={() => submit({source:"option",optionId:option.id})}><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</button>)}</div>
    {pending.question.freeInputPlaceholder && <form className="question-input" onSubmit={e => { e.preventDefault(); submit({source:"free",text}); }}><input aria-label="自由输入回答" placeholder={pending.question.freeInputPlaceholder} value={text} onChange={e => {setText(e.target.value);setError("");}} /><button className="btn btn-green" disabled={!text.trim()}>确定</button></form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="question-actions"><button className="btn" onClick={() => submit({source:"skip"})}>先跳过</button><button className="btn" onClick={onSkipAll}>直接核对</button></div>
  </section>;
}
