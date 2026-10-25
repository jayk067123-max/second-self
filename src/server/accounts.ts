import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { AccountWorkspaceSchema, emptyAccountWorkspace, type AccountSnapshot, type AccountWorkspace } from "@/domain/account";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export class AccountError extends Error { constructor(public status: number, message: string) { super(message); } }
function passwordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export class AccountRepository {
  private db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS workspaces(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS auth_attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);");
  }
  close() { this.db.close(); }
  health() {
    this.db.prepare("SELECT revision FROM workspaces LIMIT 1").get();
    this.db.exec("SAVEPOINT health; UPDATE workspaces SET revision = revision WHERE 0; RELEASE health;");
  }
  async register(username: string, password: string, name: string): Promise<AccountSnapshot> {
    const salt = randomBytes(24).toString("hex"), hash = (await passwordKey(password, salt)).toString("hex"), id = randomUUID(), now = new Date().toISOString();
    const workspace = emptyAccountWorkspace(name);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.db.prepare("SELECT id FROM users WHERE username = ?").get(username)) throw new AccountError(409, "这个账号已注册，请换一个或直接登录");
      this.db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run(id, username, salt, hash, now);
      this.db.prepare("INSERT INTO workspaces VALUES (?, ?, 0, ?)").run(id, JSON.stringify(workspace), now);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { user: { id, username }, workspace, revision: 0, updatedAt: now };
  }
  async login(username: string, password: string): Promise<AccountSnapshot> {
    const user = this.db.prepare("SELECT id, salt, password_hash FROM users WHERE username = ?").get(username) as { id: string; salt: string; password_hash: string } | undefined;
    const key = await passwordKey(password, user?.salt ?? "second-self-missing-user-salt");
    if (!user || !timingSafeEqual(key, Buffer.from(user.password_hash, "hex"))) throw new AccountError(401, "账号或密码不正确");
    return this.snapshot(user.id);
  }
  createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    this.db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(digest(token), userId, Date.now() + SESSION_MS);
    return token;
  }
  session(token: string | undefined): AccountSnapshot | null {
    if (!token || token.length > 128) return null;
    const row = this.db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(digest(token), Date.now()) as { user_id: string } | undefined;
    return row ? this.snapshot(row.user_id) : null;
  }
  logout(token: string | undefined) { if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest(token)); }
  snapshot(userId: string): AccountSnapshot {
    const row = this.db.prepare("SELECT users.id, users.username, workspaces.document, workspaces.revision, workspaces.updated_at FROM users JOIN workspaces ON users.id = workspaces.user_id WHERE users.id = ?").get(userId) as { id: string; username: string; document: string; revision: number; updated_at: string } | undefined;
    if (!row) throw new AccountError(401, "请重新登录");
    return { user: { id: row.id, username: row.username }, workspace: AccountWorkspaceSchema.parse(JSON.parse(row.document)), revision: row.revision, updatedAt: row.updated_at };
  }
  save(userId: string, workspace: AccountWorkspace, revision: number): { revision: number; updatedAt: string } {
    const valid = AccountWorkspaceSchema.parse(workspace), updatedAt = new Date().toISOString();
    const result = this.db.prepare("UPDATE workspaces SET document = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?").run(JSON.stringify(valid), updatedAt, userId, revision);
    if (result.changes !== 1) throw new AccountError(409, "另一处已更新日程，请先处理同步冲突");
    return { revision: revision + 1, updatedAt };
  }
  allowAttempt(key: string, max: number, windowMs = 15 * 60 * 1000): boolean {
    const now = Date.now();
    this.db.prepare("DELETE FROM auth_attempts WHERE reset_at <= ?").run(now);
    const row = this.db.prepare("INSERT INTO auth_attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count").get(digest(key), now + windowMs) as { count: number };
    return row.count <= max;
  }
}
let repository: AccountRepository | undefined;
export function accountRepository(): AccountRepository {
  return repository ??= new AccountRepository(path.join(process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), "data"), "accounts.sqlite"));
}
