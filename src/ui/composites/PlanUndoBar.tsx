"use client";

import { useEffect, useState } from "react";
import { usePlannerStore } from "@/data/store";

/**
 * 方案落位后的撤销条 —— 只活 3 秒。
 *
 * 为什么要它：撤销按钮原来只在「我的」页，方案写回之后用户当场想撤回
 * 得先切页，多两下；录屏时也拍不到"改完还能撤"这件事。
 *
 * 触发口径（唯一）：store 的 snapshot 从「空」变成「有」——那正是
 * `applyPlanWithSnapshot` 写回成功的信号。勾选/删除不动 snapshot，不会误弹。
 * 撤销之后 snapshot 变回空，这条也跟着消失。
 *
 * 实现上守两条：状态只在"外部系统回调"里改（store.subscribe / setTimeout），
 * 不在 effect 体里同步 setState —— 否则 React 会连锁重渲染。
 */
const HOLD_MS = 3000;

export function PlanUndoBar() {
  const undo = usePlannerStore((s) => s.undo);
  const [planAt, setPlanAt] = useState<number | null>(null);
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);

  // 订阅外部 store：新快照出现 → 亮；快照被撤掉 → 立刻收
  useEffect(() => {
    const unsubscribe = usePlannerStore.subscribe((state, prev) => {
      if (state.snapshot && state.snapshot !== prev.snapshot) {
        setPlanAt(Date.now());
      } else if (!state.snapshot && prev.snapshot) {
        setPlanAt(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (planAt === null) return;
    const timer = window.setTimeout(() => setHiddenAt(planAt), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [planAt]);

  const visible = planAt !== null && hiddenAt !== planAt;
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 flex justify-center px-4 lg:bottom-6"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-pill bg-ink-50 px-4 py-2 text-micro text-ink-950 shadow-pop">
        <span>已更新</span>
        <button
          type="button"
          onClick={undo}
          className="font-semibold underline underline-offset-2 hover:text-brand-400"
        >
          撤销
        </button>
      </div>
    </div>
  );
}
