import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTimetableText } from "@/domain/timetable";
import { planTimetableCoverage, formatTimetableSummary } from "@/domain/schedule";

/**
 * 课表文本解析 + 重传覆盖的**端到端**用例。
 *
 * 直接读仓库里的两份演示素材：旧表 `07-旧课表-重传前.txt`、新表 `08-新课表-重传用.txt`。
 * 这样"新增 2 / 调走 1 / 删除 0 / 未变 7"这串数字不是写在文档里的承诺，
 * 而是任何人在自己机器上跑一次就能复算出来的事实。
 */
function readFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "docs", "demo-fixtures", name), "utf8");
}

describe("parseTimetableText", () => {
  it("解析旧课表：8 节课、0 行跳过", () => {
    const { blocks, skipped } = parseTimetableText(readFixture("07-旧课表-重传前.txt"));
    expect(blocks).toHaveLength(8);
    expect(skipped).toEqual([]);
    expect(blocks[0]).toMatchObject({
      title: "线性代数",
      weekday: 1,
      startMinute: 8 * 60,
      durationMin: 100,
      location: "三教201",
    });
  });

  it("解析新课表：10 节课、0 行跳过", () => {
    const { blocks, skipped } = parseTimetableText(readFixture("08-新课表-重传用.txt"));
    expect(blocks).toHaveLength(10);
    expect(skipped).toEqual([]);
  });

  it("两种横线与无地点写法都能认；认不出的行进 skipped，不静默丢弃", () => {
    const text = [
      "星期三 14:00–15:40 大学物理 二教304",
      "周二 10:00-11:40 概率论",
      "星期二 乱七八糟 无时间",
    ].join("\n");
    const { blocks, skipped } = parseTimetableText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ title: "概率论", weekday: 2, startMinute: 10 * 60 });
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("无时间");
  });

  it("表头/说明行不算跳过（它们本来就不是课）", () => {
    const { skipped } = parseTimetableText("2026-2027 学年第一学期 第 4 周课表\n教务处 · 请以本表为准\n");
    expect(skipped).toEqual([]);
  });
});

describe("重传覆盖端到端（07 → 08）", () => {
  it("四数必须是 新增 2 / 调走 1 / 删除 0 / 未变 7", () => {
    const before = parseTimetableText(readFixture("07-旧课表-重传前.txt")).blocks;
    const after = parseTimetableText(readFixture("08-新课表-重传用.txt")).blocks;
    const plan = planTimetableCoverage(before, after);

    expect(plan.summary).toEqual({ added: 2, updated: 1, removed: 0, unchanged: 7, total: 10 });
    expect(formatTimetableSummary(plan)).toBe("新增 2 节、调走 1 节、删除 0 节、未变 7 节");
  });
});
