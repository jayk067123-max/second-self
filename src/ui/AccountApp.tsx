"use client";
import { useEffect, useRef, useState } from "react";
import type { AccountSnapshot } from "@/domain/account";
import { AccountSync, type SyncStatus } from "@/data/account-sync";
import { FinalPlanner } from "./FinalPlanner";
import { AuthScreen } from "./AuthScreen";
import { AccountContext } from "./AccountContext";
import { PlanningLoading } from "./composites/PlanningLoading";
import { useLoadingCycle } from "./composites/useLoadingCycle";

export function AccountApp() {
  const [phase, setPhase] = useState<"checking" | "auth" | "ready" | "logout" | "error">("checking");
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [sync, setSync] = useState<AccountSync | null>(null);
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [message, setMessage] = useState("");
  const [initialAnimation, setInitialAnimation] = useState(false);
  const [initialChecked, setInitialChecked] = useState(false);
  const initialResult = useRef<AccountSnapshot | null>(null);
  const initialError = useRef("");
  const controller = useRef<AccountSync | null>(null);
  const cycle = useLoadingCycle();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/session", { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "无法连接账号服务");
      if (!cancelled) { initialResult.current = data.snapshot; setInitialChecked(true); }
    }).catch(error => { if (!cancelled) { initialError.current = error instanceof Error ? error.message : "无法连接账号服务"; setInitialChecked(true); } });
    return () => { cancelled = true; controller.current?.stop(); };
  }, []);
  useEffect(() => {
    if (!initialAnimation || !initialChecked) return;
    let cancelled = false;
    async function restore() {
      if (initialError.current) { setMessage(initialError.current); setPhase("error"); return; }
      if (!initialResult.current) { setPhase("auth"); return; }
      const next = new AccountSync(initialResult.current); controller.current = next;
      await next.activate(initialResult.current);
      if (cancelled) { next.stop(); return; }
      setSnapshot(initialResult.current); setSync(next); setStatus(next.status); setMessage(next.error); setPhase("ready");
    }
    void restore().catch(() => { if (!cancelled) { setMessage("日程未能加载，请重试"); setPhase("error"); } });
    return () => { cancelled = true; };
  }, [initialAnimation, initialChecked]);
  useEffect(() => { if (!sync) return; return sync.subscribe(() => { setStatus(sync.status); setMessage(sync.error); }); }, [sync]);
  async function authenticated(nextSnapshot: AccountSnapshot) {
    const next = new AccountSync(nextSnapshot); controller.current?.stop(); controller.current = next;
    await next.activate(nextSnapshot); setSnapshot(nextSnapshot); setSync(next); setStatus(next.status); setMessage(next.error); setPhase("ready");
  }
  async function logout() {
    if (!sync) return;
    const animation = cycle.start(); setPhase("logout");
    try {
      const done = await sync.logout(); if (!await animation) return;
      if (done) { setSnapshot(null); setSync(null); controller.current = null; setMessage(""); setPhase("auth"); }
      else { setStatus(sync.status); setMessage(sync.error); setPhase("ready"); }
    } catch (error) { if (!await animation) return; setMessage(error instanceof Error ? error.message : "退出失败"); setPhase("ready"); }
  }
  if (phase === "checking") return <main className="account-wait"><PlanningLoading label="正在读取账号" onCycleComplete={() => setInitialAnimation(true)} /></main>;
  if (phase === "logout") return <main className="account-wait"><PlanningLoading key={cycle.animationKey} label="正在安全退出" onCycleComplete={cycle.complete} /></main>;
  if (phase === "error") return <main className="account-wait"><div className="auth-card"><h1>暂时没有连上</h1><p role="alert">{message}</p><button className="btn btn-green" onClick={() => location.reload()}>重新连接</button></div></main>;
  if (!snapshot || !sync || phase === "auth") return <AuthScreen onAuthenticated={authenticated} />;
  return <AccountContext value={{ snapshot, sync, status, error: message, logout: () => void logout() }}><FinalPlanner /></AccountContext>;
}
