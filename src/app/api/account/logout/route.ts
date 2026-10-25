import { type NextRequest } from "next/server";
import { AccountError, accountRepository } from "@/server/accounts";
import { accountFailure, privateJson, readAccountJson, sameOrigin, sessionToken, withSession } from "@/server/account-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const body = await readAccountJson(request, 1024) as { accountId?: unknown };
    const repo = accountRepository(), current = repo.session(sessionToken(request));
    if (current && current.user.id !== body?.accountId) throw new AccountError(401, "账号已切换，请刷新页面");
    repo.logout(sessionToken(request));
    return withSession(privateJson({ ok: true }), request, "", true);
  }
  catch (error) { return accountFailure(error); }
}
