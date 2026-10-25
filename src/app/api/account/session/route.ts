import { type NextRequest } from "next/server";
import { accountRepository } from "@/server/accounts";
import { accountFailure, privateJson, sessionToken } from "@/server/account-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  try { const snapshot = accountRepository().session(sessionToken(request)); return privateJson({ ok: true, snapshot }); }
  catch (error) { return accountFailure(error); }
}
