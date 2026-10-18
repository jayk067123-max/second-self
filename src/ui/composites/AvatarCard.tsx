"use client";

import { motion } from "framer-motion";
import { AVATAR_STATE_LABEL, type AvatarSummary, type AvatarState } from "@/domain/avatar";
import { formatDuration } from "@/domain/time";
import { Badge, Card, CardText, CardTitle } from "@/ui/primitives";

/**
 * 数字分身 —— 极简几何 SVG，不做 3D、不做人物立绘。
 * 状态完全由 domain 的纯函数（computeAvatarSummary）决定，这里只负责"照着画"。
 */

/**
 * 三态视觉规范（映像官定的图，别自己另设计）：
 *   满血  = 外圈满 + 蓝色 + 强光晕
 *   疲惫  = 环降饱和 + 核心缩小 14% + 光晕减弱   （"没做完"）
 *   超载  = 环保持满但转警示红 + 核心裂纹        （"做满了但排不下"）
 * 两态必须一眼分开，不能只靠文字标签。
 */
const PALETTE: Record<AvatarState, { ring: string; body: string; stroke: string; dot: string }> = {
  // 满血用品牌蓝（不是薄荷绿），与落地页主色一致
  energized: { ring: "#5b8cff", body: "rgba(91,140,255,0.12)", stroke: "#5b8cff", dot: "#5b8cff" },
  // 疲惫：环降饱和（去掉彩度，偏灰）
  tired: { ring: "#6b7f9e", body: "rgba(107,127,158,0.10)", stroke: "#93a5bf", dot: "#93a5bf" },
  // 超载：满圈警示红
  overloaded: { ring: "#ff7a85", body: "rgba(255,122,133,0.12)", stroke: "#ff7a85", dot: "#ff7a85" },
};

/** 光晕强度：满血最强、疲惫明显减弱、超载红晕 */
const GLOW: Record<AvatarState, string> = {
  energized: "drop-shadow(0 0 10px rgba(91,140,255,0.75))",
  tired: "drop-shadow(0 0 3px rgba(107,127,158,0.35))",
  overloaded: "drop-shadow(0 0 9px rgba(255,122,133,0.7))",
};

/** 核心缩放：疲惫态比满血小 14%，这是"没做完"的体感线索 */
const CORE_SCALE: Record<AvatarState, number> = {
  energized: 1,
  tired: 0.86,
  overloaded: 1,
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
  // 环的"满格"口径：满血与超载都画满（超载是"排满了"），疲惫按真实完成度留缺口
  const ringProgress = summary.state === "tired" ? Math.min(1, Math.max(0, summary.progress)) : 1;
  const offset = CIRCUMFERENCE * (1 - ringProgress);

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
          <svg viewBox="0 0 120 120" className="absolute size-28" aria-hidden style={{ filter: GLOW[summary.state] }}>
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
            style={{ scale: CORE_SCALE[summary.state] }}
            animate={{ scale: [CORE_SCALE[summary.state], CORE_SCALE[summary.state] * breath.scale, CORE_SCALE[summary.state]] }}
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
                  {/* 核心裂纹：超载态专属，"做满了但排不下"的视觉锚点 */}
                  <path
                    d="M14 14 L20 22 L16 26 L24 32"
                    stroke={palette.stroke}
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                  <path
                    d="M50 46 L44 40 L47 35"
                    stroke={palette.stroke}
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
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
