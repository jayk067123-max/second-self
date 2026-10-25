import { NextRequest, NextResponse } from "next/server";
import { AccountError, accountRepository } from "./accounts";

export const SESSION_COOKIE = "second-self-session";
export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export function sessionToken(request: NextRequest) { return request.cookies.get(SESSION_COOKIE)?.value; }
export function requireAccount(request: NextRequest) {
  const snapshot = accountRepository().session(sessionToken(request));
  if (!snapshot) throw new AccountError(401, "登录已过期，请重新登录");
  return snapshot;
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new AccountError(403, "请求来源不被允许，请刷新页面重试");
}
export async function readAccountJson(request: NextRequest, limit = 6_000_000): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) throw new AccountError(413, "内容过大，请减少任务或图片体积");
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, "请填写完整信息");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AccountError(413, "内容过大，请减少任务或图片体积"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AccountError(400, "提交格式不正确"); }
}
export function withSession(response: NextResponse, request: NextRequest, token: string, clear = false) {
  response.cookies.set(SESSION_COOKIE, clear ? "" : token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: clear ? 0 : 30 * 24 * 60 * 60 });
  return response;
}
export function accountFailure(error: unknown) {
  if (error instanceof AccountError) return privateJson({ ok: false, error: error.message }, error.status);
  return privateJson({ ok: false, error: "账号服务暂时不可用，请稍后重试" }, 503);
}
