import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planTimetableCoverage, type TimetableBlock } from "@/domain/schedule";
import { adaptDemoSeed } from "@/data/seed";
import { parseTimetableText } from "@/shared/timetableParse";
import { courseBlocksOf } from "@/ui/composites/timetableCoverage";

/**
 * 「重传课表」面板的旧表侧取样 —— 这条测试守的是**数据丢失**，不是摘要好看。
 *
 * 背景：演示种子里 9 条固定安排，其中 8 条是 07 课表上的课，第 9 条是「启航兼职」
 * （周日、固定、带地点）。如果旧表侧直接把全部 tasks 拿去比，兼职会在新课表里
 * 找不到对应 → 变成「删除 1」→ 用户点一次确认，兼职就真被删了。
 *
 * 所以取样规则是「有始有终 + 固定或带地点 + **新表覆盖到的星期几**」，
 * 并且这条测试要能证明：范围线生效时删 0，新表一旦排了周日，兼职照常参与比对
 * （说明这不是按课程名做白名单）。
 */

const DIR = join(process.cwd(), "docs", "demo-fixtures");

function seedTasks() {
  const raw: unknown = JSON.parse(readFileSync(join(DIR, "demo-seed.json"), "utf8"));
  const result = adaptDemoSeed(raw);
  expect(result.ok, result.ok ? "" : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value.tasks;
}

function blocksOf(file: string) {
  return parseTimetableText(readFileSync(join(DIR, file), "utf8"));
}

describe("courseBlocksOf", () => {
  it("种子里 9 条固定块，但只有 8 条属于这张课表（周日兼职被范围线挡掉）", () => {
    const tasks = seedTasks();
    const after = blocksOf("08-新课表-重传用.txt");
    const scope = new Set(after.map((block) => block.weekday));

    expect(tasks.filter((task) => task.locked === true).length).toBe(9);
    const before = courseBlocksOf(tasks, scope);
    expect(before).toHaveLength(8);
    expect(before.map((block) => block.title)).not.toContain("启航兼职");
  });

  it("带地点但没标固定的会议不会被当成课表条目（否则会被算成删除）", () => {
    const tasks = seedTasks();
    const before = courseBlocksOf(tasks);
    const titles = before.map((block) => block.title);
    expect(titles).not.toContain("社团负责人会议");
    expect(titles).not.toContain("答辩准备");
    expect(titles).not.toContain("校运会志愿者培训");
  });

  it("新表一旦排了周日，兼职照常参与比对（不是按名字白名单）", () => {
    const tasks = seedTasks();
    const withSunday: TimetableBlock[] = [
      { title: "考研辅导", weekday: 7, startMinute: 13 * 60, durationMin: 120, location: "鼓楼校区" },
    ];
    const scope = new Set(withSunday.map((block) => block.weekday));
    const before = courseBlocksOf(tasks, scope);
    expect(before.map((block) => block.title)).toContain("启航兼职");
    expect(before).toHaveLength(1);
  });

  it("没有时间块的任务永远不参与（纯截止日的任务不是课表条目）", () => {
    const tasks = seedTasks();
    const before = courseBlocksOf(tasks);
    expect(before.every((block) => block.startMinute >= 0)).toBe(true);
    expect(before.map((block) => block.title)).not.toContain("数据结构作业推迟到下周，具体时间等通知");
  });

  it("面板真跑一遍：导入种子后重传 08，四数 = 新增 2 / 调走 1 / 删除 0 / 未变 7", () => {
    const after = blocksOf("08-新课表-重传用.txt");
    const scope = new Set(after.map((block) => block.weekday));
    const before = courseBlocksOf(seedTasks(), scope);
    const plan = planTimetableCoverage(before, after);

    expect(plan.summary.added).toBe(2);
    expect(plan.summary.updated).toBe(1);
    expect(plan.summary.removed).toBe(0);
    expect(plan.summary.unchanged).toBe(7);
    expect(plan.summary.total).toBe(10);
  });
});
