"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo } from "react";
import { computeAvatarSummary, tasksOnDay } from "@/domain/avatar";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import { dayKeyOf, weekdayLabel } from "@/domain/time";
import { TERM_START_DAY_KEY } from "@/shared/constants";
import { usePlannerHydration, usePlannerStore } from "@/data/store";
import { Button, EmptyState } from "@/ui/primitives";
import { AvatarCard } from "./AvatarCard";
import { ConflictPanel } from "./ConflictPanel";
import { DataPortability } from "./DataPortability";
import { IntakePanel } from "./IntakePanel";
import { ManualAddForm } from "./ManualAddForm";
import { ReplanPanel } from "./ReplanPanel";
import { ThreeDayAgenda } from "./ThreeDayAgenda";
import { TimetableReuploadPanel } from "./TimetableReuploadPanel";
import { TodayHeadline } from "./TodayHeadline";
import { buildHeadline, threeDayWindow } from "./headline";

/**
 * 今日视图 —— 整个首页只有这一个文件在"装配"。
 *
 * 版面顺序是硬要求，不是审美偏好：
 *   一句人话结论 → 近三天时间轴 → 冲突明细 → 分身 → 重排 → 录入。
 * 录入是**动作入口**，不是首屏内容：手机上它只以底部那颗主按钮出现，
 * 首屏必须整块让给「今天会撞上什么」。
 *
 * 三种状态都显式画出来：
 *   加载 = 骨架行；空 = 空态卡 + 主按钮；出错 = 顶部红条 + 关闭。
 */
export function TodayScreen() {
  const hydrated = usePlannerHydration();
  const tasks = usePlannerStore((s) => s.tasks);
  const hasSnapshot = usePlannerStore((s) => s.snapshot !== null);
  const lastError = usePlannerStore((s) => s.lastError);
  const undo = usePlannerStore((s) => s.undo);
  const clearAll = usePlannerStore((s) => s.clearAll);
  const dismissError = usePlannerStore((s) => s.dismissError);
  const demoClock = usePlannerStore((s) => s.demoClock);

  // "现在"永远由 demoClock 注入（domain 里不读系统时钟），来源写在角标上可自证。
  const now = useMemo(() => new Date(demoClock.iso), [demoClock.iso]);
  const nowMs = now.getTime();
  const dayKey = useMemo(() => dayKeyOf(nowMs), [nowMs]);
  const days = useMemo(() => threeDayWindow(dayKey), [dayKey]);

  const detectConfig = useMemo(
    () => ({ ...DEFAULT_DETECT_CONFIG, termStartDayKey: TERM_START_DAY_KEY }),
    [],
  );
  const conflicts = useMemo(
    () => detectConflicts(tasks, detectConfig, now),
    [tasks, detectConfig, now],
  );
  const avatar = useMemo(() => computeAvatarSummary(tasks, dayKey), [tasks, dayKey]);
  const todayTasks = useMemo(() => tasksOnDay(tasks, dayKey), [tasks, dayKey]);
  const windowCount = useMemo(
    () => days.reduce((sum, day) => sum + tasksOnDay(tasks, day.dayKey).length, 0),
    [tasks, days],
  );
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const headline = useMemo(
    () =>
      buildHeadline({
        todayKey: dayKey,
        todayCount: todayTasks.length,
        windowCount,
        conflicts,
        tasksById,
      }),
    [dayKey, todayTasks.length, windowCount, conflicts, tasksById],
  );

  const clockText = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  const jumpToIntake = useCallback(() => {
    document.getElementById("intake-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-gutter pt-4 pb-28 lg:pt-8 lg:pb-10">
      {/* ---------- 顶栏：只留身份 + 可复现的时钟 ---------- */}
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-500 font-mono text-micro font-bold text-on-solid"
        >
          我
        </span>
        <p className="min-w-0 truncate text-caption font-semibold text-ink-50">第二自我</p>
        <span className="tnum ml-auto shrink-0 font-mono text-micro text-ink-400">
          {dayKey.slice(5).replace("-", "/")} {weekdayLabel(dayKey)} {clockText}
        </span>
      </header>

      {/* ---------- 出错态：不挡路，但一定看得见 ---------- */}
      {lastError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-500/10 px-3 py-2"
        >
          <span
            aria-hidden
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger-500 text-[9px] font-bold leading-none text-on-solid"
          >
            !
          </span>
          <p className="min-w-0 flex-1 text-micro leading-relaxed text-danger-400">{lastError}</p>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 rounded px-1 text-micro text-danger-400 hover:underline"
          >
            知道了
          </button>
        </div>
      ) : null}

      {/* 桌面两栏：左「结论 + 时间轴 + 冲突」是主阅读列，右栏是分身与数据操作。
          轨道写成 minmax(0,1fr)：单列 auto 轨道会被子元素的 min-content 撑破，
          手机上就会出现横向滚动（整页被浏览器缩放，底部按钮被挤出屏幕）。 */}
      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          className="flex min-w-0 flex-col gap-3.5 lg:max-w-[680px] lg:gap-5"
        >
          <TodayHeadline view={headline} />

          {!hydrated ? (
            <AgendaSkeleton />
          ) : windowCount === 0 ? (
            <div className="rounded-card bg-ink-900 px-2 py-2 shadow-card">
              <EmptyState
                bare
                className="py-8"
                icon="○"
                title="今天还是空的"
                description="粘一段群通知、传一张课表截图，或者直接手记一条。漏掉的每一行我都会回头问你。"
                action={
                  <Button size="lg" onClick={jumpToIntake}>
                    随手记一条
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
            />
          )}

          <ConflictPanel conflicts={conflicts} tasks={tasks} />
          <ReplanPanel tasks={todayTasks} dayKey={dayKey} now={now} />
        </motion.div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          <AvatarCard summary={avatar} />
          <section className="flex flex-col gap-2 rounded-card bg-ink-900 p-4 shadow-soft">
            <p className="text-micro text-ink-400">数据与撤销 · 全部存在这台设备</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="h-8 px-3 text-micro"
                onClick={undo}
                disabled={!hasSnapshot}
              >
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
          </section>
        </aside>
      </div>

      {/* ---------- 录入入口：动作，不是首屏内容 ---------- */}
      <div
        id="intake-panel"
        className="mt-4 flex min-w-0 scroll-mt-4 flex-col gap-4 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start"
      >
        <IntakePanel />
        <div className="flex min-w-0 flex-col gap-4">
          <ManualAddForm />
          <TimetableReuploadPanel />
        </div>
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 text-micro text-ink-400">
        <p>数据只存在本机浏览器，不上传服务器；模型调用仅发送你粘进来的文本。</p>
        <span className="font-mono">v0.1.0</span>
      </footer>

      {/* ---------- 手机端单手入口：整页唯一的主按钮 ---------- */}
      {windowCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-ink-950/90 px-4 pb-4 pt-2 backdrop-blur-md lg:hidden">
          <Button size="lg" className="w-full shadow-glow" onClick={jumpToIntake}>
            随手记一条
          </Button>
        </div>
      ) : null}
    </main>
  );
}

/** 加载态：形状和真实时间轴一致，读盘那 100ms 不会跳版 */
function AgendaSkeleton() {
  return (
    <div className="rounded-card bg-ink-900 p-4 shadow-card">
      <div className="h-4 w-24 animate-pulse rounded-pill bg-ink-800" />
      <div className="mt-3 flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-7 animate-pulse rounded-xl bg-ink-800"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <p className="mt-3 text-micro text-ink-400">
        正在读本地任务（先过一遍校验，脏数据不会进画面）
      </p>
    </div>
  );
}
