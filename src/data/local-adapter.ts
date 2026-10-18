import type { StateStorage } from "zustand/middleware";

/**
 * localStorage 实现 —— 上层（store）只认 StateStorage 接口。
 * 换 IndexedDB / Tauri fs / Electron store 时只替换本文件，store 一行不改。
 */

export interface KeyValueStore {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

export interface PlannerStorageAdapter extends StateStorage {
  readonly kind: "local" | "memory";
  /** 存储是否可用（隐私模式 / 配额满 / SSR 时为 false，UI 可以据此提示） */
  readonly available: boolean;
}

/** 内存实现：SSR 与单测用；也让"localStorage 被禁用"时能优雅降级 */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}

/**
 * 适配器工厂。
 * @param resolve 延迟取 kv：SSR 阶段没有 localStorage，不能在模块加载时直接访问
 */
export function createPlannerAdapter(
  resolve: () => KeyValueStore | null,
): PlannerStorageAdapter {
  let lastError: string | null = null;

  const adapter: PlannerStorageAdapter = {
    kind: "local",
    get available() {
      return resolve() !== null && lastError === null;
    },
    getItem: (name) => {
      const kv = resolve();
      if (!kv) return null;
      try {
        return kv.getItem(name);
      } catch {
        lastError = "读取本地存储失败（可能是浏览器隐私模式）";
        return null;
      }
    },
    setItem: (name, value) => {
      const kv = resolve();
      if (!kv) return;
      try {
        kv.setItem(name, value);
        lastError = null;
      } catch (error) {
        // 配额满是最常见的失败：不能让页面崩，只标记不可用
        lastError =
          error instanceof Error && error.name === "QuotaExceededError"
            ? "本地存储已满，旧数据可能没保存成功"
            : "写入本地存储失败";
      }
    },
    removeItem: (name) => {
      const kv = resolve();
      if (!kv) return;
      try {
        kv.removeItem(name);
      } catch {
        lastError = "清空本地存储失败";
      }
    },
  };

  return adapter;
}

/** 浏览器环境适配器（SSR 时自动退化为不可用） */
export function createBrowserAdapter(): PlannerStorageAdapter {
  return createPlannerAdapter(() =>
    typeof window !== "undefined" && window.localStorage ? window.localStorage : null,
  );
}

/** 内存适配器（SSR / 测试） */
export function createInMemoryAdapter(): PlannerStorageAdapter {
  const store = createMemoryStore();
  return { ...createPlannerAdapter(() => store), kind: "memory" };
}
