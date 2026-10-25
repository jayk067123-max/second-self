import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 固定回归素材的内容与字节数，防止样本无意变化。 */
const NOTICE = join(process.cwd(), "docs", "demo-fixtures", "notice.txt");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("主素材哈希", () => {
  it("notice.txt 内容与回归基准一致", () => {
    const expected = "b2631ac2806988f8ea4e01bf5f36d16744130ce539af4eca4301e52fee1599b2";
    expect(sha256(NOTICE)).toBe(expected);
  });

  it("notice.txt 为436字节、8行的回归样本", () => {
    const text = readFileSync(NOTICE, "utf8");
    expect(Buffer.byteLength(text, "utf8")).toBe(436);
    expect(text.trimEnd().split(/\r?\n/)).toHaveLength(8);
  });

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
