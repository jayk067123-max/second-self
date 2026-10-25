import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccountRepository } from "@/server/accounts";
import { POST as register } from "@/app/api/account/register/route";
import { POST as login } from "@/app/api/account/login/route";
import { POST as logout } from "@/app/api/account/logout/route";
import { GET, PUT } from "@/app/api/account/workspace/route";
import { POST as parseText } from "@/app/api/ai/parse-tasks/route";
import { POST as parseImage } from "@/app/api/ai/parse-image/route";
import { POST as replan } from "@/app/api/ai/replan/route";
let repo: AccountRepository;
vi.mock("@/server/accounts", async original => ({ ...await original<typeof import("@/server/accounts")>(), accountRepository: () => repo }));
const base = "http://localhost";
function request(path: string, body?: unknown, token?: string, origin = base) {
  return new NextRequest(base + path, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "content-type": "application/json", ...(token ? { cookie: "second-self-session=" + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => { repo = new AccountRepository(":memory:"); });
afterEach(() => { repo.close(); });
describe("账号接口授权与会话", () => {
  it("注册签发安全Cookie，登录可取回本人资料", async () => {
    const response = await register(request("/api/account/register", { username: "person_a", password: "test-only-password", name: "我的日程" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const logged = await login(request("/api/account/login", { username: "PERSON_A", password: "test-only-password" }));
    expect((await logged.json()).snapshot.workspace.profile.name).toBe("我的日程");
  });
  it("未登录不能读取或写入账号数据", async () => {
    expect(GET(request("/api/account/workspace")).status).toBe(401);
    expect((await PUT(request("/api/account/workspace", {}))).status).toBe(401);
  });
  it("跨来源注册被拒绝", async () => {
    const response = await register(request("/api/account/register", { username: "person_a", password: "test-only-password", name: "名字" }, undefined, "https://outside.invalid"));
    expect(response.status).toBe(403);
  });
  it("账号不一致的写入被拒绝，revision过旧返回409", async () => {
    const a = await repo.register("person_a", "test-only-password", "名字"), b = await repo.register("person_b", "test-only-password", "名字B"), token = repo.createSession(a.user.id);
    const save = (accountId: string, revision: number) => PUT(request("/api/account/workspace", { accountId, workspace: a.workspace, revision }, token));
    expect((await save(b.user.id, 0)).status).toBe(401);
    expect((await save(a.user.id, 0)).status).toBe(200);
    expect((await save(a.user.id, 0)).status).toBe(409);
    expect(repo.snapshot(b.user.id).revision).toBe(0);
  });
  it("退出只撤销当前会话，服务端数据仍存在", async () => {
    const a = await repo.register("person_a", "test-only-password", "名字"), token = repo.createSession(a.user.id), other = repo.createSession(a.user.id);
    const response = await logout(request("/api/account/logout", { accountId: a.user.id }, token));
    expect(response.status).toBe(200);expect(repo.session(token)).toBeNull();expect(repo.session(other)?.user.id).toBe(a.user.id);expect(repo.snapshot(a.user.id).workspace.profile.name).toBe("名字");
  });
  it("三个AI入口都在调用模型前拒绝未登录请求", async () => {
    for (const [path, handler] of [["parse-tasks", parseText], ["parse-image", parseImage], ["replan", replan]] as const) {
      expect((await handler(request("/api/ai/" + path, {}))).status).toBe(401);
    }
  });
  it("登录后AI入口仍拒绝跨来源请求", async () => {
    const a = await repo.register("person_a", "test-only-password", "名字"), token = repo.createSession(a.user.id);
    expect((await parseText(request("/api/ai/parse-tasks", {}, token, "https://outside.invalid"))).status).toBe(403);
  });
});
