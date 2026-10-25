import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AccountRepository } from "@/server/accounts";
import { AccountWorkspaceSchema, CredentialsSchema, RegisterSchema } from "@/domain/account";
let repo: AccountRepository, directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(os.tmpdir(), "second-self-auth-")); repo = new AccountRepository(path.join(directory, "accounts.sqlite")); });
afterEach(() => { repo.close(); rmSync(directory, { recursive: true, force: true }); });
describe("账号与持久化隔离", () => {
  it("校验账号、密码与昵称，并规范账号大小写", () => {
    expect(CredentialsSchema.parse({ username: "My_Account", password: "valid-pass-123" }).username).toBe("my_account");
    expect(CredentialsSchema.safeParse({ username: "../x", password: "123" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ username: "valid", password: "12345678", name: "" }).success).toBe(false);
  });
  it("注册重复账号拒绝且不会破坏原数据", async () => {
    const first = await repo.register("person_a", "test-secret-123", "昵称A");
    await expect(repo.register("person_a", "different-pass", "昵称B")).rejects.toMatchObject({ status: 409 });
    expect((await repo.login("person_a", "test-secret-123")).user.id).toBe(first.user.id);
  });
  it("错误密码与不存在账号均拒绝，不返回密码摘要", async () => {
    await repo.register("person_a", "test-secret-123", "昵称A");
    await expect(repo.login("person_a", "wrong-pass")).rejects.toMatchObject({ status: 401 });
    await expect(repo.login("missing", "wrong-pass")).rejects.toMatchObject({ status: 401 });
    expect(JSON.stringify(await repo.login("person_a", "test-secret-123"))).not.toMatch(/password|salt/);
  });
  it("服务端保存会话摘要，退出后原token失效", async () => {
    const account = await repo.register("person_a", "test-secret-123", "昵称A"), token = repo.createSession(account.user.id);
    expect(repo.session(token)?.user.id).toBe(account.user.id);
    expect(repo.session("random-invalid")).toBeNull();
    repo.logout(token); expect(repo.session(token)).toBeNull();
  });
  it("两个账号数据独立，旧revision写入不能覆盖新数据", async () => {
    const a = await repo.register("person_a", "test-secret-123", "昵称A"), b = await repo.register("person_b", "test-secret-456", "昵称B");
    const workspace = { ...a.workspace, profile: { ...a.workspace.profile, name: "新昵称" } };
    expect(repo.save(a.user.id, workspace, 0).revision).toBe(1);
    expect(repo.snapshot(b.user.id).workspace.profile.name).toBe("昵称B");
    expect(() => repo.save(a.user.id, a.workspace, 0)).toThrow();
    expect(repo.snapshot(a.user.id).workspace.profile.name).toBe("新昵称");
  });
  it("重开数据库仍可登录并找回任务和头像", async () => {
    const account = await repo.register("person_a", "test-secret-123", "昵称A");
    const workspace = { ...account.workspace, profile: { name: "保存的我", avatar: "/avatars/avatar-3.webp" } };
    repo.save(account.user.id, workspace, 0);repo.close();repo = new AccountRepository(path.join(directory, "accounts.sqlite"));
    const restored = await repo.login("person_a", "test-secret-123");
    expect(restored.workspace.profile).toEqual(workspace.profile);expect(restored.revision).toBe(1);
  });
  it("数据库不保存明文密码，调用限流可阻止持续尝试", async () => {
    await repo.register("person_a", "never-store-plaintext", "昵称A");
    const bytes = Buffer.concat([readFileSync(path.join(directory, "accounts.sqlite")), readFileSync(path.join(directory, "accounts.sqlite-wal"))]);
    expect(bytes.includes(Buffer.from("never-store-plaintext"))).toBe(false);
    expect(repo.allowAttempt("login:test", 2)).toBe(true);expect(repo.allowAttempt("login:test", 2)).toBe(true);expect(repo.allowAttempt("login:test", 2)).toBe(false);
  });
  it("拒绝无效头像与不合法任务，不写脏数据", async () => {
    const account = await repo.register("person_a", "test-secret-123", "昵称A");
    expect(AccountWorkspaceSchema.safeParse({ ...account.workspace, profile: { name: "昵称A", avatar: "https://tracking.example/avatar.png" } }).success).toBe(false);
    expect(() => repo.save(account.user.id, { ...account.workspace, planner: { ...account.workspace.planner, tasks: [{ id: "bad" }] } } as never, 0)).toThrow();
    expect(repo.snapshot(account.user.id).revision).toBe(0);
  });
});
