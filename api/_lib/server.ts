// Server-side helpers shared by the /api routes (Vercel functions and the Vite
// dev server). The Todoist token lives only here, in TODOIST_API_TOKEN.
import { createHmac, timingSafeEqual } from "node:crypto";

const TODOIST = "https://api.todoist.com/api/v1";
const COOKIE = "zen_session";
const YEAR = 60 * 60 * 24 * 365;

const env = (k: string) => process.env[k]?.trim() || "";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

function sessionValue(): string {
  // Derived from the password, so changing APP_PASSWORD signs everyone out.
  return createHmac("sha256", env("APP_PASSWORD")).update("zen-session-v1").digest("base64url");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

const authed = (req: Request) => !!env("APP_PASSWORD") && same(readCookie(req, COOKIE), sessionValue());

function misconfigured(): Response | null {
  const missing = ["TODOIST_API_TOKEN", "APP_PASSWORD"].filter((k) => !env(k));
  return missing.length ? json({ error: `Server is missing ${missing.join(" and ")}.`, missing }, 503) : null;
}

// Cross-site requests can't send this header without a CORS preflight we never
// approve, so together with SameSite=Strict it shuts out CSRF.
const fromApp = (req: Request) => req.headers.get("x-zen") === "1";

const cookie = (value: string, maxAge: number, req: Request) => {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
};

export async function session(req: Request): Promise<Response> {
  const bad = misconfigured();
  if (bad) return bad;
  return authed(req) ? json({ ok: true }) : json({ error: "Sign in" }, 401);
}

export async function login(req: Request): Promise<Response> {
  const bad = misconfigured();
  if (bad) return bad;
  if (req.method !== "POST" || !fromApp(req)) return json({ error: "Bad request" }, 400);
  let password = "";
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? "");
  } catch {
    /* fall through */
  }
  if (!same(password, env("APP_PASSWORD"))) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json({ error: "That's not it." }, 401);
  }
  return json({ ok: true }, 200, { "set-cookie": cookie(sessionValue(), YEAR, req) });
}

export async function logout(req: Request): Promise<Response> {
  return json({ ok: true }, 200, { "set-cookie": cookie("", 0, req) });
}

async function relay(req: Request, path: string, contentType: string): Promise<Response> {
  const bad = misconfigured();
  if (bad) return bad;
  if (req.method !== "POST" || !fromApp(req)) return json({ error: "Bad request" }, 400);
  if (!authed(req)) return json({ error: "Sign in" }, 401);
  const upstream = await fetch(`${TODOIST}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("TODOIST_API_TOKEN")}`, "content-type": contentType },
    body: await req.text(),
  });
  // Todoist rejecting our token is a server config problem, not the visitor's session.
  const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
  const body = status === 502 ? JSON.stringify({ error: "Todoist rejected TODOIST_API_TOKEN." }) : await upstream.text();
  return new Response(body, {
    status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

/** Completed tasks in a date range, for the Done tab. Only whitelisted query params pass through. */
export async function completed(req: Request): Promise<Response> {
  const bad = misconfigured();
  if (bad) return bad;
  if (req.method !== "GET" || !fromApp(req)) return json({ error: "Bad request" }, 400);
  if (!authed(req)) return json({ error: "Sign in" }, 401);
  const inUrl = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const k of ["since", "until", "cursor", "limit"]) {
    const v = inUrl.get(k);
    if (v) out.set(k, v);
  }
  const upstream = await fetch(`${TODOIST}/tasks/completed/by_completion_date?${out}`, {
    headers: { authorization: `Bearer ${env("TODOIST_API_TOKEN")}` },
  });
  const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
  const body = status === 502 ? JSON.stringify({ error: "Todoist rejected TODOIST_API_TOKEN." }) : await upstream.text();
  return new Response(body, { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const sync = (req: Request) => relay(req, "/sync", "application/x-www-form-urlencoded");
export const quick = (req: Request) => relay(req, "/tasks/quick", "application/json");

export const routes: Record<string, (req: Request) => Promise<Response>> = {
  "/api/session": session,
  "/api/login": login,
  "/api/logout": logout,
  "/api/sync": sync,
  "/api/quick": quick,
  "/api/completed": completed,
};
