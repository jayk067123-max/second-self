import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 主素材哈希钉死 —— 对齐映像官分镜附录 A 登记值。
 *
 * 为什么值钱：`notice.txt` 是录像与 EXPECTED 表共用的基准。改了素材却忘了同步期望表，
 * 解析结果、镜头旁白、单测会同时失真，而且**不会报错**。这里用哈希把它变成"改了就红"。
 *
 * 注：仓库只保留**唯一路径** `docs/demo-fixtures/notice.txt`（demo-fixtures/README §四
 * 「唯一路径原则」）；曾有第二份 `fixtures/notice.txt` 副本，已删除，避免长期漂移。
 */
const NOTICE = join(process.cwd(), "docs", "demo-fixtures", "notice.txt");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("主素材哈希", () => {
  it("notice.txt 等于分镜附录 A 登记值（改一个字即红）", () => {
    const expected = "b2631ac2806988f8ea4e01bf5f36d16744130ce539af4eca4301e52fee1599b2";
    expect(sha256(NOTICE)).toBe(expected);
  });

  it("notice.txt 是 436 字节 / 8 行，与 EXPECTED 第一节目录一致", () => {
    const text = readFileSync(NOTICE, "utf8");
    expect(Buffer.byteLength(text, "utf8")).toBe(436);
    expect(text.trimEnd().split(/\r?\n/)).toHaveLength(8);
  });

  // 重传覆盖的一对素材：改了任一份却不更新 EXPECTED 四数，这里当场红。
  // 这样"素材冻结"从流程约束变成测试约束（评审 WO-09 强化项）。
  const OLD_TIMETABLE = join(process.cwd(), "docs", "demo-fixtures", "07-旧课表-重传前.txt");
  const NEW_TIMETABLE = join(process.cwd(), "docs", "demo-fixtures", "08-新课表-重传用.txt");

  it("07-旧课表-重传前.txt 哈希与冻结表一致（580 B）", () => {
    expect(sha256(OLD_TIMETABLE)).toBe(
      "6b2e9b89244ffa5be8685c274dfa252c8cabf657a76444d123576e7d9d8ca17d",
    );
    expect(readFileSync(OLD_TIMETABLE).byteLength).toBe(580);
  });

  it("08-新课表-重传用.txt 哈希与冻结表一致（691 B）", () => {
    expect(sha256(NEW_TIMETABLE)).toBe(
      "33b8b52354e8a0c87fec74262aa5ff3e6587c0d5b1693152c0766ec28cab6e82",
    );
    expect(readFileSync(NEW_TIMETABLE).byteLength).toBe(691);
  });
});
