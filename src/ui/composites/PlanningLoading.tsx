"use client";

import { useEffect, useState } from "react";

export function PlanningLoading({ label }: { label: string }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(preference.matches); setPlaying(!preference.matches); };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return <div className="planning-loading">
    <iframe className="planning-orchard" title="果园逐笔绘画加载动画" src={"/animations/orchard/index.html?lng=en&motion=" + (playing ? "play" : "still")}
      width="320" height="320" sandbox="allow-scripts" tabIndex={-1} aria-hidden="true" />
    <span className="planning-loading-label" role="status" aria-live="polite" aria-atomic="true">{label}<span className="planning-loading-dots" aria-hidden="true"><i /><i /><i /></span></span>
    {reducedMotion && <button type="button" className="planning-motion-toggle" onClick={() => setPlaying(value => !value)}>{playing ? "暂停动画" : "播放动画"}</button>}
  </div>;
}
