"use client";

import type { AvatarSummary } from "@/domain/avatar";
import type { Conflict } from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { usePlannerStore } from "@/data/store";
import { Button, EmptyState } from "@/ui/primitives";
import { ConflictPanel } from "./ConflictPanel";
import { PlanUndoBar } from "./PlanUndoBar";
import { ReplanPanel } from "./ReplanPanel";
import { ThreeDayAgenda } from "./ThreeDayAgenda";
import { TodayHeadline } from "./TodayHeadline";
import type { HeadlineView } from "./headline";

/**
 * 「今日」页 —— 只回答一个问题：今天到后天会撞上什么。
 *
 * 版面：一句人话结论（右上角带分身完成度）→ 三天时间轴（冲突贴发生处）
 * → 冲突明细（有才出现）→ 3 秒撤销条（方案写回后才出现）。
 * 卡片最多两张；没有冲突时省掉第二张，只留一行字。
 */
export function TabToday({
  hydrated,
  headline,
  avatar,
  tasks,
  days,
  conflicts,
  nowMs,
  now,
  dayKey,
  todayTasks,
  windowCount,
  onGoCapture,
}: {
  hydrated: boolean;
  headline: HeadlineView;
  avatar: AvatarSummary;
  tasks: Task[];
  days: { dayKey: string; label: string }[];
  conflicts: Conflict[];
  nowMs: number;
  now: Date;
  dayKey: string;
  todayTasks: Task[];
  windowCount: number;
  onGoCapture: () => void;
}) {
  const toggleDone = usePlannerStore((s) => s.toggleDone);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TodayHeadline view={headline} avatar={avatar} />

      {!hydrated ? (
        <AgendaSkeleton />
      ) : windowCount === 0 ? (
        <div className="rounded-card bg-ink-900 px-2 py-2 shadow-card">
          <EmptyState
            bare
            className="py-8"
            icon="＋"
            title="今天还是空的"
            description="粘一段通知、传一张课表截图，或者直接手动记一条。漏掉的每一行我都会回头问你。"
            action={
              <Button size="lg" onClick={onGoCapture}>
                去随手记
              </Button>
            }
          />
        </div>
      ) : (
        <ThreeDayAgenda
          tasks={tasks}
          days={days}
          conflicts={conflicts}
          nowMs={nowMs}
          onToggle={toggleDone}
        />
      )}

      {/* 冲突明细：没有冲突就只留一行字，不再占一张卡 */}
      {conflicts.length > 0 ? (
        <ConflictPanel conflicts={conflicts} tasks={tasks} />
      ) : windowCount > 0 ? (
        <p className="px-1 text-micro text-ink-400">时间没有打架，缓冲也留够了。</p>
      ) : null}

      {/* 重排是第二层的动作，收在折叠里，不占首屏 */}
      {todayTasks.length > 0 ? (
        <details className="px-1">
          <summary className="cursor-pointer list-none text-micro font-medium text-ink-300 marker:content-none">
            今天要不要我重排一版？
          </summary>
          <div className="mt-2">
            <ReplanPanel tasks={todayTasks} dayKey={dayKey} now={now} />
          </div>
        </details>
      ) : null}

      {/* 方案写回后浮 3 秒，撤销不用切到「我的」页 */}
      <PlanUndoBar />
    </div>
  );
}

/** 加载态：形状和真实时间轴一致，读盘那 100ms 不会跳版 */
function AgendaSkeleton() {
  return (
    <div className="rounded-card bg-ink-900 p-5 shadow-card">
      <div className="h-4 w-24 animate-pulse rounded-pill bg-ink-800" />
      <div className="mt-4 flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded-pill bg-ink-800"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <p className="mt-4 text-micro text-ink-400">正在读本地任务（先过一遍校验，脏数据不会进画面）</p>
    </div>
  );
}
