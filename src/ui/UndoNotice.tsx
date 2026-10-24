"use client";
import { useEffect, useRef, useState } from "react";
import { usePlannerStore } from "@/data/store";
export function UndoNotice(){
  const [visible,setVisible]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function pause(){if(timer.current)clearTimeout(timer.current);}
  function resume(){pause();timer.current=setTimeout(()=>setVisible(false),7000);}
  useEffect(()=>{const unsubscribe=usePlannerStore.subscribe((next,previous)=>{
    if(!usePlannerStore.persist.hasHydrated()||next.snapshot===previous.snapshot)return;
    if(timer.current)clearTimeout(timer.current);
    setVisible(Boolean(next.snapshot));
    if(next.snapshot)timer.current=setTimeout(()=>setVisible(false),7000);
  });return()=>{unsubscribe();if(timer.current)clearTimeout(timer.current);};},[]);
  if(!visible)return null;
  return <div className="undo-bar" role="status" onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}><span>已更新日程</span><button onClick={()=>{usePlannerStore.getState().undo();setVisible(false);}}>撤销</button><button className="undo-dismiss" aria-label="关闭撤销提示" onClick={()=>setVisible(false)}>×</button></div>;
}
