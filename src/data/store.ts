"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TaskListSchema, TaskSchema, type Task, type TaskDraft } from "@/domain/schemas/task";
import { applyPlan, type ReplanPlan } from "@/domain/reflow";
import { formatTimetableSummary, type TimetablePlan } from "@/domain/schedule";
import { MS_MINUTE, addDaysToKey, dayKeyOf, isoWeekdayOf, msFromDayKey } from "@/domain/time";
import { DEMO_DAY_KEY } from "@/shared/constants";
import {
  buildExportEnvelope,
  createBrowserAdapter,
  exportFileName,
  isDemoSeed,
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
  /**
   * 演示时钟：`iso` 是当前"现在"，`source` 标明来源（seed = 种子自带 / system = 系统时间）。
   * 界面上必须把它显式标出来——素材里日期写死、内部用注入时钟，不标会让人以为算错了。
   */
  demoClock: { iso: string; source: "seed" | "system" };
  addDrafts: (drafts: TaskDraft[], source?: "text" | "manual") => { ok: boolean; error?: string; added?: number };
  /** P0-2 手动新增：比 addDrafts 多带 location / locked（用户权威字段） */
  addManualTask: (input: ManualTaskInput) => { ok: boolean; error?: string; id?: string };
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => { ok: boolean; error?: string };
  removeTask: (id: string) => void;
  toggleDone: (id: string) => void;
  applyPlanWithSnapshot: (plan: ReplanPlan) => { ok: boolean; error?: string };
  /**
   * 课表重传覆盖（P0-11 / 评审 WO-02）：把 `planTimetableCoverage` 算出的计划落到库里。
   * 关键约束：`updated` 走**原地 update**（保留 done/locked/needsReview/repeat），
   * 绝不「删掉再新增」——那会把用户勾过的完成状态和固定课标记一起重置。
   */
  applyTimetablePlan: (plan: TimetablePlan) => { ok: boolean; error?: string; summary?: string };
  undo: () => void;
  clearAll: () => void;
  dismissError: () => void;
  /** 导出：返回文件文本与建议文件名（下载动作留给 UI） */
  exportJson: () => { ok: boolean; text?: string; filename?: string; error?: string };
  /** 导入：校验通过后整体替换，并把替换前的数据存进快照以便撤销 */
  importJson: (text: string) => { ok: boolean; error?: string; imported?: number; demo?: boolean };
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
      // 初始 = 系统时间（来源如实标注）；导入带 demoNow 的种子后切到 seed 时钟
      demoClock: { iso: new Date().toISOString(), source: "system" as const },

      addDrafts: (drafts, source = "manual") => {
        // 铁律：needsReview=true 是"AI 自己说没把握"的条目，必须先过人工修正表
        const unconfirmed = drafts.filter((draft) => draft.needsReview === true).length;
        if (unconfirmed > 0) {
          const message = `还有 ${unconfirmed} 条待人工确认（表格里点「待确认」或改一下内容即可确认）`;
          set({ lastError: message });
          return { ok: false, error: message };
        }
        const built: Task[] = [];
        for (const draft of drafts) {
          const task: Task = {
            ...draft,
            id: newId(),
            source,
            done: false,
            // locked/flexible/location 只能来自本地规则或用户（AI 契约里没有这三项）；
            // 没给就一律 false/null，不替用户臆断"这是固定课"
            locked: draft.locked ?? false,
            flexible: draft.flexible ?? false,
            location: draft.location ?? null,
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

      applyTimetablePlan: (plan) => {
        const before = get().tasks;
        const byId = new Map(before.map((task) => [task.id, task]));
        // 演示周口径：把"周几"换算成本周的具体日期（第 1 周周一由 TERM_START 决定）
        const mondayKey = addDaysToKey(DEMO_DAY_KEY, 1 - isoWeekdayOf(msFromDayKey(DEMO_DAY_KEY, 0)));
        const removedIds = new Set<string>();
        const patched = new Map<string, Task>();
        const added: Task[] = [];

        for (const change of plan.changes) {
          if (change.kind === "unchanged") continue;

          if (change.kind === "removed") {
            const taskId = change.before?.taskId;
            if (taskId) removedIds.add(taskId);
            continue;
          }

          const block = change.after;
          if (!block) continue;

          if (change.kind === "updated") {
            const taskId = change.before?.taskId;
            const current = taskId ? byId.get(taskId) : undefined;
            if (!current) continue;
            // 原地 update：只改时段与地点，done / locked / needsReview / repeat 一律不动
            const currentStartMs = current.start ? Date.parse(current.start) : null;
            const dayKey =
              currentStartMs !== null && Number.isFinite(currentStartMs)
                ? dayKeyOf(currentStartMs)
                : addDaysToKey(mondayKey, block.weekday - 1);
            const startMs = msFromDayKey(dayKey, block.startMinute);
            patched.set(current.id, {
              ...current,
              start: new Date(startMs).toISOString(),
              end: new Date(startMs + block.durationMin * MS_MINUTE).toISOString(),
              durationMin: block.durationMin,
              location: block.location ?? current.location,
            });
            continue;
          }

          // added
          const dayKey = addDaysToKey(mondayKey, block.weekday - 1);
          const startMs = msFromDayKey(dayKey, block.startMinute);
          added.push({
            id: newId(),
            title: block.title,
            start: new Date(startMs).toISOString(),
            end: new Date(startMs + block.durationMin * MS_MINUTE).toISOString(),
            durationMin: block.durationMin,
            deadline: null,
            priority: 2,
            source: "manual",
            done: false,
            rawTextOrigin: null,
            location: block.location ?? null,
            locked: false,
            flexible: false,
            repeat: null,
            needsReview: false,
          });
        }

        const next: Task[] = [
          ...before
            .filter((task) => !removedIds.has(task.id))
            .map((task) => patched.get(task.id) ?? task),
          ...added,
        ];

        const parsed = TaskListSchema.safeParse(next);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "重传覆盖后数据不合法";
          set({ lastError: message });
          return { ok: false, error: message };
        }
        set({ tasks: parsed.data, snapshot: before, lastError: null });
        return { ok: true, summary: formatTimetableSummary(plan) };
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

        const isSeed = isDemoSeed(parsed);
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
          // 种子自带演示时钟（seed.demoNow）→ 导入后以它为准，标来源 seed；
          // 普通 JSON 不动时钟（保持当前来源），避免录制中途时钟跳变
          ...(isSeed && typeof (parsed as { demoNow?: unknown }).demoNow === "string"
            ? {
                demoClock: {
                  iso: (parsed as { demoNow: string }).demoNow,
                  source: "seed" as const,
                },
              }
            : {}),
          // 覆盖前留快照：导入也是一次"批量写"，必须可撤销
          snapshot: get().tasks,
          lastError: null,
        });
        return { ok: true, imported: migrated.value.tasks.length, demo: isSeed };
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
