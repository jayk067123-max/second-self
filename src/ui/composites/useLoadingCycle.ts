"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useLoadingCycle() {
  const pending = useRef<((completed: boolean) => void) | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const cancel = useCallback(() => { pending.current?.(false); pending.current = null; }, []);
  const complete = useCallback(() => { pending.current?.(true); pending.current = null; }, []);
  const start = useCallback(() => {
    cancel();
    setAnimationKey(key => key + 1);
    return new Promise<boolean>(resolve => { pending.current = resolve; });
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { animationKey, start, complete, cancel };
}
