"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import { TaskListSchema, TaskSchema, type Task, type TaskDraft } from "@/domain/schemas/task";
import { applyPlan, type ReplanPlan } from "@/domain/planner";

/**
 * 客户端状态层（store）—— 只依赖 domain，不碰数据访问层与 AI 层。
 *
 * 两条硬规则：
 * 1. 任何写入都先过 zod（写入前校验，失败即拒绝并给出可读原因）
 * 2. 从 localStorage 读回来的数据同样过 zod（读取也不信任）
 */

interface PlannerState {
  tasks: Task[];
  /** 写回前的快照，用于撤销 */
  snapshot: Task[] | null;
  lastError: string | null;
  addDrafts: (drafts: TaskDraft[], source?: "text" | "manual") => { ok: boolean; error?: string; added?: number };
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => { ok: boolean; error?: string };
  removeTask: (id: string) => void;
  toggleDone: (id: string) => void;
  applyPlanWithSnapshot: (plan: ReplanPlan) => { ok: boolean; error?: string };
  undo: () => void;
  clearAll: () => void;
  dismissError: () => void;
}

const PersistedSchema = z.object({
  tasks: TaskListSchema,
  snapshot: z.array(TaskSchema).nullable(),
});

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
      tasks: [],
      snapshot: null,
      lastError: null,

      addDrafts: (drafts, source = "manual") => {
        const built: Task[] = [];
        for (const draft of drafts) {
          const task: Task = {
            ...draft,
            id: newId(),
            source,
            done: false,
          };
          const parsed = TaskSchema.safeParse(task);
          if (!parsed.success) {
            const message = parsed.error.issues[0]?.message ?? "字段不合法";
            set({ lastError: `「${draft.title}」未通过校验：${message}` });
            return { ok: false, error: message };
          }
          built.push(parsed.data);
        }
        if (built.length === 0) return { ok: false, error: "没有可加入的任务" };
        set({ tasks: [...get().tasks, ...built], lastError: null });
        return { ok: true, added: built.length };
      },

      updateTask: (id, patch) => {
        const current = get().tasks.find((t) => t.id === id);
        if (!current) return { ok: false, error: "任务不存在" };
        const parsed = TaskSchema.safeParse({ ...current, ...patch, id });
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "字段不合法";
          set({ lastError: message });
          return { ok: false, error: message };
        }
        set({
          tasks: get().tasks.map((t) => (t.id === id ? parsed.data : t)),
          lastError: null,
        });
        return { ok: true };
      },

      removeTask: (id) => {
        set({ tasks: get().tasks.filter((t) => t.id !== id) });
      },

      toggleDone: (id) => {
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        });
      },

      applyPlanWithSnapshot: (plan) => {
        const before = get().tasks;
        const next = applyPlan(before, plan);
        const parsed = TaskListSchema.safeParse(next);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "方案写回后不合法";
          set({ lastError: message });
          return { ok: false, error: message };
        }
        set({ tasks: parsed.data, snapshot: before, lastError: null });
        return { ok: true };
      },

      undo: () => {
        const snapshot = get().snapshot;
        if (!snapshot) return;
        set({ tasks: snapshot, snapshot: null });
      },

      clearAll: () => set({ tasks: [], snapshot: null, lastError: null }),
      dismissError: () => set({ lastError: null }),
    }),
    {
      name: "vibe-coding-2026/planner",
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      skipHydration: true,
      partialize: (state) => ({ tasks: state.tasks, snapshot: state.snapshot }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, tasks: parsed.data.tasks, snapshot: parsed.data.snapshot };
      },
    },
  ),
);

/**
 * 显式水合钩子：store 用 skipHydration，避免 SSR 与 localStorage 内容不一致导致的
 * hydration mismatch；页面在 ready 之前渲染骨架。
 */
export function usePlannerHydration(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = usePlannerStore.persist.onFinishHydration(() => {
      if (!cancelled) setReady(true);
    });
    if (usePlannerStore.persist.hasHydrated()) {
      // 已同步完成时不阻塞首帧，用微任务切一次，避免在 effect 内同步 setState
      void Promise.resolve().then(() => {
        if (!cancelled) setReady(true);
      });
    } else {
      void usePlannerStore.persist.rehydrate();
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return ready;
}
