"use client";

import { useState } from "react";
import {
  formatTimetableSummary,
  planTimetableCoverage,
  type TimetableBlock,
  type TimetablePlan,
} from "@/domain/schedule";
import { parseTimetableText } from "@/shared/timetableParse";
import { usePlannerStore } from "@/data/store";
import { courseBlocksOf } from "./timetableCoverage";
import { Badge, Button, Card, CardText, CardTitle, StatusBanner, Textarea } from "@/ui/primitives";

/**
 * 课表重传覆盖（P0-11）—— 这是答辩上的差异点：**换一份新课表，不是"再导入一遍"，
 * 而是"比出差异、保留用户标记、只改课表条目"**。
 *
 * 边界（与 SPEC/需求书一致）：
 * 1. 只对**课表类条目**做比对，取样规则集中在 `courseBlocksOf`（含"新表覆盖到的星期几"
 *    这条范围线）。会议/兼职/体测不参与，否则摘要会把它们算成"删除"，点一次确认就真删了。
 * 2. 落库走 store 的 `applyTimetablePlan`：`updated` 原地 update，保留 done / locked /
 *    needsReview / repeat；覆盖前自动入快照，可撤销。
 */

export function TimetableReuploadPanel() {
  const tasks = usePlannerStore((s) => s.tasks);
  const applyTimetablePlan = usePlannerStore((s) => s.applyTimetablePlan);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<TimetablePlan | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function compare() {
    setBusy(true);
    setMsg(null);
    setPlan(null);
    try {
      // 课表格式固定，用确定性解析（比模型更准、可离线），模型留给"脏文本"那条路径
      const parsed = parseTimetableText(text);
      if (parsed.length === 0) {
        setMsg({
          tone: "danger",
          text: "没认出任何课：每行写成「星期一  08:00-09:40  课程名  地点」这种格式",
        });
        return;
      }
      // 前提（约束 1，写在这里免得后来人"顺手"换掉）：after **只可能是课表解析结果**，
      // 不可能是全部 tasks。会议 / 兼职 / 体测这类不是课表的安排压根不在这份 blocks 里。
      // before 侧走 `courseBlocksOf`：只取「有始有终 + 固定或带地点」的条目，并且只取
      // **新表覆盖到的星期几**——否则「启航兼职」（周日、固定、有地点）会被算成"删除 1"，
      // 用户点一次确认就真把它删了。宁可漏报一门被取消的课，也不误删用户的安排。
      const after: TimetableBlock[] = parsed.map((block) => ({
        title: block.title,
        weekday: block.weekday,
        startMinute: block.startMinute,
        durationMin: block.durationMin,
        location: block.location,
      }));
      const scopeWeekdays = new Set(after.map((block) => block.weekday));
      const before = courseBlocksOf(tasks, scopeWeekdays);
      setPlan(planTimetableCoverage(before, after));
    } catch (error) {
      setMsg({
        tone: "danger",
        text: error instanceof Error ? `比对失败：${error.message}` : "比对失败",
      });
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!plan) return;
    const result = applyTimetablePlan(plan);
    if (!result.ok) {
      setMsg({ tone: "danger", text: result.error ?? "覆盖失败" });
      return;
    }
    setMsg({ tone: "ok", text: `${result.summary ?? "已覆盖"}；用户勾选与固定课标记已保留` });
    setPlan(null);
    setText("");
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <CardTitle>重传课表</CardTitle>
          <CardText className="mt-0.5">换了一份新课表？先比出差异，再决定覆盖</CardText>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          比对新课表
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <CardTitle>重传课表 · 比对覆盖</CardTitle>
          <CardText className="mt-0.5">
            只比课表条目；会议 / 兼职 / 体测不参与，不会被算成“删除”
          </CardText>
        </div>
        <Button variant="ghost" className="h-8 px-3 text-micro" onClick={() => setOpen(false)}>
          收起
        </Button>
      </div>

      <Textarea
        aria-label="粘贴新课表"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"把新课表粘进来，一行一门课，例如：\n周一 08:00-09:40 线性代数 三教201\n周三 14:00-15:40 数据结构 实验楼B305"}
        className="min-h-24"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void compare()} disabled={busy || text.trim().length < 5}>
          {busy ? "比对中…" : "比对并生成计划"}
        </Button>
        <Badge tone="neutral">当前固定块 {courseBlocksOf(tasks).length} 条</Badge>
      </div>

      {msg ? <StatusBanner tone={msg.tone}>{msg.text}</StatusBanner> : null}

      {plan ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-ink-800/70 px-3 py-2">
            <span className="text-caption text-ink-100">{formatTimetableSummary(plan)}</span>
            {plan.hasDestructiveChange ? <Badge tone="warn">含新增/删除，请确认</Badge> : null}
          </div>
          <ul className="flex max-h-40 flex-col gap-1 overflow-auto">
            {plan.changes.slice(0, 10).map((change, index) => (
              <li key={`${change.kind}-${index}`} className="flex gap-2 text-micro">
                <Badge
                  tone={
                    change.kind === "added"
                      ? "ok"
                      : change.kind === "removed"
                        ? "danger"
                        : change.kind === "updated"
                          ? "warn"
                          : "neutral"
                  }
                >
                  {change.kind === "added"
                    ? "新增"
                    : change.kind === "removed"
                      ? "删除"
                      : change.kind === "updated"
                        ? "调走"
                        : "不变"}
                </Badge>
                <span className="truncate text-ink-200">{change.note}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={confirm}>确认覆盖</Button>
            <Button variant="ghost" onClick={() => setPlan(null)}>
              放弃
            </Button>
            <span className="text-micro text-ink-400">覆盖前会自动存快照，可撤销</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
