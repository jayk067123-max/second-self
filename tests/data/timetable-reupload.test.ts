import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTimetableText } from "@/shared/timetableParse";
import { planTimetableCoverage } from "@/domain/schedule";

/**
 * 重传覆盖的**真实素材回归**：07 旧课表 → 08 新课表，期望四数
 * 「新增 2 / 调走 1 / 删除 0 / 未变 7」（选题官 在 EXPECTED 里定的口径）。
 *
 * 这条测试的意义：重传是答辩上唯一的差异点，四数是旁白要念的，
 * 数字错了当场打脸；而它依赖两个独立环节（课表解析 + 覆盖比对），必须一起测。
 */
const DIR = join(process.cwd(), "docs", "demo-fixtures");

function blocksOf(file: string) {
  return parseTimetableText(readFileSync(join(DIR, file), "utf8"));
}

describe("课表重传覆盖 · 真实素材 07→08", () => {
  it("旧课表解析出 8 条、新课表 10 条（标题行/备注行被跳过）", () => {
    expect(blocksOf("07-旧课表-重传前.txt")).toHaveLength(8);
    expect(blocksOf("08-新课表-重传用.txt")).toHaveLength(10);
  });

  it("覆盖摘要 = 新增 2 / 调走 1 / 删除 0 / 未变 7", () => {
    const plan = planTimetableCoverage(
      blocksOf("07-旧课表-重传前.txt"),
      blocksOf("08-新课表-重传用.txt"),
    );
    expect(plan.summary.added).toBe(2);
    expect(plan.summary.updated).toBe(1);
    expect(plan.summary.removed).toBe(0);
    expect(plan.summary.unchanged).toBe(7);
    expect(plan.summary.total).toBe(10);
  });

  it("新增的是周一概率论与周三大学英语；调走的是数据结构", () => {
    const plan = planTimetableCoverage(
      blocksOf("07-旧课表-重传前.txt"),
      blocksOf("08-新课表-重传用.txt"),
    );
    const addedTitles = plan.changes.filter((c) => c.kind === "added").map((c) => c.title);
    const updatedTitles = plan.changes.filter((c) => c.kind === "updated").map((c) => c.title);
    expect(addedTitles.join("/")).toContain("概率论");
    expect(addedTitles.join("/")).toContain("大学英语");
    expect(updatedTitles.join("/")).toContain("数据结构");
  });
});
