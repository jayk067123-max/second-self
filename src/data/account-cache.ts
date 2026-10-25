let activeAccountId: string | null = null;
export function setActiveAccountId(id: string | null) { activeAccountId = id; }
export function accountStorageKey(key: string): string | null { return activeAccountId ? key + ":" + activeAccountId : null; }
export function readAccountCache(key: string): string | null {
  const scoped = accountStorageKey(key);
  try { return scoped && typeof window !== "undefined" ? localStorage.getItem(scoped) : null; } catch { return null; }
}
export function writeAccountCache(key: string, value: string): boolean {
  const scoped = accountStorageKey(key);
  if (!scoped || typeof window === "undefined") return false;
  try { localStorage.setItem(scoped, value); return true; } catch { return false; }
}
export function removeAccountCache(key: string) {
  const scoped = accountStorageKey(key); if (!scoped) return;
  try { localStorage.removeItem(scoped); } catch { /* Server copy remains authoritative. */ }
}
