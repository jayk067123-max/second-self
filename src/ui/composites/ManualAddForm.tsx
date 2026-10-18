"use client";

import { useState } from "react";
import { DEMO_DAY_KEY } from "@/shared/constants";
import { localInputToIso } from "@/shared/datetime";
import { usePlannerStore } from "@/store/planner";
import { Button, Card, CardText, CardTitle, Input, Label, Select, StatusBanner } from "@/ui/primitives";

/**
 * P0-2 手动新增任务 —— 第二个数据入口（第一个是粘贴解析）。
 * 设计目标：**10 秒内加一条**。所以默认值全部预填（今天、常规优先级），
 * 只有标题是必填；时间/截止/地点留空也能存，之后在时间轴上补。
 */
export function ManualAddForm() {
  const addManualTask = usePlannerStore((s) => s.addManualTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  // 演示时钟：与页面其它地方一致，不读系统时间
  const dayKey = DEMO_DAY_KEY;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [location, setLocation] = useState("");
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  function durationOf(): number {
    const s = localInputToIso(start);
    const e = localInputToIso(end);
    if (!s || !e) return start || end ? 30 : 0;
    const diff = Math.round((Date.parse(e) - Date.parse(s)) / 60_000);
    return Number.isFinite(diff) && diff > 0 ? diff : 30;
  }

  function reset() {
    setTitle("");
    setStart("");
    setEnd("");
    setDeadline("");
    setPriority(2);
    setLocation("");
    setLocked(false);
  }

  function submit() {
    if (title.trim().length === 0) {
      setFeedback({ tone: "danger", text: "标题不能为空" });
      return;
    }
    if ((start && !end) || (!start && end)) {
      setFeedback({ tone: "danger", text: "开始和结束要么都填，要么都留空" });
      return;
    }
    const result = addManualTask({
      title: title.trim(),
      start: localInputToIso(start),
      end: localInputToIso(end),
      durationMin: durationOf(),
      deadline: localInputToIso(deadline),
      priority,
      location: location.trim() === "" ? null : location.trim(),
      locked,
    });
    if (!result.ok) {
      setFeedback({ tone: "danger", text: result.error ?? "新增失败" });
      return;
    }
    setFeedback({ tone: "ok", text: `已加入「${title.trim()}」` });
    reset();
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <CardTitle>手动新增</CardTitle>
          <CardText className="mt-0.5">第二个数据入口：临时想到的事，10 秒录进来</CardText>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          ＋ 新增一条
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <CardTitle>手动新增</CardTitle>
          <CardText className="mt-0.5">只有标题必填，其余可留空</CardText>
        </div>
        <Button variant="ghost" className="h-8 px-3 text-micro" onClick={() => setOpen(false)}>
          收起
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="manual-title">标题 *</Label>
          <Input
            id="manual-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：复习电路实验"
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <div>
          <Label htmlFor="manual-start">开始</Label>
          <Input
            id="manual-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder={`${dayKey}T09:00`}
          />
        </div>
        <div>
          <Label htmlFor="manual-end">结束</Label>
          <Input id="manual-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="manual-deadline">截止（只有 DDL 时填这个）</Label>
          <Input
            id="manual-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="manual-priority">优先级</Label>
          <Select
            id="manual-priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
          >
            <option value={1}>1 · 紧急</option>
            <option value={2}>2 · 常规</option>
            <option value={3}>3 · 弹性</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="manual-location">地点（影响通勤缓冲）</Label>
          <Input
            id="manual-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例如：三教201 / 市区鼓楼"
            maxLength={60}
          />
        </div>
        <label className="flex items-end gap-2 pb-1 text-micro text-ink-300">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
            className="size-4 accent-brand-500"
          />
          固定课（重排不许移动）
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit}>加入时间轴</Button>
        <Button variant="ghost" onClick={reset}>
          清空
        </Button>
        <span className="ml-auto font-mono text-micro text-ink-400">
          时长 {durationOf()} 分钟{start === "" && end === "" ? "（未填时段）" : ""}
        </span>
      </div>

      {feedback ? <StatusBanner tone={feedback.tone}>{feedback.text}</StatusBanner> : null}
    </Card>
  );
}
