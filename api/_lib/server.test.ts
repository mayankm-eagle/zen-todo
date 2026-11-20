import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completed, login, quick, session, sync } from "./server";

const ORIGIN = "https://zen.example.com";
const req = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(init.cookie ? { cookie: init.cookie } : {}) },
  });
const app = { "x-zen": "1" };

async function signIn(password = "hunter2") {
  const res = await login(req("/api/login", { method: "POST", headers: { ...app, "content-type": "application/json" }, body: JSON.stringify({ password }) }));
  const set = res.headers.get("set-cookie") ?? "";
  return { res, cookie: set.split(";")[0], set };
}

beforeEach(() => {
  process.env.TODOIST_API_TOKEN = "secret-token";
  process.env.APP_PASSWORD = "hunter2";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TODOIST_API_TOKEN;
  delete process.env.APP_PASSWORD;
});

describe("auth", () => {
  it("reports missing configuration", async () => {
    delete process.env.TODOIST_API_TOKEN;
    const res = await session(req("/api/session"));
    expect(res.status).toBe(503);
    expect((await res.json()).missing).toEqual(["TODOIST_API_TOKEN"]);
  });

  it("rejects a wrong password", async () => {
    const { res } = await signIn("nope");
    expect(res.status).toBe(401);
  });

  it("sets an HttpOnly, SameSite=Strict, Secure session cookie", async () => {
    const { res, set, cookie } = await signIn();
    expect(res.status).toBe(200);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toMatch(/Secure/);
    expect(set).not.toContain("hunter2");
    expect((await session(req("/api/session", { cookie }))).status).toBe(200);
  });

  it("signs everyone out when the password changes", async () => {
    const { cookie } = await signIn();
    process.env.APP_PASSWORD = "new-password";
    expect((await session(req("/api/session", { cookie }))).status).toBe(401);
  });

  it("refuses login without the app header (CSRF)", async () => {
    const res = await login(req("/api/login", { method: "POST", body: JSON.stringify({ password: "hunter2" }) }));
    expect(res.status).toBe(400);
  });
});

describe("relay", () => {
  it("refuses unauthenticated requests without calling Todoist", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await sync(req("/api/sync", { method: "POST", headers: app, body: "sync_token=*" }));
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("forwards /sync with the server's token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"sync_token":"x"}', { headers: { "content-type": "application/json" } }));
    const { cookie } = await signIn();
    const res = await sync(req("/api/sync", { method: "POST", headers: app, cookie, body: "sync_token=*&resource_types=%5B%22items%22%5D" }));
    expect(res.status).toBe(200);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.todoist.com/api/v1/sync");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
    expect(init.body).toBe("sync_token=*&resource_types=%5B%22items%22%5D");
  });

  it("forwards quick add as JSON", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"1"}'));
    const { cookie } = await signIn();
    await quick(req("/api/quick", { method: "POST", headers: app, cookie, body: '{"text":"hi"}' }));
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.todoist.com/api/v1/tasks/quick");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("does not leak a bad server token as a visitor sign-out", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":"Unauthorized"}', { status: 401 }));
    const { cookie } = await signIn();
    const res = await sync(req("/api/sync", { method: "POST", headers: app, cookie, body: "" }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret-token");
  });

  it("forwards only whitelisted params for completed tasks", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"items":[],"next_cursor":null}'));
    const { cookie } = await signIn();
    const res = await completed(req("/api/completed?since=2026-11-01T00:00:00Z&until=2026-11-20T00:00:00Z&project_id=x&evil=1", { headers: app, cookie }));
    expect(res.status).toBe(200);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.todoist.com/api/v1/tasks/completed/by_completion_date?since=2026-11-01T00%3A00%3A00Z&until=2026-11-20T00%3A00%3A00Z");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
  });
});
