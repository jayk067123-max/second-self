/**
 * 课表文本解析（纯函数、零依赖）—— 给"重传课表"面板用。
 *
 * 为什么不用模型：课表格式在演示素材里是固定的（`MM-旧课表-重传前.txt` / `MM-新课表-重传用.txt`），
 * 确定性的正则比模型更准、更快、还能离线跑；模型留给"脏文本解析"那条路径。
 *
 * 支持的行格式（容忍多余空格、全角冒号）：
 *   星期一  08:00-09:40  线性代数          三教201
 *   周一 8:00-9:40 线性代数 三教201
 *   周三    14:00 - 15:40   数据结构   实验楼B305
 *
 * 返回结构刻意不 import domain 的类型（shared 层零依赖），字段与 `TimetableBlock` 结构兼容。
 */

export interface ParsedTimetableBlock {
  title: string;
  /** ISO 星期：1=周一 … 7=周日 */
  weekday: number;
  startMinute: number;
  durationMin: number;
  location: string | null;
}

const WEEKDAY_TEXT: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};

const LINE_RE =
  /^(?:星期|周)\s*([一二三四五六日天])\s*(\d{1,2})[:：](\d{2})\s*[-–—~～至到]\s*(\d{1,2})[:：](\d{2})\s+(.+)$/;

/** 解析一份课表文本；无法识别的行（标题行、备注行）直接跳过 */
export function parseTimetableText(text: string): ParsedTimetableBlock[] {
  const blocks: ParsedTimetableBlock[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\s{2,}/g, " ");
    if (line.length === 0) continue;
    const match = LINE_RE.exec(line);
    if (!match) continue;

    const weekday = WEEKDAY_TEXT[match[1] ?? ""];
    if (weekday === undefined) continue;

    const startHour = Number.parseInt(match[2] ?? "0", 10);
    const startMinutePart = Number.parseInt(match[3] ?? "0", 10);
    const endHour = Number.parseInt(match[4] ?? "0", 10);
    const endMinutePart = Number.parseInt(match[5] ?? "0", 10);
    const startMinute = startHour * 60 + startMinutePart;
    const endMinute = endHour * 60 + endMinutePart;
    if (endMinute <= startMinute) continue;

    // 尾部：课程名 + 可选地点（地点是最后一段，含"教/楼/馆/室"等字样的短串）
    const tail = (match[6] ?? "").trim();
    const parts = tail.split(/\s+/).filter((part) => part.length > 0);
    let location: string | null = null;
    if (parts.length >= 2) {
      const maybeLocation = parts[parts.length - 1] ?? "";
      if (/(教|楼|馆|室|厅|场|院|中心|[A-Z]\d{2,4})/.test(maybeLocation) && maybeLocation.length <= 12) {
        location = maybeLocation;
        parts.pop();
      }
    }
    const title = parts.join(" ").trim();
    if (title.length === 0) continue;

    blocks.push({ title, weekday, startMinute, durationMin: endMinute - startMinute, location });
  }
  return blocks;
}
