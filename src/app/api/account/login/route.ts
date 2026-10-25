import { type NextRequest } from "next/server";
import { CredentialsSchema } from "@/domain/account";
import { AccountError, accountRepository } from "@/server/accounts";
import { accountFailure, privateJson, readAccountJson, sameOrigin, withSession } from "@/server/account-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const parsed = CredentialsSchema.safeParse(await readAccountJson(request, 4096));
    if (!parsed.success) throw new AccountError(400, parsed.error.issues[0]?.message ?? "请检查账号和密码");
    const repo = accountRepository();
    if (!repo.allowAttempt("login:global", 250) || !repo.allowAttempt("login:" + parsed.data.username, 15)) throw new AccountError(429, "登录尝试太频繁，请15分钟后重试");
    const snapshot = await repo.login(parsed.data.username, parsed.data.password);
    return withSession(privateJson({ ok: true, snapshot }), request, repo.createSession(snapshot.user.id));
  } catch (error) { return accountFailure(error); }
}
