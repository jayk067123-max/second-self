"use client";
import { useState, type FormEvent } from "react";
import { type AccountSnapshot, CredentialsSchema, RegisterSchema } from "@/domain/account";
import { PlanningLoading } from "./composites/PlanningLoading";
import { useLoadingCycle } from "./composites/useLoadingCycle";
export function AuthScreen({ onAuthenticated }: { onAuthenticated: (snapshot: AccountSnapshot) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [name, setName] = useState("");
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const cycle = useLoadingCycle();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError("");
    const parsed = (mode === "register" ? RegisterSchema : CredentialsSchema).safeParse({ username, password, name });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "请检查填写的信息"); return; }
    if (mode === "register" && password !== confirm) { setError("两次密码不一致"); return; }
    const animation = cycle.start(); setBusy(true);
    try {
      const response = await fetch("/api/account/" + mode, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "暂时无法登录");
      if (!await animation) return; await onAuthenticated(data.snapshot);
    } catch (cause) { if (!await animation) return; setError(cause instanceof Error ? cause.message : "连接中断，请重试"); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark" aria-hidden="true">二</span>第二自我</div>
    <div className="auth-layout"><section className="auth-intro"><p className="eyebrow">留一点时间，给自己。</p><h1>把日子，<br/><mark>慢慢安排好。</mark></h1><p>通知、课表、随手记。<br/>登录后，你的安排都在这里。</p><div className="auth-art" aria-hidden="true"><span>今天</span><i>09:00　好好开始</i><i>14:00　专心一件事</i><b>把时间留给重要的事 ↗</b></div></section>
    <section className="auth-card" aria-label={mode === "login" ? "账号登录" : "账号注册"}><div className="auth-tabs" role="group" aria-label="账号操作"><button type="button" aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setError(""); }}>登录</button><button type="button" aria-pressed={mode === "register"} disabled={busy} onClick={() => { setMode("register"); setError(""); }}>注册</button></div>
      <h2>{mode === "login" ? "欢迎回来。" : "认识一下新的你。"}</h2><p className="auth-subtitle">{mode === "login" ? "接着安排你的每一天。" : "建立账号，留住每一条安排。"}</p>
      {busy ? <PlanningLoading key={cycle.animationKey} label={mode === "login" ? "正在登录" : "正在创建账号"} onCycleComplete={cycle.complete} /> : <form onSubmit={event => void submit(event)}>
        {mode === "register" && <label>昵称<input value={name} onChange={event => setName(event.target.value)} maxLength={24} autoComplete="nickname" required placeholder="怎么称呼你" /></label>}
        <label>账号<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" autoCapitalize="none" autoCorrect="off" autoComplete="username" required placeholder="3–32位字母、数字或下划线" /></label>
        <label>密码<div className="password-field"><input aria-label="密码" type={visible ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} required placeholder="至少8位，请妥善保存" /><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(!visible)}>{visible ? "隐藏" : "显示"}</button></div></label>
        {mode === "register" && <label>确认密码<input type={visible ? "text" : "password"} value={confirm} onChange={event => setConfirm(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required placeholder="再输入一次密码" /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="btn btn-green auth-submit">{mode === "login" ? "登录，继续今天 ↗" : "创建我的账号 ↗"}</button>
      </form>}
      <p className="auth-footnote">日程与个人设置自动保存到当前服务的账号。</p>
    </section></div></main>;
}
