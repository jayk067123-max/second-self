import { describe, expect, it, beforeEach } from "vitest";
import { demoParseTasks, demoReplanPlans } from "@/ai/demo";
import { tasksOnDay } from "@/domain/avatar";
import { detectConflicts, DEFAULT_DETECT_CONFIG } from "@/domain/conflicts";
import { guardPlan } from "@/domain/planGuard";
import { usePlannerStore } from "@/data/store";
import { makeTask, hhmm } from "../helpers/fixtures";

describe("正式版整合回归", () => {
  beforeEach(()=>usePlannerStore.setState({tasks:[],snapshot:null,snapshotClock:null,demoClock:{iso:"2026-10-24T10:00:00+08:00",source:"system"}}));
  it("明确日期优先于当前日期",()=>{
    const task=demoParseTasks("2026-10-25 14:00-15:00 小组讨论","2026-10-20")[0];
    expect(task?.start).toBe(hhmm("2026-10-25",14));
    expect(task?.end).toBe(hhmm("2026-10-25",15));
  });
  it("冒号时间范围不会被误判成短日期",()=>{
    expect(demoParseTasks("9:00-10:30 高等数学","2026-10-24")[0]?.start).toBe(hhmm("2026-10-24",9));
  });
  it("下周一按下一自然周计算，不额外跳过一周",()=>{
    expect(demoParseTasks("下周一 14:00-15:00 小组讨论","2026-10-24")[0]?.start).toBe(hhmm("2026-10-26",14));
  });
  it("周期课在未来日期显示，完成仅影响当天",()=>{
    const t=makeTask({id:"weekly",title:"周课",start:hhmm("2026-10-19",9),end:hhmm("2026-10-19",10),durationMin:60,repeat:{kind:"weekly",byDay:[1]}});
    usePlannerStore.setState({tasks:[t]});
    usePlannerStore.getState().toggleDone(t.id,"2026-10-26");
    expect(tasksOnDay(usePlannerStore.getState().tasks,"2026-10-26")[0]?.done).toBe(true);
    expect(tasksOnDay(usePlannerStore.getState().tasks,"2026-11-02")[0]?.done).toBe(false);
    expect(tasksOnDay(usePlannerStore.getState().tasks,"2026-10-27")).toEqual([]);
  });
  it("跨越整日的多日任务不会从中间日期消失",()=>{
    const t=makeTask({start:hhmm("2026-10-24",10),end:hhmm("2026-10-27",10)});
    expect(tasksOnDay([t],"2026-10-25")).toHaveLength(1);
  });
  it("编辑和删除各自可撤销",()=>{
    const t=makeTask({id:"edit"});usePlannerStore.setState({tasks:[t]});
    usePlannerStore.getState().updateTask(t.id,{title:"新标题"});usePlannerStore.getState().undo();
    expect(usePlannerStore.getState().tasks[0]?.title).toBe(t.title);
    usePlannerStore.getState().removeTask(t.id);usePlannerStore.getState().undo();
    expect(usePlannerStore.getState().tasks).toHaveLength(1);
  });
  it("冻结演示时间可以返回实时",()=>{
    usePlannerStore.setState({demoClock:{iso:"2026-10-19T09:00:00+08:00",source:"seed"}});
    usePlannerStore.getState().tickClock();expect(usePlannerStore.getState().demoClock.source).toBe("seed");
    usePlannerStore.getState().exitDemo();expect(usePlannerStore.getState().demoClock.source).toBe("system");
  });
  it("未来重排只移动所选日任务",()=>{
    const tasks=[makeTask({id:"a",start:hhmm("2026-10-25",14),end:hhmm("2026-10-25",15),durationMin:60}),makeTask({id:"b",start:hhmm("2026-10-25",14),end:hhmm("2026-10-25",15),durationMin:60}),makeTask({id:"c",start:hhmm("2026-10-26",14),end:hhmm("2026-10-26",15),durationMin:60})];
    const plans=demoReplanPlans(tasks,"2026-10-25",new Date("2026-10-24T10:00:00+08:00"));
    expect(plans.length).toBeGreaterThan(0);
    for(const plan of plans){expect(plan.blocks.every(b=>b.taskId!=="c")).toBe(true);expect(guardPlan(plan,tasks,{dayKey:"2026-10-25",now:"2026-10-24T10:00:00+08:00"}).ok).toBe(true);}
  });
  it("禁止把固定任务移入过去或其他日期",()=>{
    const t=makeTask({id:"fixed",locked:true,start:hhmm("2026-10-25",14),end:hhmm("2026-10-25",15),durationMin:60});
    const result=guardPlan({id:"bad",title:"bad",rationale:"bad",blocks:[{taskId:t.id,start:hhmm("2026-10-24",8),end:hhmm("2026-10-24",9)}]},[t],{dayKey:"2026-10-25",now:"2026-10-24T10:00:00+08:00"});
    expect(result.ok).toBe(false);
  });
  it("周期截止在下次发生日可见，完成按天隔离",()=>{
    const t=makeTask({id:"weekly-ddl",title:"周报",deadline:hhmm("2026-10-23",22),repeat:{kind:"weekly",byDay:[5]},priority:1});
    expect(tasksOnDay([t],"2026-10-30")[0]?.deadline).toBe(hhmm("2026-10-30",22));
    expect(detectConflicts([t],DEFAULT_DETECT_CONFIG,new Date(hhmm("2026-10-30",12))).some(c=>c.date==="2026-10-30")).toBe(true);
    expect(detectConflicts([{...t,completedOn:["2026-10-30"]}],DEFAULT_DETECT_CONFIG,new Date(hhmm("2026-10-30",12)))).toHaveLength(0);
  });
  it("普通导入回到实时，撤销同时恢复演示时钟和学期",()=>{
    usePlannerStore.setState({demoClock:{iso:"2026-10-19T09:00:00+08:00",source:"seed"},termStartDayKey:"2026-09-21"});
    const source=JSON.stringify({format:"vibe-coding-2026/planner",version:2,exportedAt:new Date().toISOString(),data:{tasks:[],snapshot:null}});
    expect(usePlannerStore.getState().importJson(source).ok).toBe(true);
    expect(usePlannerStore.getState().demoClock.source).toBe("system");
    usePlannerStore.getState().undo();
    expect(usePlannerStore.getState().demoClock.source).toBe("seed");
    expect(usePlannerStore.getState().termStartDayKey).toBe("2026-09-21");
  });
});
