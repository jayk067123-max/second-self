import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccountRepository } from "@/server/accounts";
import { POST as parseText } from "@/app/api/ai/parse-tasks/route";
import { POST as parseImage } from "@/app/api/ai/parse-image/route";
import { POST as replan } from "@/app/api/ai/replan/route";
import { ParseTasksResponseSchema, ReplanResponseSchema } from "@/domain/schemas/api";

let repo: AccountRepository;
let token: string;
const model = vi.hoisted(() => vi.fn());
vi.mock("@/server/accounts", async original => ({ ...await original<typeof import("@/server/accounts")>(), accountRepository: () => repo }));
vi.mock("@/ai/tasks", () => ({ parseTasksFromText: model, parseTasksFromImage: model, replanForDay: model }));
vi.mock("@/ai/client", () => ({ readAiConfig: () => ({ mode: "demo" }) }));

const endpoints = [
  { name: "parse-tasks", handler: parseText, limit: 64_000, schema: ParseTasksResponseSchema },
  { name: "parse-image", handler: parseImage, limit: 3_210_000, schema: ParseTasksResponseSchema },
  { name: "replan", handler: replan, limit: 6_000_000, schema: ReplanResponseSchema },
] as const;

beforeEach(async () => {
  model.mockReset();
  repo = new AccountRepository(":memory:");
  const account = await repo.register("body_limits", "test-only-password", "测试");
  token = repo.createSession(account.user.id);
});
afterEach(() => repo.close());

const headers = () => ({ Origin: "http://localhost", "content-type": "application/json", cookie: "second-self-session=" + token });

describe("AI入口请求体上限", () => {
  it.each(endpoints)("$name 在读取声明超限的请求前返回413", async ({ name, handler, limit, schema }) => {
    const request = new NextRequest("http://localhost/api/ai/" + name, { method: "POST", headers: { ...headers(), "content-length": String(limit + 1) }, body: "{}" });
    const response = await handler(request);
    expect(response.status).toBe(413);
    expect(schema.safeParse(await response.json()).success).toBe(true);
    expect(request.bodyUsed).toBe(false);
    expect(model).not.toHaveBeenCalled();
  });

  it.each(endpoints)("$name 对未声明长度的流同样限长并取消读取", async ({ name, handler, limit }) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(limit + 1)); }, cancel });
    const init = { method: "POST", headers: headers(), body: stream, duplex: "half" as const };
    const request = new NextRequest("http://localhost/api/ai/" + name, init);
    const response = await handler(request);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(model).not.toHaveBeenCalled();
  });

  it("合法大小的坏JSON返回400而不是500", async () => {
    const request = new NextRequest("http://localhost/api/ai/parse-tasks", { method: "POST", headers: headers(), body: "{broken" });
    const response = await parseText(request);
    expect(response.status).toBe(400);
    expect(ParseTasksResponseSchema.safeParse(await response.json()).success).toBe(true);
    expect(model).not.toHaveBeenCalled();
  });
});
