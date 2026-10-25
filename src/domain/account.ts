import { z } from "zod";
import { TaskListSchema } from "./schemas/task";
import { AVATARS, DEFAULT_PROFILE } from "./profile";

export const CredentialsSchema = z.object({
  username: z.string().trim().min(3, "账号至少3位").max(32).regex(/^[A-Za-z0-9_]+$/, "账号只能使用字母、数字和下划线").transform(value => value.toLowerCase()),
  password: z.string().min(8, "密码至少8位").max(128, "密码不能超过128位"),
});
export const RegisterSchema = CredentialsSchema.extend({ name: z.string().trim().min(1, "请填写昵称").max(24) });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const clock = z.object({ iso: z.string().refine(value => Number.isFinite(Date.parse(value))), source: z.enum(["seed", "system"]) });
export const AccountProfileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  avatar: z.string().max(500_000).refine(value => AVATARS.includes(value) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)),
});
export const AccountPlannerSchema = z.object({
  tasks: TaskListSchema, snapshot: TaskListSchema.nullable(),
  snapshotTermStart: day, snapshotClock: clock.nullable(), demoClock: clock, termStartDayKey: day,
});
export const AccountWorkspaceSchema = z.object({ planner: AccountPlannerSchema, profile: AccountProfileSchema });
export type AccountWorkspace = z.infer<typeof AccountWorkspaceSchema>;
export interface AccountUser { id: string; username: string }
export interface AccountSnapshot { user: AccountUser; workspace: AccountWorkspace; revision: number; updatedAt: string }
export function emptyAccountWorkspace(name: string): AccountWorkspace {
  return { profile: { ...DEFAULT_PROFILE, name }, planner: { tasks: [], snapshot: null, snapshotTermStart: null, snapshotClock: null, termStartDayKey: null, demoClock: { iso: new Date(0).toISOString(), source: "system" } } };
}
