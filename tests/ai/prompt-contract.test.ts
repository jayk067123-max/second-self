import { describe, expect, it } from "vitest";
import { AiParseOutputSchema } from "@/domain/schemas/task";
import { IMAGE_PARSE_SYSTEM, PARSE_TASKS_SYSTEM, PARSE_OUTPUT_FIELDS } from "@/ai/prompts";

describe("真实解析提示词契约", () => {
  it("系统格式涵盖所有必填字段，图片复用同一要求", () => {
    for (const field of PARSE_OUTPUT_FIELDS) {
      expect(PARSE_TASKS_SYSTEM).toContain('"' + field + '"');
      expect(IMAGE_PARSE_SYSTEM).toContain('"' + field + '"');
    }
    expect(PARSE_TASKS_SYSTEM).toContain('"repeat":null');
    expect(PARSE_TASKS_SYSTEM).toContain('"kind":"weekly"');
  });
  it("给模型的完整单次示例实际通过schema", () => {
    const line = PARSE_TASKS_SYSTEM.split("\n").find(text => text.startsWith("单次任务完整示例："))!;
    expect(AiParseOutputSchema.safeParse(JSON.parse(line.slice("单次任务完整示例：".length))).success).toBe(true);
  });
});
