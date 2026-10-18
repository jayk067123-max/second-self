import { describe, expect, it } from "vitest";
import {
  COVERAGE_SIMILARITY_THRESHOLD,
  checkCoverage,
  isContextOnly,
  normalizeLine,
  similarity,
  unverifiedCoverage,
  type CoverageDraftInput,
} from "@/domain/completeness";

/**
 * 完整性校验的边界条件 —— 这个文件赌的是同一件事：
 * **一行原文要么有归属，要么被用户看见，绝不允许"解析成功但其实丢了"。**
 */

function draft(rawTextOrigin: string | null, title: string): CoverageDraftInput {
  return { rawTextOrigin, title };
}

describe("normalizeLine", () => {
  it("全角数字转半角、标点与空白全去掉", () => {
    expect(normalizeLine("１４：００-１５：３０　小组会议")).toBe("14001530小组会议");
  });

  it("纯标点归一化成空串（调用方据此判定为无内容行）", () => {
    expect(normalizeLine("——  。，、 ")).toBe("");
  });
});

describe("similarity", () => {
  it("完全相同为 1，毫无重合为 0", () => {
    expect(similarity("实验室例会", "实验室例会")).toBe(1);
    expect(similarity("实验室例会", "奖学金表格")).toBe(0);
  });

  it("只改写几个字仍在阈值之上（这就是它存在的理由）", () => {
    const score = similarity(normalizeLine("微积分作业下周一交，别拖了"), normalizeLine("微积分作业下周一交"));
    expect(score).toBeGreaterThanOrEqual(COVERAGE_SIMILARITY_THRESHOLD);
  });

  it("改写过头就不认账，宁可多报一条待确认（安全侧倾倒）", () => {
    const score = similarity(normalizeLine("实验室例会，本周照常"), normalizeLine("实验室例会 照常进行"));
    expect(score).toBeLessThan(COVERAGE_SIMILARITY_THRESHOLD);
    // 但实际业务里不会因此误报：标题「实验室例会」是原文的子串，包含判定先命中
  });
});

describe("isContextOnly", () => {
  it("纯日期/星期行算上下文，不算丢失", () => {
    expect(isContextOnly(normalizeLine("10月19日 周日"))).toBe(true);
    expect(isContextOnly(normalizeLine("第8周"))).toBe(true);
  });

  it("带内容的时间行不算上下文", () => {
    expect(isContextOnly(normalizeLine("10月19日 交数据结构作业"))).toBe(false);
  });
});

describe("checkCoverage", () => {
  it("空文本：0 行、覆盖率按 1 处理、不需要确认", () => {
    const report = checkCoverage("   \n \n", []);
    expect(report).toMatchObject({ verified: true, totalLines: 0, coveredCount: 0, ratio: 1, needsConfirm: false });
  });

  it("每行都有归属：覆盖率 100%，没有待确认行", () => {
    const text = "9:00-10:00 高数课\n14:00-15:00 小组会议";
    const report = checkCoverage(text, [
      draft("9:00-10:00 高数课", "高数课"),
      draft("14:00-15:00 小组会议", "小组会议"),
    ]);
    expect(report.totalLines).toBe(2);
    expect(report.coveredCount).toBe(2);
    expect(report.uncovered).toEqual([]);
    expect(report.ratio).toBe(1);
    expect(report.needsConfirm).toBe(false);
  });

  it("漏掉一行：必须出现在待确认里，且带原文行号", () => {
    const text = "9:00-10:00 高数课\n@全体成员 提醒几件事\n14:00-15:00 小组会议";
    const report = checkCoverage(text, [
      draft("9:00-10:00 高数课", "高数课"),
      draft("14:00-15:00 小组会议", "小组会议"),
    ]);
    expect(report.totalLines).toBe(3);
    expect(report.coveredCount).toBe(2);
    expect(report.uncovered).toHaveLength(1);
    expect(report.uncovered[0]).toMatchObject({ lineNo: 2, text: "@全体成员 提醒几件事" });
    expect(report.uncovered[0]?.reason).toContain("没有变成任何任务");
    expect(report.needsConfirm).toBe(true);
    expect(report.ratio).toBeLessThan(1);
  });

  it("上下文行被吸收：不报待确认，也不拉低覆盖率", () => {
    const text = "10月19日 周日\n9:00-10:00 高数课";
    const report = checkCoverage(text, [draft("9:00-10:00 高数课", "高数课")]);
    expect(report.contextLines).toHaveLength(1);
    expect(report.contextLines[0]?.lineNo).toBe(1);
    expect(report.uncovered).toEqual([]);
    expect(report.ratio).toBe(1);
  });

  it("空行与纯标点行不计入总行数", () => {
    const text = "9:00-10:00 高数课\n\n——\n\n14:00-15:00 小组会议";
    const report = checkCoverage(text, [
      draft("9:00-10:00 高数课", "高数课"),
      draft("14:00-15:00 小组会议", "小组会议"),
    ]);
    expect(report.totalLines).toBe(2);
    expect(report.uncovered).toEqual([]);
  });

  it("同一行拆出多条任务：只算覆盖一次，不重复计数", () => {
    const text = "9:00-10:00 开会，14:00-15:00 实验";
    const report = checkCoverage(text, [
      draft("9:00-10:00 开会", "开会"),
      draft("14:00-15:00 实验", "实验"),
    ]);
    expect(report.totalLines).toBe(1);
    expect(report.coveredCount).toBe(1);
  });

  it("模型改写了原文出处，仍认账（相似度兜底）", () => {
    const text = "2. 每周三 19:00-21:00 实验室例会，本周照常";
    const report = checkCoverage(text, [draft("实验室例会", "实验室例会")]);
    expect(report.uncovered).toEqual([]);
    expect(report.coveredCount).toBe(1);
  });

  it("出处为 null 且标题对不上：算漏行，不许蒙混过关", () => {
    const text = "6. 微积分作业下周一交，别拖了";
    const report = checkCoverage(text, [draft(null, "数据结构作业")]);
    expect(report.uncovered).toHaveLength(1);
  });

  it("确定性：同一输入两次结果完全相同", () => {
    const text = "10月19日 周日\n9:00-10:00 高数课\n模糊的一行";
    expect(checkCoverage(text, [draft("9:00-10:00 高数课", "高数课")])).toEqual(
      checkCoverage(text, [draft("9:00-10:00 高数课", "高数课")]),
    );
  });
});

describe("unverifiedCoverage（图片路径）", () => {
  it("永远标记 verified=false：本地拿不到原文就不许冒充已核对", () => {
    const report = unverifiedCoverage([draft("数据结构 周三 19:00", "数据结构")]);
    expect(report.verified).toBe(false);
    expect(report.uncovered).toEqual([]);
  });

  it("有任务缺原文出处时要报出来", () => {
    const report = unverifiedCoverage([
      draft("数据结构 周三 19:00", "数据结构"),
      draft(null, "高数"),
    ]);
    expect(report.needsConfirm).toBe(true);
    expect(report.uncovered[0]?.text).toContain("1 条任务没给出图上原文");
  });
});
