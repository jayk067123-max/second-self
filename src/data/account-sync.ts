"use client";
import { AccountWorkspaceSchema, type AccountSnapshot, type AccountWorkspace } from "@/domain/account";
import { DEFAULT_PROFILE, normalizeProfile } from "@/domain/profile";
import { usePlannerStore } from "./store";
import { migrateStoredPayload } from "./migrate";
import { readAccountCache, removeAccountCache, setActiveAccountId, writeAccountCache } from "./account-cache";

export type SyncStatus = "saved" | "saving" | "offline" | "conflict" | "expired";
const META = "second-self/sync";
function stableWorkspace(value: AccountWorkspace): AccountWorkspace {
  return { ...value, planner: { ...value.planner, demoClock: value.planner.demoClock.source === "system" ? { iso: new Date(0).toISOString(), source: "system" } : value.planner.demoClock } };
}
function currentWorkspace(): AccountWorkspace {
  const state = usePlannerStore.getState();
  let profile = DEFAULT_PROFILE;
  try { profile = normalizeProfile(JSON.parse(readAccountCache("second-self/profile") ?? "null")); } catch { /* Invalid cache falls back to a safe profile. */ }
  return stableWorkspace(AccountWorkspaceSchema.parse({ profile, planner: { tasks: state.tasks, snapshot: state.snapshot, snapshotClock: state.snapshotClock, snapshotTermStart: state.snapshotTermStart, demoClock: state.demoClock, termStartDayKey: state.termStartDayKey } }));
}
function installWorkspace(workspace: AccountWorkspace) {
  writeAccountCache("second-self/profile", JSON.stringify(workspace.profile));
  usePlannerStore.setState({ ...workspace.planner, demoClock: workspace.planner.demoClock.source === "system" ? { iso: new Date().toISOString(), source: "system" } : workspace.planner.demoClock, lastError: null });
  window.dispatchEvent(new Event("second-self:profile"));
}
interface PendingCache { workspace: AccountWorkspace; revision: number; pending: boolean }
export class AccountSync {
  status: SyncStatus = "saved";
  error = "";
  private revision: number;
  private saved: string;
  private stopped = false;
  private applying = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private unsubscribe: (() => void) | undefined;
  private listeners = new Set<() => void>();
  private userId: string;
  constructor(snapshot: AccountSnapshot) {
    this.userId = snapshot.user.id; this.revision = snapshot.revision; this.saved = JSON.stringify(stableWorkspace(snapshot.workspace));
  }
  async activate(snapshot: AccountSnapshot) {
    setActiveAccountId(this.userId);
    await usePlannerStore.persist.rehydrate();
    if (this.stopped) return;
    let pending: PendingCache | null = null;
    try {
      const value = JSON.parse(readAccountCache(META) ?? "null");
      if (value?.pending && Number.isInteger(value.revision) && AccountWorkspaceSchema.safeParse(value.workspace).success) pending = value;
    } catch { /* Ignore invalid local metadata, never invalid server data. */ }
    installWorkspace(pending?.workspace ?? snapshot.workspace);
    if (pending && pending.revision !== snapshot.revision) { this.status = "conflict"; this.error = "另一个设备已有更新，请选择要保留的版本"; }
    this.unsubscribe = usePlannerStore.subscribe(() => this.changed());
    window.addEventListener("second-self:profile", this.changed);
    window.addEventListener("online", this.reconnect);
    window.addEventListener("focus", this.refresh);
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("beforeunload", this.beforeUnload);
    if (pending && this.status !== "conflict") this.changed();
    this.checkpoint();
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { for (const listener of this.listeners) listener(); }
  private isDirty() { return JSON.stringify(currentWorkspace()) !== this.saved; }
  private checkpoint() {
    writeAccountCache(META, JSON.stringify({ workspace: currentWorkspace(), revision: this.revision, pending: this.isDirty() }));
  }
  private changed = () => {
    if (this.stopped || this.applying) return;
    this.checkpoint();
    if (!this.isDirty()) return;
    if (this.status === "conflict" || this.status === "expired") return;
    this.status = "saving"; this.error = ""; this.emit();
    clearTimeout(this.timer); this.timer = setTimeout(() => void this.flush(), 450);
  };
  private reconnect = () => { if (this.status === "offline") void this.flush(); else void this.refresh(); };
  private visibility = () => { if (document.visibilityState === "visible") void this.refresh(); else void this.flush(); };
  private beforeUnload = (event: BeforeUnloadEvent) => { if (this.isDirty()) { event.preventDefault(); event.returnValue = ""; } };
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.stopped || this.status === "conflict" || this.status === "expired" || !this.isDirty()) return Promise.resolve();
    this.inFlight = this.save().finally(() => { this.inFlight = null; if (!this.stopped && this.status === "saving" && this.isDirty()) void this.flush(); });
    return this.inFlight;
  }
  private async save() {
    const workspace = currentWorkspace(); this.status = "saving"; this.emit();
    try {
      const response = await fetch("/api/account/workspace", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: this.userId, workspace, revision: this.revision }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (this.stopped) return;
      if (!response.ok) {
        this.status = response.status === 401 ? "expired" : response.status === 409 ? "conflict" : "offline";
        throw new Error(data.error ?? "暂时无法同步");
      }
      this.revision = data.revision; this.saved = JSON.stringify(workspace); this.error = "";
      this.status = this.isDirty() ? "saving" : "saved"; this.checkpoint();
    } catch (error) {
      if (this.stopped) return;
      if (this.status === "saving") this.status = "offline";
      this.error = error instanceof Error ? error.message : "连接中断，修改已留在本机"; this.checkpoint();
    }
    this.emit();
  }
  refresh = async () => {
    if (this.stopped || this.inFlight || document.hidden || this.status === "expired") return;
    if (this.isDirty()) { if (this.status !== "conflict") await this.flush(); return; }
    const requestedRevision = this.revision;
    try {
      const response = await fetch("/api/account/workspace", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      if (this.stopped) return;
      if (!response.ok) { if (response.status === 401) { this.status = "expired"; this.error = "登录已过期，请重新登录"; this.emit(); } return; }
      if (data.snapshot.user.id !== this.userId) { this.status = "expired"; this.error = "账号已在另一标签页切换，请重新登录"; this.emit(); return; }
      if (this.inFlight || this.revision !== requestedRevision) return;
      if (this.isDirty()) { this.changed(); return; }
      if (data.snapshot.revision !== this.revision) {
        const workspace = AccountWorkspaceSchema.parse(data.snapshot.workspace);
        this.applying = true; installWorkspace(workspace); this.applying = false;
        this.revision = data.snapshot.revision; this.saved = JSON.stringify(stableWorkspace(workspace)); this.checkpoint();
      }
      this.status = "saved"; this.error = ""; this.emit();
    } catch { /* A read failure does not discard existing local work. */ }
  };
  async resolveConflict(keepLocal: boolean) {
    const local = currentWorkspace();
    const response = await fetch("/api/account/workspace", { cache: "no-store", signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (this.stopped) return;
    if (!response.ok || data.snapshot.user.id !== this.userId) throw new Error(data.error ?? "请重新登录");
    const remote = AccountWorkspaceSchema.parse(data.snapshot.workspace);
    this.revision = data.snapshot.revision; this.saved = JSON.stringify(stableWorkspace(remote));
    this.applying = true; installWorkspace(keepLocal ? local : remote); this.applying = false;
    this.status = "saved"; this.error = ""; this.checkpoint(); this.emit();
    if (keepLocal) await this.flush();
  }
  async logout(): Promise<boolean> {
    await this.flush();
    if (this.isDirty()) { this.error = "还有未同步修改，请先重试同步或导出备份"; this.emit(); return false; }
    const response = await fetch("/api/account/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: this.userId }) });
    if (!response.ok) throw new Error("暂时无法退出，请稍后重试");
    this.stop();
    for (const key of ["vibe-coding-2026/planner", "second-self/profile", META]) removeAccountCache(key);
    setActiveAccountId(null);
    usePlannerStore.setState({ tasks: [], snapshot: null, snapshotClock: null, snapshotTermStart: null, termStartDayKey: null, lastError: null, demoClock: { iso: new Date().toISOString(), source: "system" } });
    return true;
  }
  importLegacy(): number {
    const result = migrateStoredPayload(JSON.parse(localStorage.getItem("vibe-coding-2026/planner") ?? "null"));
    if (!result.ok || !result.value.tasks.length) throw new Error("没有可导入的原本机日程");
    const state = usePlannerStore.getState(), ids = new Set(state.tasks.map(task => task.id));
    const extra = result.value.tasks.filter(task => !ids.has(task.id));
    if (!extra.length) throw new Error("这些日程已经在当前账号中");
    const merged = AccountWorkspaceSchema.shape.planner.shape.tasks.safeParse([...state.tasks, ...extra]);
    if (!merged.success) throw new Error(merged.error.issues[0]?.message ?? "原本机日程无法导入");
    usePlannerStore.setState({ tasks: merged.data, snapshot: state.tasks, snapshotClock: state.demoClock, snapshotTermStart: state.termStartDayKey });
    return extra.length;
  }
  stop() {
    this.stopped = true; clearTimeout(this.timer); this.unsubscribe?.(); this.listeners.clear();
    window.removeEventListener("second-self:profile", this.changed); window.removeEventListener("online", this.reconnect); window.removeEventListener("focus", this.refresh);
    document.removeEventListener("visibilitychange", this.visibility); window.removeEventListener("beforeunload", this.beforeUnload);
  }
}
