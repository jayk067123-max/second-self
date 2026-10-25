"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "@/domain/schemas/task";
import { tasksOnDay } from "@/domain/avatar";
import { DEFAULT_DETECT_CONFIG, detectConflicts, minutesOnDay } from "@/domain/conflicts";
import { addDaysToKey, dayKeyOf, formatClock, formatDuration, msFromDayKey, weekdayLabel } from "@/domain/time";
import { usePlannerHydration, usePlannerStore } from "@/data/store";
import { IntakePanel } from "./composites/IntakePanel";
import { ManualAddForm } from "./composites/ManualAddForm";
import { ReplanPanel } from "./composites/ReplanPanel";
import { ProfileSettings } from "./ProfileSettings";
import { useProfile } from "@/data/profile";
import { Sheet } from "./Sheet";
import { UndoNotice } from "./UndoNotice";
import { PriorityMark } from "./primitives/Priority";
import { TaskEditor } from "./TaskEditor";
import { PlanningLoading } from "./composites/PlanningLoading";
import { useAccount } from "./AccountContext";
import { EMPTY_SCENES } from "./emptyScenes";

type Tab = "today" | "add" | "future";
const tabNames: Record<Tab, string> = { today: "今天", add: "添加", future: "未来" };

function Icon({ name }: { name: Tab }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "add" ? <path d="M12 5v14M5 12h14" /> : name === "today" ? <><rect x="4" y="5" width="16" height="15" rx="4" /><path d="M8 3v4m8-4v4M4 10h16" /><circle cx="12" cy="15" r="1" /></> : <><path d="M5 7h14M5 12h14M5 17h10" /><path d="m16 15 4 3-4 3" /></>}</svg>;
}

export function FinalPlanner() {
  const { status: syncStatus, error: syncError, sync } = useAccount();
  const hydrated = usePlannerHydration();
  const [initialCycleDone, setInitialCycleDone] = useState(true);
  const ready = hydrated && initialCycleDone;
  const store = usePlannerStore();
  const [tab, setTab] = useState<Tab>("today");
  const [selected, setSelected] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [storageOK, setStorageOK] = useState(true);
  const { profile, save: saveProfile } = useProfile();
  const now = useMemo(() => new Date(store.demoClock.iso), [store.demoClock.iso]);
  const today = dayKeyOf(now.getTime());
  const day = tab === "today" ? today : selected ?? addDaysToKey(today, 1);
  const config = useMemo(() => ({ ...DEFAULT_DETECT_CONFIG, termStartDayKey: store.termStartDayKey, repeatWindowStartDayKey: day }), [store.termStartDayKey, day]);
  const conflicts = useMemo(() => detectConflicts(store.tasks, config, now), [store.tasks, config, now]);
  const dayTasks = useMemo(() => tasksOnDay(store.tasks, day, store.termStartDayKey), [store.tasks, day, store.termStartDayKey]);
  const dayConflicts = conflicts.filter(c => c.date === day);
  const todayTasks = tasksOnDay(store.tasks, today, store.termStartDayKey);
  const load = minutesOnDay(todayTasks.filter(t => !t.done), today);
  const stateLabel = load >= 600 ? "有点满" : load >= 420 ? "慢慢来" : "从容";
  const looseTasks = store.tasks.filter(t => !t.start && !t.deadline);
  const [sceneIndex, setSceneIndex] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setSceneIndex(previous => (previous + 1 + Math.floor(Math.random() * (EMPTY_SCENES.length - 1))) % EMPTY_SCENES.length));
  }, [day]);
  const scene = EMPTY_SCENES[sceneIndex]!;

  useEffect(() => {
    function sync() { const hash = window.location.hash.slice(1); setTab(hash === "add" || hash === "future" ? hash : "today"); }
    queueMicrotask(sync);
    window.addEventListener("hashchange", sync);
    const openDay = (event: Event) => { const date = (event as CustomEvent<string>).detail; if (!Number.isFinite(Date.parse(date))) return; setSelected(date); const shown = new Date(date + "T12:00:00"); const base = new Date(usePlannerStore.getState().demoClock.iso); setMonthOffset((shown.getFullYear()-base.getFullYear())*12+shown.getMonth()-base.getMonth()); setTab("future"); window.location.hash = "future"; window.scrollTo({top:0}); };
    window.addEventListener("second-self:open-day", openDay);
    const timer = window.setInterval(() => { usePlannerStore.getState().tickClock(); setStorageOK(usePlannerStore.getState().storageAvailable()); }, 30000);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("second-self:open-day", openDay); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (ready) queueMicrotask(() => setStorageOK(usePlannerStore.getState().storageAvailable())); }, [ready, store.tasks]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function navigate(next: Tab) { setTab(next); window.location.hash = next; setShowPlan(false); window.scrollTo({ top: 0 }); }
  function chooseDay(value: string) { setSelected(value); setShowPlan(false); }
  const baseMonth = new Date(msFromDayKey(today, 0));
  const displayedMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + monthOffset, 1);
  const first = dayKeyOf(displayedMonth.getTime());
  const monthDays = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth()+1, 0).getDate();
  const blanks = (displayedMonth.getDay()+6)%7;
  const searchResults = query.trim() ? store.tasks.filter(t => (t.title + " " + (t.location ?? "")).toLowerCase().includes(query.toLowerCase())) : [];

  function renderRows(items: Task[], rowDay: string, allowDone = true) {
    return items.map(task => <div className={"row " + (task.done ? "done" : "")} key={task.id}>
      <div className="time"><b>{task.start ? formatClock(Date.parse(task.start)) : task.deadline ? "截止" : "待安排"}</b><i>{task.end ? formatClock(Date.parse(task.end)) : task.deadline ? formatClock(Date.parse(task.deadline)) : formatDuration(task.durationMin)}</i></div>
      <button className="task-open" onClick={() => setEditing(store.tasks.find(t => t.id === task.id) ?? task)} aria-label={"编辑 " + task.title}><span className="row-title">{task.title}</span><span className="row-meta">{[task.location, task.locked ? "固定" : null, task.repeat ? "每周重复" : null].filter(Boolean).join(" · ")}<PriorityMark priority={task.priority} /></span></button>
      {allowDone && <button className="check" role="checkbox" aria-checked={task.done} aria-label={(task.done ? "取消完成 " : "完成 ") + task.title} onClick={() => store.toggleDone(task.id, rowDay)}><i>{task.done ? "✓" : ""}</i></button>}
    </div>);
  }
  function dayCard() {
    return <>
      <section className="today-card" aria-label={tab === "today" ? "今天的安排" : "所选日安排"}>
        {tab === "future" && <div className="day-head px-6 pt-6"><div className="day-badge">{day.slice(-2)}</div><div><h2 className="day-label">{weekdayLabel(day)}</h2><p className="day-date">{day}</p></div><span className="day-load">{formatDuration(minutesOnDay(dayTasks.filter(t => !t.done), day))}</span></div>}
        {!ready ? null : dayTasks.length ? renderRows(dayTasks, day) : <div className="today-empty"><div className="empty-art" data-scene={scene.name} aria-hidden="true" dangerouslySetInnerHTML={{ __html: scene.svg }} /><div><p className="empty-kicker">留一点空白给自己</p><h2>这天，<br /><mark>自由发挥。</mark></h2><p>{scene.line}</p><button className="btn btn-green" onClick={() => navigate("add")}>＋ 记一条</button></div></div>}
        {dayConflicts.map(c => <div className="note" key={c.conflictId}><span className="note-dot" /><div><h3 className="note-title">{c.humanMessage}</h3><p className="note-detail">{c.involvedTaskIds.map(id => store.tasks.find(t => t.id === id)?.title).filter(Boolean).join(" / ")}</p></div></div>)}
      </section>
      {dayConflicts.length > 0 && dayTasks.some(t => !t.done && !t.locked && !t.repeat && t.durationMin > 0) && <div className="plan-entry"><button className="btn btn-green" onClick={() => setShowPlan(!showPlan)} aria-expanded={showPlan}>{showPlan ? "收起建议" : "帮我重排这一天 ↗"}</button></div>}
      {showPlan && <Sheet title="重新安排这一天" onBack={()=>setShowPlan(false)} onClose={()=>setShowPlan(false)} wide><ReplanPanel key={day} tasks={store.tasks} dayKey={day} now={now} termStartDayKey={store.termStartDayKey} onApplied={()=>setShowPlan(false)} /></Sheet>}
    </>;
  }

  return <>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="nav"><div className="nav-in"><div className="nav-pill"><button className="brand" onClick={() => navigate("today")}><span className="brand-mark" aria-hidden="true">二</span><span className="brand-word">第二自我</span></button><span className="nav-state"><i />今天 · {ready ? stateLabel : "…"}</span><button className="nav-avatar" disabled={!ready} aria-label="个人设置" title={profile.name} onClick={() => setSettings(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={profile.avatar} alt={profile.name + "的头像"} />
    </button></div></div></header>
    <main id="main-content">
      {ready && <div className="clock-strip">{today} {weekdayLabel(today)} {formatClock(now.getTime())} · {store.demoClock.source === "seed" ? <><strong>演示时间</strong><button onClick={() => {store.exitDemo(); setSelected(null); setMonthOffset(0); setNotice("已返回实时日程");}}>返回实时</button></> : "实时日程"}</div>}
      {syncStatus !== "saved" && <div className={"account-save-notice is-" + syncStatus} role="status"><span>{syncStatus === "saving" ? "正在保存…" : syncStatus === "offline" ? "连接中断，修改已留在本机" : syncError}</span>{syncStatus === "offline" && <button onClick={() => void sync.flush()}>重试保存</button>}{(syncStatus === "conflict" || syncStatus === "expired") && <button onClick={() => setSettings(true)}>处理</button>}</div>}
      {(!storageOK || store.lastError) && <div className="global-alert" role="alert">{!storageOK ? "浏览器未能保存数据，请立即到设置导出备份。" : store.lastError}<button onClick={store.dismissError}>知道了</button></div>}
      {!ready && <div className="page-shell"><PlanningLoading label="正在读取日程" onCycleComplete={() => setInitialCycleDone(true)} /></div>}
      {ready && tab === "today" && <section id="view-today"><div className="hero-in"><div className="hero-copy"><p className="eyebrow">今天的你，也有另一个自己照应。</p><h1 className="hero-title">把今天，<br /><mark>{dayConflicts.length ? "安排明白。" : "过得从容。"}</mark></h1><p className="hero-sub">{ready ? todayTasks.length ? todayTasks.filter(t=>!t.done).length + " 件待办，一件一件来。" : "事情交给日程，生活留给自己。" : "正在准备你的今天。"}</p><p className="hero-status"><i /><span>{stateLabel}</span><span>·</span><span>{formatDuration(load)} / 10 小时</span></p></div></div><div className="home-shell"><div className="stack">{dayCard()}{looseTasks.length > 0 && <section className="add-card mt-5"><h2 className="section-heading">还没定时间 · {looseTasks.length}</h2>{renderRows(looseTasks, day)}</section>}</div></div></section>}
      {ready && <section className="page-shell" hidden={tab !== "add"}><header className="page-head"><h1 className="page-title">记一条<mark>新鲜事。</mark></h1></header><div className="stack space-y-5"><IntakePanel /><ManualAddForm /></div></section>}
      {ready && tab === "future" && <section className="page-shell"><header className="page-head"><h1 className="page-title">未来，<mark>心里有数。</mark></h1><p className="page-sub">看看接下来的日子，把时间留给重要的事。</p></header><div className="stack"><section className="calendar-card" aria-label="日程月历"><div className="cal-head"><h2>{displayedMonth.getFullYear()} 年 {displayedMonth.getMonth()+1} 月</h2><div className="month-controls"><button aria-label="上个月" onClick={() => setMonthOffset(monthOffset-1)}>←</button><button onClick={() => {setMonthOffset(0); chooseDay(today);}}>今天</button><button aria-label="下个月" onClick={() => setMonthOffset(monthOffset+1)}>→</button></div></div><div className="cal-week">{"一二三四五六日".split("").map(w => <span key={w}>{w}</span>)}</div><div className="cal-grid">{Array.from({length:blanks},(_,i)=><span key={"blank"+i} />)}{Array.from({length:monthDays},(_,i)=> {const key=addDaysToKey(first,i); const count=tasksOnDay(store.tasks,key,store.termStartDayKey).length; const hasConflict=conflicts.some(c=>c.date===key); return <button key={key} className={"cal-day " + (key===day ? "is-active " : count ? "has-tasks " : "") + (key===today ? "is-today" : "")} aria-label={key + "，" + count + "项安排" + (hasConflict ? "，有冲突" : "")} aria-pressed={key===day} onClick={()=>chooseDay(key)}><span className="cal-num">{i+1}</span><span className="cal-count">{count ? count+" 项" : ""}</span>{hasConflict && <i className="cal-dot" />}</button>;})}</div></section><div className="date-controls"><button className="round-action date-arrow" onClick={()=>chooseDay(addDaysToKey(day,-1))} aria-label="前一天">←</button><label>查看日期<input type="date" value={day} onChange={e => {if(e.target.value) chooseDay(e.target.value);}} /></label><button className="round-action date-arrow" onClick={()=>chooseDay(addDaysToKey(day,1))} aria-label="后一天">→</button></div>{dayCard()}<section className="add-card mt-5"><label className="search-label" htmlFor="task-search">查找全部 {store.tasks.length} 项任务</label><input id="task-search" type="search" placeholder="按标题、地点查找" value={query} onChange={e=>setQuery(e.target.value)} />{query && (searchResults.length ? renderRows(searchResults, day, false) : <p className="empty">没有匹配的任务。</p>)}{looseTasks.length>0 && <details className="advanced"><summary>未安排任务 · {looseTasks.length}</summary>{renderRows(looseTasks,day)}</details>}</section></div></section>}
    </main>
    <nav className="tabbar" aria-label="主导航">{(["today","add","future"] as Tab[]).map(key=><button key={key} className={key==="add" ? "tab-add" : ""} aria-current={tab===key?"page":undefined} onClick={()=>navigate(key)}>{key==="add" ? <span className="tab-add-circle"><Icon name={key}/></span> : <Icon name={key}/>}<span>{tabNames[key]}</span></button>)}</nav>
    <UndoNotice />
    {notice && <div className="toast" role="status"><p>{notice}</p><button aria-label="关闭提示" onClick={()=>setNotice("")}>关闭</button></div>}
    {settings && <ProfileSettings profile={profile} onSave={saveProfile} onClose={()=>setSettings(false)} onClear={()=>{if(window.confirm("清空全部任务？可撤销。")){store.clearAll();setNotice("已清空任务");}}} />}
    {editing && <TaskEditor key={editing.id} task={editing} onClose={()=>setEditing(null)} onSaved={message=>{setEditing(null);setNotice(message);}} />}
  </>;
}
