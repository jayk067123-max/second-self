"use client";

import type { AvatarSummary } from "@/domain/avatar";
import type { Task } from "@/domain/schemas/task";
import { Button } from "@/ui/primitives";
import { AvatarCard } from "./AvatarCard";
import { DataPortability } from "./DataPortability";

/**
 * 「我的」页 —— 分身、数据、撤销。
 * 这一页没有时间信息，也没有录入：它回答"我现在的状态"和"我的数据在哪"。
 */
export function TabMe({
  avatar,
  hasSnapshot,
  undo,
  clearAll,
  tasks,
}: {
  avatar: AvatarSummary;
  hasSnapshot: boolean;
  undo: () => void;
  clearAll: () => void;
  tasks: Task[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <AvatarCard summary={avatar} />

      <section className="flex flex-col gap-3 rounded-card bg-ink-900 p-5 shadow-card">
        <div>
          <h2 className="text-section font-semibold text-ink-50">数据</h2>
          <p className="mt-1 text-caption text-ink-300">
            全部存在这台设备的浏览器里，不上传服务器。换设备靠导出 JSON。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={undo} disabled={!hasSnapshot}>
            撤销上次写回
          </Button>
          <DataPortability />
        </div>

        <Button
          variant="ghost"
          className="w-fit px-3 text-micro text-ink-400 hover:text-danger-400"
          disabled={tasks.length === 0}
          onClick={() => {
            if (tasks.length === 0) return;
            if (window.confirm("清空本地全部任务？该操作不可撤销。")) clearAll();
          }}
        >
          清空全部任务
        </Button>
      </section>

      <p className="px-1 text-micro leading-relaxed text-ink-400">
        数据只存在本机浏览器；模型调用仅发送你粘进来的文本与图片。版本 v0.1.0。
      </p>
    </div>
  );
}
