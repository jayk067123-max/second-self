import { z } from "zod";
import {
  TimetableBlockSchema,
  weekdayFromLabel,
  type TimetableBlock,
} from "@/domain/schedule";

/**
 * 课表纯文本 → `TimetableBlock[]`。
 *
 * 为什么单独一个文件：重传覆盖（WO-02）需要把「粘贴/读进来的课表文本」变成
 * 可比较的结构，而 `planTimetableCoverage` 只认结构、不认文本。这一层只做解析，
 * 不做任何"猜测性修复"——认不出的行**原样跳过并计入 `skipped`**，由调用方决定
 * 是否提示用户，绝不让一条看不懂的行悄悄消失。
 *
 * 支持的写法（演示素材与用户粘贴都覆盖）：
 *   `星期一  08:00-09:40  线性代数          三教201`
 *   `周三 14:00–15:40 大学物理 二教304`（全角横线、单/多空格均可）
 *   `周二 10:00-11:40 概率论`（无地点）
 */

const TIME = String.raw`(\d{1,2}):(\d{2})`;
const RANGE = new RegExp(String.raw`${TIME}\s*(?:-|–|—|~|～|至|到)\s*${TIME}`);
const WEEKDAY = /^(?:周|星期|礼拜)\s*[一二三四五六日天]/;

export interface TimetableParseResult {
  blocks: TimetableBlock[];
  /** 被跳过的行（含原始文本），供 UI 提示"这几行没看懂" */
  skipped: string[];
}

function minutesOf(hour: string, minute: string): number | null {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function parseTimetableText(text: string): TimetableParseResult {
  const blocks: TimetableBlock[] = [];
  const skipped: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    const weekday = weekdayFromLabel(line);
    if (weekday === null) {
      // 表头、说明、空行都不算"没看懂"，直接忽略
      if (WEEKDAY.test(line)) skipped.push(line);
      continue;
    }

    const range = RANGE.exec(line);
    if (!range) {
      skipped.push(line);
      continue;
    }

    const [, h1, m1, h2, m2] = range;
    const startMinute = minutesOf(h1!, m1!);
    const endMinute = minutesOf(h2!, m2!);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      skipped.push(line);
      continue;
    }

    // 时段时间之前是星期，之后再拆「课程名 + 地点」
    const rest = line.slice(range.index + range[0].length).trim();
    if (rest === "") {
      skipped.push(line);
      continue;
    }

    // 两个及以上空格 / 制表符视为列分隔；否则整段就是课程名（没有地点）
    const parts = rest.split(/\s{2,}|\t+/).map((part) => part.trim()).filter(Boolean);
    const title = parts[0] ?? "";
    const location = parts[1] ?? null;

    const parsed = TimetableBlockSchema.safeParse({
      title,
      weekday,
      startMinute,
      durationMin: endMinute - startMinute,
      location,
    });
    if (!parsed.success) {
      skipped.push(line);
      continue;
    }
    blocks.push(parsed.data);
  }

  return { blocks, skipped };
}

/** 只取块，供"不关心跳过明细"的调用方使用 */
export function timetableBlocksOf(text: string): TimetableBlock[] {
  return parseTimetableText(text).blocks;
}

export const _schemaForTests = z.object({ ok: z.boolean() });
