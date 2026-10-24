"use client";
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/domain/schemas/task";
import { usePlannerStore } from "@/data/store";
import { isoWeekdayOf } from "@/domain/time";
import { localInputToIso, isoToLocalInput } from "@/shared/datetime";

export function TaskEditor({task,onClose,onSaved}:{task:Task;onClose:()=>void;onSaved:(message:string)=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [title,setTitle]=useState(task.title);
  const [start,setStart]=useState(isoToLocalInput(task.start));
  const [end,setEnd]=useState(isoToLocalInput(task.end));
  const [deadline,setDeadline]=useState(isoToLocalInput(task.deadline));
  const [location,setLocation]=useState(task.location ?? "");
  const [priority,setPriority]=useState(task.priority);
  const [locked,setLocked]=useState(task.locked);
  const [repeats,setRepeats]=useState(Boolean(task.repeat));
  const [weekdays,setWeekdays]=useState<number[]>(task.repeat?.byDay ?? [isoWeekdayOf(Date.parse(task.start ?? task.deadline ?? new Date().toISOString()))]);
  const [error,setError]=useState("");
  const update=usePlannerStore(s=>s.updateTask);
  const remove=usePlannerStore(s=>s.removeTask);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.showModal();return()=>previous?.focus();},[]);
  function save(e:React.FormEvent) {
    e.preventDefault();
    if(Boolean(start)!==Boolean(end)){setError("开始和结束时间请一起填写。");return;}
    const s=localInputToIso(start), en=localInputToIso(end);
    if(s && en && Date.parse(en)<=Date.parse(s)){setError("结束时间必须晚于开始时间。");return;}
    if(repeats && !weekdays.length){setError("请至少选择一个重复星期。");return;}
    if(repeats && !s && !deadline){setError("重复安排需要一个时段或截止时间。");return;}
    const result=update(task.id,{title:title.trim(),start:s,end:en,deadline:localInputToIso(deadline),durationMin:s&&en ? Math.round((Date.parse(en)-Date.parse(s))/60000) : task.durationMin,location:location.trim()||null,priority,locked,repeat:repeats ? {kind:"weekly",byDay:weekdays,weeks:task.repeat?.weeks ?? null} : null,needsReview:false});
    if(!result.ok){setError(result.error ?? "保存失败");return;}
    onSaved("修改已保存，可撤销");
  }
  return <dialog className="settings-sheet editor-sheet" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget) onClose();}} aria-labelledby="edit-title"><form onSubmit={save}><div className="settings-head"><h2 id="edit-title">把细节改好。</h2><button type="button" className="close-button" aria-label="关闭编辑" onClick={onClose}>×</button></div><div className="settings-body"><div className="editor-grid"><label className="full">任务标题<input autoFocus value={title} maxLength={200} required onChange={e=>setTitle(e.target.value)}/></label><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束时间<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>截止时间<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>优先级<select value={priority} onChange={e=>setPriority(Number(e.target.value))}><option value={1}>重要</option><option value={2}>常规</option><option value={3}>弹性</option></select></label><label className="full">地点<input value={location} maxLength={60} onChange={e=>setLocation(e.target.value)}/></label><label className="full checkbox-field"><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/>固定安排，不参与自动移动</label><label className="full checkbox-field"><input type="checkbox" checked={repeats} onChange={e=>setRepeats(e.target.checked)}/>每周重复</label>{repeats && <fieldset className="full"><legend>重复星期</legend><div className="flex flex-wrap gap-2">{"一二三四五六日".split("").map((name,i)=><label className="checkbox-field" key={name}><input type="checkbox" checked={weekdays.includes(i+1)} onChange={e=>setWeekdays(days=>e.target.checked ? [...days,i+1] : days.filter(d=>d!==i+1))}/>{"周"+name}</label>)}</div></fieldset>}</div>{task.repeat && <p className="notice">周期任务：修改影响整组每周安排，删除也会删除整组。完成勾选只影响当天。</p>}{task.rawTextOrigin && <details className="advanced"><summary>查看原始信息</summary><p className="source-text">{task.rawTextOrigin}</p></details>}{error&&<p className="notice" role="alert">{error}</p>}<div className="editor-actions"><button className="btn btn-green" type="submit">保存修改</button><button type="button" className="btn btn-coral" onClick={()=>{if(window.confirm("删除「"+task.title+"」？可撤销。")){remove(task.id);onSaved("已删除，可撤销");}}}>删除任务</button></div></div></form></dialog>;
}
