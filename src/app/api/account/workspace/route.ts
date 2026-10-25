import { type NextRequest } from "next/server";
import { z } from "zod";
import { AccountWorkspaceSchema } from "@/domain/account";
import { AccountError, accountRepository } from "@/server/accounts";
import { accountFailure, privateJson, readAccountJson, requireAccount, sameOrigin } from "@/server/account-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SaveSchema = z.object({ accountId: z.string().uuid(), workspace: AccountWorkspaceSchema, revision: z.number().int().min(0) });
export function GET(request: NextRequest) {
  try { return privateJson({ ok: true, snapshot: requireAccount(request) }); }
  catch (error) { return accountFailure(error); }
}
export async function PUT(request: NextRequest) {
  try {
    sameOrigin(request); const account = requireAccount(request);
    const parsed = SaveSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) throw new AccountError(400, "日程数据未通过校验，请检查导入内容");
    if (parsed.data.accountId !== account.user.id) throw new AccountError(401, "账号已切换，请重新登录");
    const saved = accountRepository().save(account.user.id, parsed.data.workspace, parsed.data.revision);
    return privateJson({ ok: true, ...saved });
  } catch (error) { return accountFailure(error); }
}
