"use client";

import { Button, Card, CardText, CardTitle } from "@/ui/primitives";

/**
 * AI 失败卡 —— ARCHITECTURE §3 第四道闸的可视化证据。
 *
 * 三件事必须同时出现，缺一条就等于"静默吞错"：
 *   1. 原始输出（模型到底吐了什么，原样给人看）
 *   2. 失败字段（哪几个字段没过契约）
 *   3. 三种出路（一键重试 / 手工修正 / 退回编辑）
 *
 * 这张卡给视频特写用，措辞保持克制、不吓人。
 */
export function AiFailureCard({
  title = "暂时没有完成",
  message,
  issues,
  rawOutput,
  onRetry,
  onManualFix,
  onBack,
  busy = false,
}: {
  title?: string;
  message: string;
  issues: string[];
  rawOutput?: string;
  onRetry: () => void;
  onManualFix?: () => void;
  onBack: () => void;
  busy?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 ring-1 ring-inset ring-danger-500/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-danger-400">{title}</CardTitle>
          <CardText className="mt-1">{message}</CardText>
        </div>
        <span className="rounded-pill bg-danger-500/15 px-2 py-0.5 text-micro text-danger-400">
          未保存
        </span>
      </div>

      {issues.length > 0 ? (
        <div>
          <p className="mb-1 text-micro font-medium text-ink-300">失败字段（{issues.length}）</p>
          <ul className="flex flex-col gap-0.5 rounded-sm bg-ink-950/60 px-2 py-1.5 font-mono text-[11px] text-danger-400">
            {issues.slice(0, 8).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rawOutput ? (
        <details className="rounded-sm bg-ink-950/60 px-2 py-1.5">
          <summary className="cursor-pointer select-none text-micro text-ink-300">
            原始输出（模型原样返回，已截断）
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink-200">
            {rawOutput.slice(0, 2000)}
          </pre>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRetry} disabled={busy} className="h-8 px-3 text-micro">
          一键重试
        </Button>
        {onManualFix ? (
          <Button variant="secondary" onClick={onManualFix} className="h-8 px-3 text-micro">
            手工修正
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onBack} className="h-8 px-3 text-micro">
          退回编辑
        </Button>
      </div>


    </Card>
  );
}
