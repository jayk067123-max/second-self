"use client";

import { useEffect, useId, useRef } from "react";

type Stroke = { d: string; color: string; width: number; weight?: number; branch?: boolean };
// Every path is one brush movement, revealed in strict order on a shared timeline.
const STROKES: Stroke[] = [
  { d: "M38 103Q92 83 140 101T279 101", color: "#dce5bf", width: 16, weight: 2 },
  { d: "M43 115Q95 103 145 113T275 112", color: "#c8d8a7", width: 11, weight: 1.6 },
  { d: "M246 27a11 11 0 1 1-.1 0", color: "#ecd57b", width: 9, weight: 1.5 },
  { d: "M91 111Q94 82 88 43", color: "#6e8561", width: 3.5, weight: 1.4, branch: true },
  { d: "M92 87Q76 76 67 60", color: "#6e8561", width: 2.5, branch: true },
  { d: "M91 77Q107 66 114 48", color: "#6e8561", width: 2.5, branch: true },
  { d: "M58 63Q62 42 76 43", color: "#b8cd8e", width: 14, weight: 1.3 },
  { d: "M74 38Q89 26 103 39", color: "#c6d9a0", width: 15, weight: 1.3 },
  { d: "M103 42Q120 39 126 57", color: "#a8c383", width: 13 },
  { d: "M61 68Q78 57 94 58", color: "#a6c17f", width: 15, weight: 1.2 },
  { d: "M92 62Q111 53 124 66", color: "#afc88a", width: 14 },
  { d: "M66 76Q82 84 96 73", color: "#93b372", width: 12 },
  { d: "M96 76Q111 83 120 74", color: "#86a768", width: 10 },
  { d: "M193 114Q190 89 194 56", color: "#6e8561", width: 3, weight: 1.2, branch: true },
  { d: "M192 92Q180 81 174 69", color: "#6e8561", width: 2, branch: true },
  { d: "M192 82Q207 72 212 60", color: "#6e8561", width: 2, branch: true },
  { d: "M166 72Q166 56 180 55", color: "#bed398", width: 13 },
  { d: "M181 50Q194 40 207 52", color: "#cfddac", width: 14 },
  { d: "M208 57Q222 55 224 71", color: "#b3cb8b", width: 12 },
  { d: "M169 77Q184 67 199 73", color: "#abc584", width: 14 },
  { d: "M185 84Q204 91 219 80", color: "#9dbb78", width: 12 },
  { d: "M72 47l1 1", color: "#e9bdb0", width: 5, weight: .35 },
  { d: "M99 39l1 1", color: "#e9bdb0", width: 6, weight: .35 },
  { d: "M114 61l1 1", color: "#f0cabc", width: 5, weight: .35 },
  { d: "M78 70l1 1", color: "#efd0bc", width: 4, weight: .35 },
  { d: "M181 65l1 1", color: "#e9bdb0", width: 5, weight: .35 },
  { d: "M209 74l1 1", color: "#efc8b7", width: 5, weight: .35 },
  { d: "M134 76v23", color: "#fdfbf4", width: 15, weight: .6 },
  { d: "M146 76v23", color: "#fdfbf4", width: 15, weight: .6 },
  { d: "M157 76v23", color: "#fdfbf4", width: 15, weight: .6 },
  { d: "M134 66h23q8 0 8 8v27q0 8-8 8h-23q-8 0-8-8V74q0-8 8-8Z", color: "#9eb781", width: 1.8, weight: 2 },
  { d: "M128 78h35", color: "#c8d8a7", width: 1.5, weight: .7 },
  { d: "M136 62v8", color: "#78965f", width: 3, weight: .4 },
  { d: "M154 62v8", color: "#78965f", width: 3, weight: .4 },
  { d: "M135 92l6 6 13-14", color: "#6b9350", width: 3, weight: 1.2 },
  { d: "M53 114l-2-7m3 7 4-5", color: "#89a66d", width: 2, weight: .5 },
  { d: "M218 118l3-9m-1 9 7-4", color: "#89a66d", width: 2, weight: .5 },
  { d: "M112 122l-2-6m2 6 5-4", color: "#89a66d", width: 2, weight: .5 },
];
const TOTAL_WEIGHT = STROKES.reduce((sum, stroke) => sum + (stroke.weight ?? 1), 0);
const CYCLE_MS = 6200;

export function PlanningLoading({ label }: { label: string }) {
  const paperId = useId();
  const drawing = useRef<SVGGElement>(null);
  useEffect(() => {
    const strokes = Array.from(drawing.current?.querySelectorAll<SVGGElement>(".orchard-stroke") ?? []);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [];
    const play = () => {
      animations.forEach(animation => animation.cancel());
      animations = [];
      let cursor = 0;
      strokes.forEach((element, index) => {
        const stroke = STROKES[index];
        if (!stroke) return;
        element.style.strokeDashoffset = preference.matches ? "0" : "1";
        element.style.opacity = preference.matches ? "1" : "0";
        if (preference.matches) return;
        const start = .02 + cursor / TOTAL_WEIGHT * .78;
        cursor += stroke.weight ?? 1;
        const end = .02 + cursor / TOTAL_WEIGHT * .78;
        animations.push(element.animate([
          { strokeDashoffset: "1", opacity: 0, offset: 0 },
          { strokeDashoffset: "1", opacity: 0, offset: start },
          { strokeDashoffset: "1", opacity: 1, offset: start + .0001 },
          { strokeDashoffset: "0", opacity: 1, offset: end },
          { strokeDashoffset: "0", opacity: 1, offset: .94 },
          { strokeDashoffset: "0", opacity: 0, offset: 1 },
        ], { duration: CYCLE_MS, iterations: Infinity, easing: "linear" }));
      });
      if (animations.length) {
        const origin = document.timeline.currentTime;
        animations.forEach(animation => { animation.startTime = origin; });
      }
    };
    play();
    preference.addEventListener("change", play);
    return () => { preference.removeEventListener("change", play); animations.forEach(animation => animation.cancel()); };
  }, []);

  return <div className="planning-loading" role="status" aria-live="polite" aria-atomic="true">
    <svg className="planning-orchard" viewBox="0 0 320 140" width="320" height="140" aria-hidden="true" focusable="false">
      <defs><filter id={paperId} x="-10%" y="-15%" width="120%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="2" seed="8" result="grain" /><feDisplacementMap in="SourceGraphic" in2="grain" scale="1.2" xChannelSelector="R" yChannelSelector="G" /></filter></defs>
      <g ref={drawing} filter={"url(#" + paperId + ")"} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {STROKES.map((stroke, index) => <g key={index} className={"orchard-stroke" + (stroke.branch ? " orchard-branch" : "")} data-stroke={index} stroke={stroke.color}>
          <path d={stroke.d} pathLength={1} strokeWidth={stroke.width * 1.3} opacity={.2} />
          <path d={stroke.d} pathLength={1} strokeWidth={stroke.width} opacity={.85} />
        </g>)}
      </g>
    </svg>
    <span className="planning-loading-label">{label}<span className="planning-loading-dots" aria-hidden="true"><i /><i /><i /></span></span>
  </div>;
}
