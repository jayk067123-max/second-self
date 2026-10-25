"use client";
import { FixedArrangementField } from "@/ui/FixedArrangementField";
import { useEffect, useState, type FormEvent } from "react";
import { localInputToIso } from "@/shared/datetime";
import { usePlannerStore } from "@/data/store";
import { Sheet } from "@/ui/Sheet";
import { PriorityPicker } from "@/ui/PriorityPicker";
export function ManualAddForm(){
  const add=usePlannerStore(s=>s.addManualTask);
  const [open,setOpen]=useState(false),[title,setTitle]=useState(""),[start,setStart]=useState(""),[end,setEnd]=useState(""),[deadline,setDeadline]=useState(""),[location,setLocation]=useState(""),[error,setError]=useState(""),[priority,setPriority]=useState<1|2|3>(2),[locked,setLocked]=useState(false);
  useEffect(()=>{const open=()=>setOpen(true);window.addEventListener("second-self:manual-open",open);return()=>window.removeEventListener("second-self:manual-open",open);},[]);
  function submit(e:FormEvent){
    e.preventDefault();if(!title.trim()){setError("标题不能为空");return;}
    if(Boolean(start)!==Boolean(end)){setError("请一起填写开始与结束时间");return;}
    const s=localInputToIso(start),en=localInputToIso(end);
    if(s&&en&&Date.parse(en)<=Date.parse(s)){setError("结束时间要晚于开始时间");return;}
    const result=add({title:title.trim(),start:s,end:en,deadline:localInputToIso(deadline),durationMin:s&&en?Math.round((Date.parse(en)-Date.parse(s))/60000):0,priority,location:location.trim()||null,locked});
    if(!result.ok){setError(result.error??"添加失败");return;}
    setOpen(false);setTitle("");setStart("");setEnd("");setDeadline("");setLocation("");setPriority(2);setLocked(false);setError("");
  }
  return <><section className="add-card manual-entry"><h2>自己记一条</h2><button className="btn btn-green" onClick={()=>{setError("");setOpen(true);}}>＋ 新增</button></section>
    {open&&<Sheet title="记下这件事" onBack={()=>setOpen(false)} onClose={()=>setOpen(false)} footer={<button className="btn btn-green" type="submit" form="manual-form">加入日程</button>}>
    <form id="manual-form" onSubmit={submit}><div className="editor-grid"><label className="full">标题<input id="manual-title" aria-label="任务标题" value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} required placeholder="想做些什么？"/></label>
    <label>开始时间<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束时间<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label className="full">截止时间<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
    <div className="full"><p className="field-label">优先级</p><PriorityPicker value={priority} onChange={setPriority}/></div><label className="full">地点<input value={location} maxLength={60} onChange={e=>setLocation(e.target.value)}/></label>
    <FixedArrangementField className="full" checked={locked} onChange={setLocked} /></div>{error&&<p className="form-error" role="alert">{error}</p>}</form></Sheet>}
  </>;
}
