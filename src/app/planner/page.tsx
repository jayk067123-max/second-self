"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeAvatarSummary, tasksOnDay } from "@/domain/avatar";
import { DEFAULT_DETECT_CONFIG, conflictedTaskIds, detectConflicts } from "@/domain/conflicts";
import { weekdayLabel } from "@/domain/time";
import { DEMO_DAY_KEY, DEMO_NOW_ISO } from "@/shared/constants";
import { usePlannerHydration, usePlannerStore } from "@/data/store";
import { Badge, Button } from "@/ui/primitives";
import { AvatarCard } from "@/ui/composites/AvatarCard";
import { ConflictPanel } from "@/ui/composites/ConflictPanel";
import { DataPortability } from "@/ui/composites/DataPortability";
import { DayTimeline } from "@/ui/composites/DayTimeline";
import { IntakePanel } from "@/ui/composites/IntakePanel";
import { ManualAddForm } from "@/ui/composites/ManualAddForm";
import { ReplanPanel } from "@/ui/composites/ReplanPanel";

/**
 * 今日编排页 —— 只做「组装 + 派生计算」。
 * 所有判定都来自 domain 的纯函数（冲突/分身/校验），组件不自己算业务。
 */
export default function PlannerPage() {
  const hydrated = usePlannerHydration();
  const tasks = usePlannerStore((s) => s.tasks);
  const hasSnapshot = usePlannerStore((s) => s.snapshot !== null);
  const lastError = usePlannerStore((s) => s.lastError);
  const undo = usePlannerStore((s) => s.undo);
  const removeTask = usePlannerStore((s) => s.removeTask);
  const toggleDone = usePlannerStore((s) => s.toggleDone);
  const clearAll = usePlannerStore((s) => s.clearAll);
  const dismissError = usePlannerStore((s) => s.dismissError);

  // 演示时钟注入：日期与"现在"都取 DEMO_NOW，不读系统时钟（见 shared/constants 的说明）
  const [dayKey] = useState(() => DEMO_DAY_KEY);
  // 冲突规则要求 now 由调用方注入（函数内不读时钟），这里挂载时定一次，保证渲染稳定
  const [now] = useState(() => new Date(DEMO_NOW_ISO));

  const todayTasks = useMemo(() => tasksOnDay(tasks, dayKey), [tasks, dayKey]);
  const conflicts = useMemo(
    () => detectConflicts(tasks, DEFAULT_DETECT_CONFIG, now),
    [tasks, now],
  );
  const conflictIds = useMemo(() => conflictedTaskIds(conflicts), [conflicts]);
  const avatar = useMemo(() => computeAvatarSummary(tasks, dayKey), [tasks, dayKey]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-gutter py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="grid size-9 place-items-center rounded-md bg-brand-500 font-mono text-caption font-bold text-ink-950"
            aria-label="返回首页"
          >
            VC
          </Link>
          <div className="leading-tight">
            <p className="text-caption font-semibold text-ink-50">第二自我 · 今日编排</p>
            <p className="text-micro text-ink-400">
              {dayKey} {weekdayLabel(dayKey)} · 本地时区
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 演示时钟角标：录像硬要求，说明"今天"是注入的、与运行机器时钟无关 */}
          <Badge tone="neutral" aria-label="演示时钟">
            演示时钟 {dayKey} 09:00
          </Badge>
          <Badge tone="brand">选题 B · 个人效能</Badge>
          <Button variant="secondary" className="h-8 px-3 text-micro" onClick={undo} disabled={!hasSnapshot}>
            撤销上次写回
          </Button>
          <DataPortability />
          <Button
            variant="ghost"
            className="h-8 px-3 text-micro"
            onClick={() => {
              if (tasks.length === 0) return;
              if (window.confirm("清空本地全部任务？该操作不可撤销。")) clearAll();
            }}
          >
            清空
          </Button>
        </div>
      </header>

      {lastError ? (
        <div className="flex items-center justify-between gap-2 rounded-sm bg-danger-500/10 px-3 py-2 text-caption text-danger-400 ring-1 ring-inset ring-danger-500/30">
          <span>{lastError}</span>
          <Button variant="ghost" className="h-7 px-2 text-micro" onClick={dismissError}>
            知道了
          </Button>
        </div>
      ) : null}

      {!hydrated ? (
        <div className="flex items-center gap-2 rounded-sm bg-ink-800/60 px-3 py-1.5 text-micro text-ink-300">
          <span className="size-1.5 animate-pulse rounded-pill bg-brand-400" aria-hidden />
          正在读取本地任务（localStorage · 读取后会先过一遍 zod 校验）
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="flex flex-col gap-4">
          <IntakePanel />
          <ManualAddForm />
          <DayTimeline
            tasks={todayTasks}
            conflictIds={conflictIds}
            onToggle={toggleDone}
            onRemove={removeTask}
          />
          <ConflictPanel conflicts={conflicts} tasks={tasks} />
        </div>
        <div className="flex flex-col gap-4">
          <AvatarCard summary={avatar} />
          <ReplanPanel tasks={todayTasks} dayKey={dayKey} now={now} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-4 text-micro text-ink-400">
        <p>数据只存在本机浏览器，不上传任何服务器；模型调用仅发送你粘进来的文本。</p>
        <Link href="/api/health" className="font-mono hover:text-ink-200">
          /api/health
        </Link>
      </footer>
    </main>
  );
}
