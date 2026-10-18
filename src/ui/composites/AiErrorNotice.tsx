"use client";

import { Button } from "@/ui/primitives";

/**
 * 错误提示 —— 只给人话，不吐 stack trace；技术细节折叠在"详情"里。
 * 这是"AI 幻觉关进笼子"的第四个闸：失败必须可见、可重试。
 */
export function AiErrorNotice({
  message,
  issues,
  onRetry,
  retryLabel = "重试",
}: {
  message: string;
  issues?: string[];
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-sm bg-danger-500/10 px-3 py-2.5 text-caption text-danger-400 ring-1 ring-inset ring-danger-500/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{message}</span>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry} className="h-8 px-3 text-micro">
            {retryLabel}
          </Button>
        ) : null}
      </div>
      {issues && issues.length > 0 ? (
        <details className="text-micro text-danger-400/80">
          <summary className="cursor-pointer select-none">详情（{issues.length} 条）</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5 font-mono text-[11px] leading-relaxed">
            {issues.slice(0, 8).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
