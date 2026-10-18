"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TaskListSchema, TaskSchema, type Task, type TaskDraft } from "@/domain/schemas/task";
import { applyPlan, type ReplanPlan } from "@/domain/planner";
import {
  buildExportEnvelope,
  createBrowserAdapter,
  exportFileName,
  migrateImportedPayload,
  migrateStoredPayload,
  serializeExport,
} from "@/data";

/**
 * 客户端状态层（store）—— 依赖 domain（契约与纯函数）与 data（持久化适配层），
 * 不碰 AI 层、不发起任何网络请求。
 *
 * 三条硬规则：
 * 1. 任何写入都先过 zod（写入前校验，失败即拒绝并给出可读原因）
 * 2. 从 localStorage 读回来的数据先走 data/migrate（版本迁移 + zod），脏数据回落空状态
 * 3. 导入导出都经过同一个信封契约，不认"随便一个 JSON"
 */

interface PlannerState {
  tasks: Task[];
  /** 写回前的快照，用于撤销 */
  snapshot: Task[] | null;
  lastError: string | null;
  addDrafts: (drafts: TaskDraft[], source?: "text" | "manual") => { ok: boolean; error?: string; added?: number };
  /** P0-2 手动新增：比 addDrafts 多带 location / locked（用户权威字段） */
  addManualTask: (input: ManualTaskInput) => { ok: boolean; error?: string; id?: string };
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => { ok: boolean; error?: string };
  removeTask: (id: string) => void;
  toggleDone: (id: string) => void;
  applyPlanWithSnapshot: (plan: ReplanPlan) => { ok: boolean; error?: string };
  undo: () => void;
  clearAll: () => void;
  dismissError: () => void;
  /** 导出：返回文件文本与建议文件名（下载动作留给 UI） */
  exportJson: () => { ok: boolean; text?: string; filename?: string; error?: string };
  /** 导入：校验通过后整体替换，并把替换前的数据存进快照以便撤销 */
  importJson: (text: string) => { ok: boolean; error?: string; imported?: number };
}

const browserAdapter = createBrowserAdapter();

/** 手动新增的输入：不含 id / source / done，由 store 补齐 */
export interface ManualTaskInput {
  title: string;
  start: string | null;
  end: string | null;
  durationMin: number;
  deadline: string | null;
  priority: 1 | 2 | 3;
  location: string | null;
  /** 用户钉死的固定课（重排不许移动） */
  locked: boolean;
}

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
            // locked 是"用户权威标记"，解析结果一律 false，只有用户能钉死
            locked: false,
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

      addManualTask: (input) => {
        const id = newId();
        const parsed = TaskSchema.safeParse({
          id,
          title: input.title,
          start: input.start,
          end: input.end,
          durationMin: input.durationMin,
          deadline: input.deadline,
          priority: input.priority,
          source: "manual",
          done: false,
          rawTextOrigin: null,
          location: input.location,
          locked: input.locked,
          repeat: null,
          needsReview: false,
        });
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "字段不合法";
          set({ lastError: `手动新增失败：${message}` });
          return { ok: false, error: message };
        }
        set({ tasks: [...get().tasks, parsed.data], lastError: null });
        return { ok: true, id };
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

      exportJson: () => {
        const { tasks, snapshot } = get();
        try {
          const now = new Date();
          const envelope = buildExportEnvelope({ tasks, snapshot }, now);
          return { ok: true, text: serializeExport(envelope), filename: exportFileName(now) };
        } catch {
          return { ok: false, error: "生成导出文件失败" };
        }
      },

      importJson: (text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          const message = "导入失败：文件不是合法 JSON";
          set({ lastError: message });
          return { ok: false, error: message };
        }

        const migrated = migrateImportedPayload(parsed);
        if (!migrated.ok) {
          set({ lastError: `导入失败：${migrated.error}` });
          return { ok: false, error: migrated.error };
        }
        if (migrated.value.tasks.length === 0) {
          const message = "导入失败：文件里没有任何任务";
          set({ lastError: message });
          return { ok: false, error: message };
        }

        set({
          tasks: migrated.value.tasks,
          // 覆盖前留快照：导入也是一次"批量写"，必须可撤销
          snapshot: get().tasks,
          lastError: null,
        });
        return { ok: true, imported: migrated.value.tasks.length };
      },
    }),
    {
      name: "vibe-coding-2026/planner",
      version: 2,
      storage: createJSONStorage(() => browserAdapter),
      skipHydration: true,
      partialize: (state) => ({ tasks: state.tasks, snapshot: state.snapshot }),
      merge: (persisted, current) => {
        const migrated = migrateStoredPayload(persisted);
        if (!migrated.ok) return current;
        return { ...current, tasks: migrated.value.tasks, snapshot: migrated.value.snapshot };
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
