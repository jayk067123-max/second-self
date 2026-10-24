"use client";
import { useState } from "react";
import { TaskDraftSchema, type TaskDraft } from "@/domain/schemas/task";
import { formatClock, formatDuration } from "@/domain/time";
import { isoToLocalInput, localInputToIso, minutesToInput } from "@/shared/datetime";
import { PriorityPicker } from "@/ui/PriorityPicker";
import { PriorityMark } from "@/ui/primitives/Priority";

export function TaskCorrectionTable({drafts,onChange,onRemove,onConfirm,onCancel,confirmLabel="确认入库",editIndex,onEdit,hideFooter=false,onAppend}: {
  drafts: TaskDraft[]; onChange:(i:number,p:Partial<TaskDraft>)=>void; onRemove:(i:number)=>void;
  onConfirm:()=>void; onCancel:()=>void; confirmLabel?:string; editIndex?:number|null;
  onEdit?:(i:number|null)=>void; hideFooter?:boolean; onAppend?:()=>void;
}) {
  const [internalIndex,setInternalIndex] = useState<number|null>(null);
  const [error,setError] = useState("");
  const index = onEdit ? editIndex : internalIndex;
  const edit = onEdit ?? setInternalIndex;
  const draft = index != null ? drafts[index] : null;
  function patchTime(i:number,field:"start"|"end",value:string) {
    const task=drafts[i]; if(!task)return; const iso=localInputToIso(value);
    const patch:Partial<TaskDraft>={[field]:iso};
    const start=field==="start"?iso:task.start,end=field==="end"?iso:task.end;
    if(start&&end){const n=Math.round((Date.parse(end)-Date.parse(start))/60000);if(n>=0&&n<=1440)patch.durationMin=n;}
    else if(field==="start"&&!iso)patch.end=null;
    setError("");onChange(i,patch);
  }
  function finish() {
    if(index==null||!draft)return;const result=TaskDraftSchema.safeParse(draft);
    if(!result.success){setError(result.error.issues[0]?.message??"请检查信息");return;}
    onChange(index,{needsReview:false,durationInferred:false});setError("");edit(null);
  }
  if(draft&&index!=null)return <div className="draft-editor"><div className="draft-number">日程 {String(index+1).padStart(2,"0")}</div><div className="editor-grid">
    <label className="full">标题<input aria-label={"第 "+(index+1)+" 条标题"} value={draft.title} maxLength={200} onChange={e=>onChange(index,{title:e.target.value})}/></label>
    <label>开始<input aria-label={"第 "+(index+1)+" 条开始时间"} type="datetime-local" value={isoToLocalInput(draft.start)} onChange={e=>patchTime(index,"start",e.target.value)}/></label>
    <label>结束<input aria-label={"第 "+(index+1)+" 条结束时间"} type="datetime-local" value={isoToLocalInput(draft.end)} onChange={e=>patchTime(index,"end",e.target.value)}/></label>
    <label>预计时长（分钟）<input aria-label={"第 "+(index+1)+" 条时长"} type="number" min={0} max={1440} value={minutesToInput(draft.durationMin)} onChange={e=>onChange(index,{durationMin:Math.min(1440,Math.max(0,Number(e.target.value)||0))})}/></label>
    <div><p className="field-label">优先级</p><PriorityPicker label={"第 "+(index+1)+" 条优先级"} value={draft.priority} onChange={p=>onChange(index,{priority:p})}/></div>
    <label className="full">截止时间<input aria-label={"第 "+(index+1)+" 条截止时间"} type="datetime-local" value={isoToLocalInput(draft.deadline)} onChange={e=>onChange(index,{deadline:localInputToIso(e.target.value)})}/></label>
    <label>地点<input value={draft.location??""} maxLength={60} onChange={e=>onChange(index,{location:e.target.value||null})}/></label>
    <label className="checkbox-field"><input type="checkbox" checked={draft.locked??false} onChange={e=>onChange(index,{locked:e.target.checked})}/>固定安排</label>
  </div>
  {draft.rawTextOrigin&&<details className="review-source"><summary>查看原文</summary><p>{draft.rawTextOrigin}</p></details>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="editor-actions"><button className="btn btn-green" onClick={finish}>完成核对</button><button className="btn btn-coral" onClick={()=>{onRemove(index);edit(null);}} aria-label={"删除第 "+(index+1)+" 条"}>删除这条</button></div></div>;
  return <div className="draft-review">
    <div className="review-summary"><span className="day-badge">{drafts.length}</span><div><h3>待加入的日程</h3><p>{drafts.some(d=>d.needsReview)?"点亮待确认的条目":"已经核对好了"}</p></div></div>
    <ul className="review-timeline">{drafts.map((d,i)=><li key={i} className={d.needsReview?"needs-confirm":""}><div className="review-time"><b>{d.start?formatClock(Date.parse(d.start)):d.deadline?"截止":"待定"}</b><small>{d.start?new Date(d.start).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"}):d.deadline?new Date(d.deadline).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"}):formatDuration(d.durationMin)}</small></div><button className="review-task" aria-label={"修改第 "+(i+1)+" 条"} onClick={()=>{setError("");edit(i);}}><strong>{d.title}</strong><span><PriorityMark priority={d.priority}/>{d.repeat&&<small>每周重复</small>}{d.durationInferred&&<small>约 {d.durationMin} 分钟</small>}</span></button><button className={"review-confirm "+(d.needsReview?"is-pending":"is-confirmed")} aria-label={(d.needsReview?"确认第 ":"重新核对第 ")+(i+1)+" 条"} onClick={()=>onChange(i,{needsReview:!d.needsReview,durationInferred:false})}>{d.needsReview?"待确认":"✓"}</button></li>)}</ul>
    {onAppend&&<button className="append-draft" onClick={onAppend}>＋ 补一条日程</button>}
    {!hideFooter&&<div className="sheet-inline-footer"><button className="btn" onClick={onCancel}>返回</button><button className="btn btn-green" disabled={!drafts.length||drafts.some(d=>d.needsReview)} onClick={onConfirm}>{confirmLabel}</button></div>}
  </div>;
}
