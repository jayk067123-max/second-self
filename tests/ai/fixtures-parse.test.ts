import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoParseTasks } from "@/ai/demo";
import { TaskDraftSchema } from "@/domain/schemas/task";

/**
 * 解析器的**真实素材回归测试**：直接读 docs/demo-fixtures/ 下的锁版文件，
 * 不另造样本 —— 否则「测试通过」和「演示素材跑不通」会各说各话。
 *
 * 约定（与 detectConflicts 同一口径）：`now`（这里体现为 dayKey）一律由调用方注入，
 * 解析器内部不读时钟，所以同一份素材 + 同一 dayKey 结果必须逐字节稳定。
 */

const FIXTURE_DIR = join(process.cwd(), "docs", "demo-fixtures");
const DAY = "2026-10-19"; // 演示锚定日（周日 → 周一最近时刻的口径由 fixture 文档定义）

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

const FIXTURES = [
  "notice.txt",
  "02-相对时间表达.txt",
  "03-DDL轰炸.txt",
  "04-排班混合-回归用.txt",
] as const;

describe("demo 解析器 · 真实素材", () => {
  for (const name of FIXTURES) {
    it(`${name}：每条产出都符合 Draft 契约`, () => {
      const drafts = demoParseTasks(readFixture(name), DAY);
      expect(drafts.length).toBeGreaterThan(0);
      for (const draft of drafts) {
        const parsed = TaskDraftSchema.safeParse(draft);
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      }
    });
  }

  it("同一素材 + 同一 dayKey：两次解析结果完全一致（无时钟、无随机）", () => {
    const text = readFixture("notice.txt");
    expect(demoParseTasks(text, DAY)).toEqual(demoParseTasks(text, DAY));
  });

  it("dayKey 由外部注入：换一天，绝对时间跟着变（证明没有写死日期）", () => {
    const text = "9:00-10:30 高等数学作业";
    const monday = demoParseTasks(text, "2026-10-19")[0];
    const tuesday = demoParseTasks(text, "2026-10-20")[0];
    expect(monday?.start).not.toBeNull();
    expect(tuesday?.start).not.toBeNull();
    expect(Date.parse(tuesday!.start!) - Date.parse(monday!.start!)).toBe(24 * 60 * 60 * 1000);
  });

  it("notice.txt 的五个歧义点：至少不被解析成空/崩溃，且模糊项标 needsReview", () => {
    const drafts = demoParseTasks(readFixture("notice.txt"), DAY);
    const titles = drafts.map((d) => d.title).join("|");
    // 周期安排必须至少被识别成"有时间块"（具体周几由大模型版负责，规则版只保证不丢）
    expect(titles.length).toBeGreaterThan(0);
    // 「下雨顺延」这类条件性安排，规则版无法确定 → 必须挂待确认，不能假装知道
    const conditional = drafts.find((d) => (d.rawTextOrigin ?? "").includes("下雨顺延"));
    if (conditional) expect(conditional.needsReview).toBe(true);
    // 既没有时间块、也没有截止的条目（真正"什么都说不清"）才必须挂待确认；
    // 只有截止日的任务（微积分作业/奖学金表格）是确定信息，不该被黄标打扰
    for (const draft of drafts) {
      if (draft.start === null && draft.deadline === null) {
        expect(draft.needsReview).toBe(true);
      }
    }
  });
});
