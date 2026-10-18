import { z } from "zod";

/**
 * 完整性校验 —— 「任何一行原文都不许静默丢掉」。
 *
 * 为什么必须有这一层：解析是概率行为，模型（甚至规则版）都可能把某一行
 * 直接跳过而不报错。用户看到"解析成功"，以为全进去了，实际漏了一条 DDL ——
 * 这是这个产品最不可接受的失败模式，比解析出错更糟（出错能改，漏掉发现不了）。
 *
 * 所以这里不看模型的自述，而是**拿原文重算一遍**：
 *   原文每一行 → 要么有归属（被某条草稿的原文/标题覆盖），
 *   要么进 uncovered（前端「没看懂，请你确认」列表，用户点一下就能补成任务），
 *   要么是纯日期/星期这类上下文行（被后面的任务吸收，不算丢）。
 *
 * 纯函数：不读时钟、不读环境、不做 IO，同一输入永远同一输出。
 * 图片路径拿不到可信原文，由调用方传 `verified: false`（见 unverifiedCoverage）。
 */

const LINE_SPLIT_RE = /\r?\n/;
const FULLWIDTH_DIGIT_RE = /[\uFF10-\uFF19]/g;

/** 归一化要剔除的噪音字符：空白与中英文标点。只留"有信息量"的字。 */
const NOISE_CHAR_RE = /[\s\u3000,，。．.;；:：、!！?？"'“”‘’()（）[\]【】<>《》\-–—~～|/\\*#·•…]/g;

/**
 * 相似度阈值：低于它就不认账，宁可多报一条"待确认"。
 * 取值理由：反向场景（原文一行 vs 模型改写的同义标题）实测通常在 0.7 以上，
 * 而"同一段群通知里两件事"的相似度多在 0.4 以下，0.65 落在两峰之间。
 */
export const COVERAGE_SIMILARITY_THRESHOLD = 0.65;

/** 原文行；lineNo 从 1 起，方便用户回原文按行对 */
export const SourceLineSchema = z.object({
  lineNo: z.number().int().min(1),
  text: z.string(),
});
export type SourceLine = z.infer<typeof SourceLineSchema>;

export const UncoveredLineSchema = SourceLineSchema.extend({
  /** 给人看的原因，不吐技术错误 */
  reason: z.string(),
});
export type UncoveredLine = z.infer<typeof UncoveredLineSchema>;

export const CoverageReportSchema = z.object({
  /**
   * 本地是否真的核过原文。
   * 文本路径恒为 true；图片路径拿不到可信原文（识别本身是模型给的），只能 false ——
   * 这时前端不能显示"100% 覆盖"，否则就是在替模型担保。
   */
  verified: z.boolean(),
  /** 参与核对的内容行数（空行、纯标点行不算） */
  totalLines: z.number().int().min(0),
  /** 有归属的行数 */
  coveredCount: z.number().int().min(0),
  /** 纯日期/星期行：被后续任务吸收，不算丢失 */
  contextLines: z.array(SourceLineSchema),
  /** 没有任何归属的行：必须请用户确认 */
  uncovered: z.array(UncoveredLineSchema),
  /** coveredCount / (totalLines - contextLines.length)，0 行时按 1 处理 */
  ratio: z.number().min(0).max(1),
  /** 有 uncovered 就必须让用户看见 */
  needsConfirm: z.boolean(),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;

/** 参与核对的草稿：只需要"原文出处"和"标题"两项，不依赖完整 Task 类型 */
export interface CoverageDraftInput {
  rawTextOrigin: string | null;
  title: string;
}

/** 归一化：全角数字转半角、去标点空白、转小写。空串表示这行没有信息量。 */
export function normalizeLine(input: string): string {
  return input
    .replace(FULLWIDTH_DIGIT_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(NOISE_CHAR_RE, "")
    .toLowerCase();
}

/**
 * 二元组 Dice 系数：衡量两段中文的"字面重合度"。
 * 用 bigram 而不是编辑距离：中文没空格，按字切二元组对"改写了几个词"最稳。
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let hit = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      hit += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * hit) / (a.length - 1 + (b.length - 1));
}

/**
 * 纯日期/星期/时段行：「10月19日 周日」「第8周」「上午」这类。
 * 它们不是任务，但也不是丢失 —— 它们给后面的任务提供了日期上下文。
 */
export function isContextOnly(normalized: string): boolean {
  const rest = normalized
    .replace(/[0-9]/g, "")
    .replace(
      /年|月|日|号|点|时|分|钟|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|周|星期|礼拜/g,
      "",
    )
    .replace(
      /今天|今日|明天|明日|后天|昨天|昨日|前天|上午|下午|中午|晚上|早上|凌晨|傍晚|每天|每周|每晚|本|这|下|上|第/g,
      "",
    );
  return rest.length <= 1;
}

/**
 * 一行是否被任意一条草稿接住。
 * 两道判定，任一成立即算有归属：
 *   1. 包含关系：原文行 ⊂ 出处 / 出处 ⊂ 原文行（最常见：rawTextOrigin 就是这一行）
 *   2. 字面相似度：模型改写了出处（换同义词、去口语词）时兜一层
 * 单字不参与包含判定 —— 否则一个"会"字就能把整段通知都"覆盖"掉。
 */
function lineCovered(line: string, segments: readonly string[]): boolean {
  const norm = normalizeLine(line);
  if (norm.length === 0) return true; // 纯标点行：没有内容可丢
  for (const segment of segments) {
    if (segment.length < 2) continue;
    if (segment.includes(norm) || norm.includes(segment)) return true;
    if (similarity(norm, segment) >= COVERAGE_SIMILARITY_THRESHOLD) return true;
  }
  return false;
}

export function checkCoverage(
  sourceText: string,
  drafts: readonly CoverageDraftInput[],
): CoverageReport {
  const segments: string[] = [];
  for (const draft of drafts) {
    for (const part of (draft.rawTextOrigin ?? "").split(LINE_SPLIT_RE)) {
      const norm = normalizeLine(part);
      if (norm.length > 0) segments.push(norm);
    }
    const titleNorm = normalizeLine(draft.title);
    if (titleNorm.length > 0) segments.push(titleNorm);
  }

  const contextLines: SourceLine[] = [];
  const uncovered: UncoveredLine[] = [];
  let coveredCount = 0;

  const lines = sourceText.split(LINE_SPLIT_RE);
  for (const [index, raw] of lines.entries()) {
    const text = raw.trim();
    const norm = normalizeLine(text);
    if (norm.length === 0) continue; // 空行 / 纯标点：不计入
    if (lineCovered(text, segments)) {
      coveredCount += 1;
      continue;
    }
    if (isContextOnly(norm)) {
      contextLines.push({ lineNo: index + 1, text });
      continue;
    }
    uncovered.push({
      lineNo: index + 1,
      text,
      reason: norm.length <= 2 ? "太短，看不出要做什么" : "原文这一行没有变成任何任务",
    });
  }

  const totalLines = coveredCount + contextLines.length + uncovered.length;
  const effective = totalLines - contextLines.length;
  const ratio = effective <= 0 ? 1 : coveredCount / effective;

  return {
    verified: true,
    totalLines,
    coveredCount,
    contextLines,
    uncovered,
    ratio: Math.min(1, Math.max(0, Math.round(ratio * 100) / 100)),
    needsConfirm: uncovered.length > 0,
  };
}

/**
 * 图片路径的报告：本地拿不到原文，只核对"模型给出的出处行"自身是否齐全。
 * verified 恒为 false —— 前端据此显示"未复核"，绝不冒充覆盖完整。
 */
export function unverifiedCoverage(drafts: readonly CoverageDraftInput[]): CoverageReport {
  const origins = drafts
    .map((draft) => normalizeLine(draft.rawTextOrigin ?? ""))
    .filter((norm) => norm.length > 0);
  const missingOrigin = drafts.length - origins.length;
  return {
    verified: false,
    totalLines: origins.length,
    coveredCount: origins.length,
    contextLines: [],
    uncovered:
      missingOrigin > 0
        ? [
            {
              lineNo: 1,
              text: `有 ${missingOrigin} 条任务没给出图上原文`,
              reason: "图片识别出的条目缺少原文出处，请对照图片核对",
            },
          ]
        : [],
    ratio: 1,
    needsConfirm: missingOrigin > 0,
  };
}
