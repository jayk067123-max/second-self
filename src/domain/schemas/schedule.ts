import { z } from "zod";

/**
 * 周次范围契约（`repeat.weeks` 的形状）。
 *
 * 为什么放在 schemas/ 而不是留在 `schedule.ts` 里：
 * 它现在同时被两处引用 —— `Task.repeat.weeks`（落库契约）和 `schedule.ts`
 * （周次判定算法）。契约只能有一份定义，否则 AI 输出校验与算法判定迟早漂移。
 *
 * 三档语义（顺序即判定优先级，见 `isWeekActive`）：
 *   范围 `from..to` → 单双周 `parity` → 排除周 `except`。
 * `except` 是**否决票**：进了排除周就是不上，不能被单双周子规则救回来。
 */
export const WeekSpecSchema = z
  .object({
    from: z.number().int().min(1).max(30),
    to: z.number().int().min(1).max(30),
    /** all = 每周都上；odd = 单周；even = 双周 */
    parity: z.enum(["all", "odd", "even"]).default("all"),
    /** 调休/停课的显式记录。复课把那一周从数组里删掉即可，不丢信息 */
    except: z.array(z.number().int().min(1).max(30)).default([]),
  })
  .refine((spec) => spec.to >= spec.from, {
    message: "周次范围的结束周不能小于开始周",
    path: ["to"],
  });
export type WeekSpec = z.infer<typeof WeekSpecSchema>;
