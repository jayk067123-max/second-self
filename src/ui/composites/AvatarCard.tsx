"use client";

import { motion } from "framer-motion";
import { AVATAR_STATE_LABEL, type AvatarSummary, type AvatarState } from "@/domain/avatar";
import { formatDuration } from "@/domain/time";
import { Badge, Card, CardText, CardTitle } from "@/ui/primitives";

/**
 * 数字分身 —— 极简几何 SVG，不做 3D、不做人物立绘。
 * 状态完全由 domain 的纯函数（computeAvatarSummary）决定，这里只负责"照着画"。
 */

const PALETTE: Record<AvatarState, { ring: string; body: string; stroke: string; dot: string }> = {
  energized: { ring: "#4fe3c1", body: "rgba(79,227,193,0.12)", stroke: "#4fe3c1", dot: "#4fe3c1" },
  tired: { ring: "#ffcc66", body: "rgba(255,204,102,0.10)", stroke: "#ffcc66", dot: "#ffcc66" },
  overloaded: { ring: "#ff7a85", body: "rgba(255,122,133,0.12)", stroke: "#ff7a85", dot: "#ff7a85" },
};

const BREATH: Record<AvatarState, { duration: number; scale: number }> = {
  energized: { duration: 3.6, scale: 1.05 },
  tired: { duration: 6, scale: 1.02 },
  overloaded: { duration: 1.6, scale: 1.07 },
};

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AvatarCard({ summary }: { summary: AvatarSummary }) {
  const palette = PALETTE[summary.state];
  const breath = BREATH[summary.state];
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, summary.progress)));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>第二自我</CardTitle>
          <CardText className="mt-1">状态由完成度与当日负载驱动，会自己变</CardText>
        </div>
        <Badge tone={summary.state === "energized" ? "ok" : summary.state === "tired" ? "warn" : "danger"}>
          {AVATAR_STATE_LABEL[summary.state]}
        </Badge>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative grid size-28 shrink-0 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute size-28" aria-hidden>
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#1b2740" strokeWidth="7" />
            <motion.circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={palette.ring}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              transform="rotate(-90 60 60)"
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>

          <motion.div
            animate={{ scale: [1, breath.scale, 1] }}
            transition={{ duration: breath.duration, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            <svg viewBox="0 0 64 64" className="size-16" role="img" aria-label={`分身状态：${AVATAR_STATE_LABEL[summary.state]}`}>
              <rect
                x="8"
                y="8"
                width="48"
                height="48"
                rx="16"
                fill={palette.body}
                stroke={palette.stroke}
                strokeWidth="2"
              />
              {summary.state === "energized" ? (
                <>
                  <circle cx="25" cy="28" r="3" fill={palette.stroke} />
                  <circle cx="39" cy="28" r="3" fill={palette.stroke} />
                  <path d="M24 40 Q32 46 40 40" stroke={palette.stroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              ) : null}
              {summary.state === "tired" ? (
                <>
                  <path d="M22 28 Q25 26 28 28" stroke={palette.stroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M36 28 Q39 26 42 28" stroke={palette.stroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M26 41 L38 41" stroke={palette.stroke} strokeWidth="2.5" strokeLinecap="round" />
                </>
              ) : null}
              {summary.state === "overloaded" ? (
                <>
                  <path d="M22 25 L28 31 M28 25 L22 31" stroke={palette.stroke} strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M36 25 L42 31 M42 25 L36 31" stroke={palette.stroke} strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M25 42 Q32 37 39 42" stroke={palette.stroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              ) : null}
            </svg>
          </motion.div>

          <span className="absolute -bottom-1 font-mono text-micro text-ink-300">
            {Math.round(summary.progress * 100)}%
          </span>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-micro">
          <div>
            <dt className="text-ink-400">已完成</dt>
            <dd className="font-mono text-ink-100">
              {summary.doneCount}/{summary.totalCount}
            </dd>
          </div>
          <div>
            <dt className="text-ink-400">剩余待办</dt>
            <dd className="font-mono text-ink-100">{summary.pendingCount}</dd>
          </div>
          <div>
            <dt className="text-ink-400">已排负载</dt>
            <dd className="font-mono text-ink-100">{formatDuration(summary.loadMin)}</dd>
          </div>
          <div>
            <dt className="text-ink-400">当日上限</dt>
            <dd className="font-mono text-ink-100">{formatDuration(summary.limitMin)}</dd>
          </div>
        </dl>
      </div>

      <div
        className="rounded-sm px-3 py-2 text-caption leading-relaxed"
        style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "#dbe4f0" }}
      >
        <span className="mr-1 font-mono text-micro" style={{ color: palette.dot }}>
          播报
        </span>
        {summary.broadcast}
      </div>
    </Card>
  );
}
