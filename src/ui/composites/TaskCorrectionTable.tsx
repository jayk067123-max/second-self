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

  return <div className="flex flex-col gap-4">
    <div className="review-footer"><p>共 {drafts.length} 条。请核对标题与时间；带「待确认」的条目需要你明确确认。</p><Button variant="ghost" onClick={onCancel}>放弃</Button><Button className="confirm-button" onClick={onConfirm} disabled={drafts.length===0}>{confirmLabel}</Button></div>
    <ul className="review-list">{drafts.map((draft,index)=><li key={index} className={cn("review-item",draft.needsReview && "is-uncertain")}>
      <div className="review-top"><span className="text-micro">第 {index+1} 条{draft.repeat ? " · 每周重复" : ""}</span><div className="flex gap-2">{draft.needsReview && <Button variant="secondary" onClick={()=>onChange(index,{needsReview:false})}>待确认 ✓</Button>}<Button variant="ghost" aria-label={"删除第 "+(index+1)+" 条"} onClick={()=>onRemove(index)}>删除</Button></div></div>
      <div className="review-fields">
        <label className="full">标题<Input aria-label={"第 "+(index+1)+" 条标题"} value={draft.title} maxLength={200} onChange={e=>onChange(index,{title:e.target.value,needsReview:false})}/></label>
        <label>开始<Input aria-label={"第 "+(index+1)+" 条开始时间"} type="datetime-local" value={isoToLocalInput(draft.start)} onChange={e=>patchTime(index,"start",e.target.value)}/></label>
        <label>结束<Input aria-label={"第 "+(index+1)+" 条结束时间"} type="datetime-local" value={isoToLocalInput(draft.end)} onChange={e=>patchTime(index,"end",e.target.value)}/></label>
        <label>预计时长（分钟）<Input aria-label={"第 "+(index+1)+" 条时长"} type="number" min={0} max={1440} value={minutesToInput(draft.durationMin)} onChange={e=>onChange(index,{durationMin:Math.max(0,Number(e.target.value)||0)})}/></label>
        <label>优先级<Select aria-label={"第 "+(index+1)+" 条优先级"} value={draft.priority} onChange={e=>onChange(index,{priority:Number(e.target.value) as 1|2|3})}>{([1,2,3] as const).map(p=><option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select></label>
        <label className="full">截止时间（可选）<Input aria-label={"第 "+(index+1)+" 条截止时间"} type="datetime-local" value={isoToLocalInput(draft.deadline)} onChange={e=>onChange(index,{deadline:localInputToIso(e.target.value)})}/></label>
      </div>{draft.rawTextOrigin && <details className="review-source"><summary>核对原文</summary><p>{draft.rawTextOrigin}</p></details>}
    </li>)}</ul>
  </div>;
}
