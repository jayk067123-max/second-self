"use client";
import { FixedArrangementField } from "@/ui/FixedArrangementField";
import { useState } from "react";
import type { Task } from "@/domain/schemas/task";
import { usePlannerStore } from "@/data/store";
import { Sheet } from "./Sheet";
import { PriorityPicker } from "./PriorityPicker";
import { isoWeekdayOf } from "@/domain/time";
import { localInputToIso, isoToLocalInput } from "@/shared/datetime";

export function TaskEditor({task,onClose,onSaved}:{task:Task;onClose:()=>void;onSaved:(message:string)=>void}) {
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
  return <Sheet title="把细节改好。" onBack={onClose} onClose={onClose}><form onSubmit={save}><div className="editor-grid"><label className="full">任务标题<input autoFocus value={title} maxLength={200} required onChange={e=>setTitle(e.target.value)}/></label><label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束时间<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>截止时间<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><div><p className="field-label">优先级</p><PriorityPicker value={priority} onChange={setPriority}/></div><label className="full">地点<input value={location} maxLength={60} onChange={e=>setLocation(e.target.value)}/></label><FixedArrangementField className="full" checked={locked} onChange={setLocked} /><label className="full checkbox-field"><input type="checkbox" checked={repeats} onChange={e=>setRepeats(e.target.checked)}/>每周重复</label>{repeats && <fieldset className="full"><legend>重复星期</legend><div className="flex flex-wrap gap-2">{"一二三四五六日".split("").map((name,i)=><label className="checkbox-field" key={name}><input type="checkbox" checked={weekdays.includes(i+1)} onChange={e=>setWeekdays(days=>e.target.checked ? [...days,i+1] : days.filter(d=>d!==i+1))}/>{"周"+name}</label>)}</div></fieldset>}</div>{task.repeat && <p className="notice">修改或删除将影响整组重复日程。</p>}{task.rawTextOrigin && <details className="advanced"><summary>查看原始信息</summary><p className="source-text">{task.rawTextOrigin}</p></details>}{error&&<p className="notice" role="alert">{error}</p>}<div className="editor-actions"><button className="btn btn-green" type="submit">保存修改</button><button type="button" className="btn btn-coral" onClick={()=>{if(window.confirm("删除「"+task.title+"」？可撤销。")){remove(task.id);onSaved("已删除，可撤销");}}}>删除任务</button></div></form></Sheet>;
}
