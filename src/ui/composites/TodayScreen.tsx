"use client";

import { motion } from "framer-motion";
import { useSyncExternalStore, useCallback, useMemo } from "react";
import { computeAvatarSummary, tasksOnDay } from "@/domain/avatar";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import { dayKeyOf, weekdayLabel } from "@/domain/time";
import { TERM_START_DAY_KEY } from "@/shared/constants";
import { usePlannerHydration, usePlannerStore } from "@/data/store";
import { buildHeadline, threeDayWindow } from "./headline";
import { TabCapture } from "./TabCapture";
import { TabMe } from "./TabMe";
import { TabTasks } from "./TabTasks";
import { TabToday } from "./TabToday";

/**
 * 应用外壳 = 四个标签页。
 *
 * 用户否掉了"一屏堆全部内容"：太复杂、太乱。所以这里只做两件事：
 *   1. 决定**当前是哪一页**（手机底部标签栏 / 桌面顶部导航）；
 *   2. 把 domain 算好的数一次性算完，按页喂给面板。
 *
 * 每页只干一件事，跨页重复的模块一律删掉：
 *   今日 = 结论 + 三天时间轴 + 冲突提示
 *   任务 = 全部任务 + 搜索 + 每条可溯源
 *   随手记 = 一个大输入框 + 手动加一条 + 重传课表
 *   我的 = 数字分身 + 数据导入导出 + 撤销
 *
 * 不新增路由（/planner 仍指向这里），标签状态写进 location.hash，
 * 好处是截图、录像、刷新都能停在同一页（#today / #tasks / #capture / #me）。
 */

export type TabKey = "today" | "tasks" | "capture" | "me";

const TAB_LABEL: Record<TabKey, string> = {
  today: "今日",
  tasks: "任务",
  capture: "随手记",
  me: "我的",
};

const TAB_ORDER: TabKey[] = ["today", "tasks", "capture", "me"];

function isTabKey(value: string): value is TabKey {
  return (TAB_ORDER as string[]).includes(value);
}

/** hash 订阅：刷新、手改地址栏、点导航都走同一条路 */
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashTab(): TabKey {
  const fromHash = window.location.hash.replace("#", "");
  return isTabKey(fromHash) ? fromHash : "today";
}

/** 服务端没有 hash，统一渲「今日」；客户端首帧之后由 hash 接管 */
function getServerTab(): TabKey {
  return "today";
}

export function TodayScreen() {
  const hydrated = usePlannerHydration();
  const tasks = usePlannerStore((s) => s.tasks);
  const hasSnapshot = usePlannerStore((s) => s.snapshot !== null);
  const lastError = usePlannerStore((s) => s.lastError);
  const undo = usePlannerStore((s) => s.undo);
  const clearAll = usePlannerStore((s) => s.clearAll);
  const dismissError = usePlannerStore((s) => s.dismissError);
  const demoClock = usePlannerStore((s) => s.demoClock);

  // 当前页 = location.hash 是唯一真相（不另存一份 state，免得两处打架）。
  // 切换用 replaceState：不往浏览器历史里塞四条记录；手动派发 hashchange 通知订阅者。
  const tab = useSyncExternalStore(subscribeHash, readHashTab, getServerTab);

  const selectTab = useCallback((next: TabKey) => {
    window.history.replaceState(null, "", `#${next}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  }, []);

  // "现在"永远由 demoClock 注入（domain 里不读系统时钟），来源写在顶栏可自证。
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

  return (
    <main className="mx-auto flex w-full max-w-[34rem] flex-col px-4 pb-24 pt-4 lg:max-w-3xl lg:pb-12 lg:pt-8">
      {/* ---------- 顶栏：身份 + 可复现的时钟，没有别的 ---------- */}
      <header className="flex items-center gap-2 px-1">
        <span aria-hidden className="size-2 rounded-pill bg-brand-500" />
        <p className="text-caption font-semibold tracking-wide text-ink-50">第二自我</p>
        {/* 时钟必须等挂载后再画：服务端与客户端各读一次系统时间会差几分钟，
            直接输出会让 React 判定 hydration 不一致，整棵树重渲染。 */}
        <p className="tnum ml-auto text-micro text-ink-400">
          {hydrated ? `${dayKey.slice(5).replace("-", "/")} ${weekdayLabel(dayKey)} ${clockText}` : ""}
        </p>
      </header>

      {/* ---------- 桌面导航：一行四个，不占内容区 ---------- */}
      <nav aria-label="主导航" className="mt-5 hidden lg:block">
        <ul className="flex flex-wrap gap-1.5">
          {TAB_ORDER.map((key) => {
            const active = key === tab;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectTab(key)}
                  className={
                    "inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-caption font-medium transition-colors duration-200 ease-standard " +
                    (active
                      ? "bg-brand-500 text-on-solid shadow-glow"
                      : "text-ink-300 hover:bg-ink-800 hover:text-ink-50")
                  }
                >
                  <TabIcon name={key} className="size-4" />
                  {TAB_LABEL[key]}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---------- 出错态：任何一页都不挡路，但一定看得见 ---------- */}
      {lastError ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-prio-high-bg px-3 py-2">
          <span
            aria-hidden
            className="mt-[2px] grid size-4 shrink-0 place-items-center rounded-[5px] bg-danger-500 text-[9px] font-bold leading-none text-on-solid"
          >
            !
          </span>
          <p className="min-w-0 flex-1 text-micro leading-relaxed text-danger-400">{lastError}</p>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 rounded-pill px-1 text-micro text-danger-400 hover:underline"
          >
            知道了
          </button>
        </div>
      ) : null}

      {/* ---------- 页内容：一次只挂一页，别的页不占 DOM 也不抢视线 ---------- */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mt-3 min-w-0 lg:mt-5"
      >
        {tab === "today" ? (
          <TabToday
            hydrated={hydrated}
            headline={headline}
            tasks={tasks}
            days={days}
            conflicts={conflicts}
            nowMs={nowMs}
            now={now}
            dayKey={dayKey}
            todayTasks={todayTasks}
            windowCount={windowCount}
            onGoCapture={() => selectTab("capture")}
          />
        ) : null}
        {tab === "tasks" ? <TabTasks tasks={tasks} onGoCapture={() => selectTab("capture")} /> : null}
        {tab === "capture" ? <TabCapture /> : null}
        {tab === "me" ? (
          <TabMe avatar={avatar} hasSnapshot={hasSnapshot} undo={undo} clearAll={clearAll} tasks={tasks} />
        ) : null}
      </motion.div>

      {/* ---------- 手机底部标签栏：四个「图标 + 文字」，单手够得到 ---------- */}
      <nav
        aria-label="主导航"
        className="fixed inset-x-0 bottom-0 z-30 bg-ink-900 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 shadow-[0_-10px_30px_-24px_rgb(96_62_38/0.45)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-[34rem] grid-cols-4">
          {TAB_ORDER.map((key) => {
            const active = key === tab;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectTab(key)}
                  className={
                    "flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors duration-200 ease-standard " +
                    (active ? "text-brand-500" : "text-ink-400 hover:text-ink-200")
                  }
                >
                  <TabIcon name={key} className="size-5" />
                  <span className={"text-[11px] leading-none " + (active ? "font-semibold" : "")}>
                    {TAB_LABEL[key]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}

/** 四个标签的图标：细线、同一线宽，不用图标字体（换机器不会缺字） */
function TabIcon({ name, className }: { name: TabKey; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "today") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="4.5" />
        <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        <circle cx="12" cy="14.6" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "tasks") {
    return (
      <svg {...common}>
        <path d="M9 7h11M9 12h11M9 17h7" />
        <circle cx="4.6" cy="7" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="4.6" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="4.6" cy="17" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "capture") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20c.8-3.6 3.6-5.6 7.2-5.6s6.4 2 7.2 5.6" />
    </svg>
  );
}
