import type { SyncRequest, SyncResponse, Task, Transport } from "./types";

const BASE = "https://api.todoist.com/api/v1";

export class TodoistError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Talks to Todoist directly from the browser (the API sends CORS headers for
 * personal tokens). The token never leaves this browser except to Todoist.
 */
export class HttpTransport implements Transport {
  constructor(private token: string) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
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
    return this.request<Task>("/tasks/quick", {
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
