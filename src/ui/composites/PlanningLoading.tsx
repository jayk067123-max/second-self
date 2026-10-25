"use client";
import { useEffect, useRef, useState } from "react";

export function PlanningLoading({ label, onCycleComplete }: { label: string; onCycleComplete?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onCycleComplete);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callback.current = onCycleComplete; }, [onCycleComplete]);
  useEffect(() => {
    frame.current?.scrollIntoView({ block: "center" });
    let completed = false;
    let visibleWait = 0;
    function listen(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== "second-self:orchard") return;
      if (event.data.type === "cycle-complete") { completed = true; callback.current?.(); }
      if (event.data.type === "error") setFailed(true);
    }
    window.addEventListener("message", listen);
    // A failed animation never pretends that its drawing cycle completed.
    const timer = setInterval(() => {
      if (!document.hidden && !completed && ++visibleWait >= 45) setFailed(true);
    }, 1000);
    return () => { clearInterval(timer); window.removeEventListener("message", listen); };
  }, [attempt]);
  return <div className="planning-loading" aria-busy="true">
    <iframe ref={frame} key={attempt} className="planning-orchard" title="果园逐笔绘画加载动画"
      src="/animations/orchard/index.html?lng=en" width="320" height="320" sandbox="allow-scripts" tabIndex={-1} aria-hidden="true"
      onError={() => setFailed(true)} />
    <span className="planning-loading-label" role="status" aria-live="polite">{label}</span>
    {failed && <div role="alert"><p>动画加载失败，请重试</p><button type="button" className="btn btn-green" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试加载</button></div>}
  </div>;
}
