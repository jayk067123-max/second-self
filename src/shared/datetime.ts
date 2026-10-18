/**
 * ISO ↔ <input type="datetime-local"> 的转换（纯函数，本地时区）。
 * 放在 shared 而不是 domain：只做格式互转，不含任何业务判断。
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO → "YYYY-MM-DDTHH:mm"（供给 datetime-local） */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → ISO；空值返回 null */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** 供 UI 显示：从 ISO 取出 "10-18" 这样的短日期 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 分钟数 → html number input 的安全值 */
export function minutesToInput(minutes: number): number {
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
}
