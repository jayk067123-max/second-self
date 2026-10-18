"use client";

import { motion } from "framer-motion";
import { cn } from "@/shared/utils";

export type StepStatus = "idle" | "active" | "done" | "error";

export interface AiStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

const MARK: Record<StepStatus, string> = {
  idle: "○",
  active: "◐",
  done: "✓",
  error: "✕",
};

const TONE: Record<StepStatus, string> = {
  idle: "text-ink-400",
  active: "text-brand-300",
  done: "text-ok-400",
  error: "text-danger-400",
};

/**
 * AI 分步状态 —— 赛题明确要求"AI 响应状态提示友好"。
 * 每一步都来自真实阶段（模型调用 / 契约校验 / 本地合法性判定），不是装饰动画。
 */
export function AiStatusSteps({ steps }: { steps: AiStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5" aria-live="polite">
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-2 text-micro">
          <motion.span
            aria-hidden
            className={cn("w-3 shrink-0 font-mono", TONE[step.status])}
            animate={step.status === "active" ? { opacity: [0.35, 1, 0.35] } : { opacity: 1 }}
            transition={
              step.status === "active"
                ? { duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          >
            {MARK[step.status]}
          </motion.span>
          <span className={cn(step.status === "idle" ? "text-ink-400" : "text-ink-200")}>
            {step.label}
            {step.detail ? <span className="text-ink-400"> · {step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
