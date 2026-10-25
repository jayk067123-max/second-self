"use client";
import { useEffect, useRef, useState } from "react";
import { nextLoadingAnimation, type LoadingAnimation } from "@/shared/loadingAnimations";

export function PlanningLoading({ label, onCycleComplete }: { label: string; onCycleComplete?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onCycleComplete);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [animation, setAnimation] = useState<LoadingAnimation | null>(null);
  useEffect(() => { callback.current = onCycleComplete; }, [onCycleComplete]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setAnimation(nextLoadingAnimation()); });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!animation) return;
    frame.current?.scrollIntoView({ block: "center" });
    let completed = false;
    let animationFailed = false;
    let visibleWait = 0;
    function listen(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== "second-self:painting") return;
      if (event.data.type === "cycle-complete" && !completed && !animationFailed) { completed = true; callback.current?.(); }
      if (event.data.type === "error") { animationFailed = true; setFailed(true); }
    }
    window.addEventListener("message", listen);
    // A failed animation never pretends that its drawing cycle completed.
    const timer = setInterval(() => {
      if (!document.hidden && !completed && ++visibleWait >= 45) { animationFailed = true; setFailed(true); }
    }, 1000);
    return () => { clearInterval(timer); window.removeEventListener("message", listen); };
  }, [attempt, animation]);
  return <div className="planning-loading" aria-busy="true">
    {animation && <iframe ref={frame} key={animation.id + attempt} className="planning-orchard" title={animation.label + "逐笔绘画加载动画"}
      src={"/animations/" + animation.id + "/index.html?lng=en"} width="320" height="320" sandbox="allow-scripts" tabIndex={-1} aria-hidden="true"
      onError={() => setFailed(true)} />}
    <span className="planning-loading-label" role="status" aria-live="polite">{label}</span>
    {failed && <div role="alert"><p>动画加载失败，请重试</p><button type="button" className="btn btn-green" onClick={() => { setFailed(false); setAnimation(null); setAttempt(value => value + 1); }}>重试加载</button></div>}
  </div>;
}
