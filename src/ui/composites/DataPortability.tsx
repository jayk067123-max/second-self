"use client";

import { useRef, useState } from "react";
import { usePlannerStore } from "@/data/store";
import { Button } from "@/ui/primitives";

/**
 * 数据可携带性 —— 「数据不出本机」这个卖点的可操作证明：
 * 一键导出单文件 JSON，换台机器/换浏览器导入回来，任务与撤销快照都在。
 */
export function DataPortability() {
  const exportJson = usePlannerStore((s) => s.exportJson);
  const importJson = usePlannerStore((s) => s.importJson);
  const taskCount = usePlannerStore((s) => s.tasks.length);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const result = exportJson();
    if (!result.ok || !result.text) {
      setMsg({ tone: "err", text: result.error ?? "导出失败" });
      return;
    }
    const blob = new Blob([result.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename ?? "vibe-planner.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMsg({ tone: "ok", text: `已导出 ${taskCount} 条任务（.json）` });
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("文件超过 5 MB");
      if (!window.confirm("导入会替换当前全部任务，可撤销。是否继续？")) return;
      const text = await file.text();
      const result = importJson(text);
      setMsg(
        result.ok
          ? {
              tone: "ok",
              text: result.demo
                ? `已导入 ${result.imported} 条任务（演示数据），可用「撤销上次写回」退回`
                : `已导入 ${result.imported} 条任务，可用「撤销上次写回」退回`,
            }
          : { tone: "err", text: result.error ?? "导入失败" },
      );
    } catch {
      setMsg({ tone: "err", text: "读取文件失败" });
    } finally {
      // 允许重复选择同一个文件
      event.target.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        className="h-8 px-3 text-micro"
        onClick={handleExport}
        disabled={taskCount === 0}
        title="导出为本机 JSON 文件"
      >
        导出 JSON
      </Button>
      <Button variant="ghost" className="h-8 px-3 text-micro" onClick={() => fileRef.current?.click()}>
        导入 JSON
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void handleFile(e)}
        aria-label="选择要导入的 JSON 文件"
      />
      {msg ? (
        <span
          role="status"
          className={msg.tone === "ok" ? "text-micro text-ok-400" : "text-micro text-danger-400"}
        >
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
