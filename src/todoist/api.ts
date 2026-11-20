import type { SyncRequest, SyncResponse, Task, Transport } from "./types";

// Our own server relays to Todoist and adds the token (see api/_lib/server.ts).
const BASE = "/api";

export class TodoistError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Talks to Todoist through the app's /api relay. The browser never sees the token. */
export class HttpTransport implements Transport {
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { "x-zen": "1", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body?.error ?? detail;
      } catch {
        /* not JSON */
      }
      throw new TodoistError(detail || `HTTP ${res.status}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  sync(req: SyncRequest): Promise<SyncResponse> {
    // /sync wants application/x-www-form-urlencoded with JSON-encoded values.
    const body = new URLSearchParams();
    body.set("sync_token", req.sync_token);
    body.set("resource_types", JSON.stringify(req.resource_types));
    if (req.commands?.length) body.set("commands", JSON.stringify(req.commands));
    return this.request<SyncResponse>("/sync", { method: "POST", body });
  }

  quickAdd(text: string): Promise<Task> {
    return this.request<Task>("/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export type SessionState = "in" | "out" | { missing: string[] } | { error: string };

export async function checkSession(): Promise<SessionState> {
  try {
    const res = await fetch(`${BASE}/session`, { credentials: "same-origin", cache: "no-store" });
    if (res.ok) return "in";
    if (res.status === 401) return "out";
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && Array.isArray(body.missing)) return { missing: body.missing };
    return { error: body.error ?? `Server error ${res.status}` };
  } catch {
    return { error: "Can't reach the server." };
  }
}

export async function login(password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-zen": "1" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.error ?? "Couldn't sign in.";
}

export async function logout() {
  await fetch(`${BASE}/logout`, { method: "POST", credentials: "same-origin", headers: { "x-zen": "1" } }).catch(() => {});
}
