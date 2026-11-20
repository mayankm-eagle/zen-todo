import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoTransport } from "./demo";
import { Store } from "./store";
import type { SyncRequest } from "./types";

// Minimal browser globals for the store.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  (globalThis as any).window = globalThis;
});
afterEach(() => {
  vi.useRealTimers();
});

async function ready() {
  const transport = new DemoTransport();
  const calls: SyncRequest[] = [];
  const sync = transport.sync.bind(transport);
  transport.sync = async (req) => {
    calls.push(structuredClone(req));
    const p = sync(req);
    await vi.advanceTimersByTimeAsync(200);
    return p;
  };
  const store = new Store(transport, null);
  await store.sync(true);
  return { store, calls, transport };
}

const settle = () => vi.advanceTimersByTimeAsync(500);

describe("Store", () => {
  it("loads from a full sync", async () => {
    const { store } = await ready();
    expect(store.getState().status).toBe("ready");
    expect(Object.keys(store.getState().items).length).toBeGreaterThan(5);
  });

  it("writes a priority change back as item_update", async () => {
    const { store, calls } = await ready();
    const task = Object.values(store.getState().items).find((t) => t.priority === 1)!;
    store.setPriority(task.id, 4);
    expect(store.getState().items[task.id].priority).toBe(4); // optimistic
    await settle();
    const cmd = calls.flatMap((c) => c.commands ?? []).find((c) => c.type === "item_update");
    expect(cmd?.args).toEqual({ id: task.id, priority: 4 });
    expect(store.getState().items[task.id].priority).toBe(4); // confirmed
    expect(store.getState().toast?.undo).toBeTypeOf("function");
  });

  it("undo restores the previous priority in Todoist", async () => {
    const { store, calls } = await ready();
    const task = Object.values(store.getState().items).find((t) => t.priority === 1)!;
    store.setPriority(task.id, 3);
    await settle();
    store.getState().toast!.undo!();
    await settle();
    const updates = calls.flatMap((c) => c.commands ?? []).filter((c) => c.type === "item_update");
    expect(updates.map((c) => c.args.priority)).toEqual([3, 1]);
    expect(store.getState().items[task.id].priority).toBe(1);
  });

  it("completes with item_close, lingers, then removes the task", async () => {
    const { store, calls } = await ready();
    const task = Object.values(store.getState().items).find((t) => !t.due?.is_recurring)!;
    store.complete(task.id);
    expect(store.getState().done[task.id]).toBeDefined();
    await settle();
    expect(calls.flatMap((c) => c.commands ?? []).some((c) => c.type === "item_close" && c.args.id === task.id)).toBe(true);
    expect(store.getState().items[task.id]).toBeDefined(); // still on screen
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().items[task.id]).toBeUndefined();
    expect(store.getState().done[task.id]).toBeUndefined();
  });

  it("keeps a recurring task with its next date after completing", async () => {
    const { store } = await ready();
    const task = Object.values(store.getState().items).find((t) => t.due?.is_recurring)!;
    const before = task.due!.date;
    store.complete(task.id);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    const after = store.getState().items[task.id];
    expect(after).toBeDefined();
    expect(after.checked).toBe(false);
    expect(after.due!.date > before).toBe(true);
  });

  it("quick-adds into the current project when no #project was typed", async () => {
    const { store, calls } = await ready();
    const done = store.add("Buy stamps tomorrow", { projectId: "home" });
    expect(Object.values(store.getState().items).some((t) => t.id.startsWith("tmp-"))).toBe(true); // placeholder
    await settle();
    await done;
    const move = calls.flatMap((c) => c.commands ?? []).find((c) => c.type === "item_move");
    expect(move?.args.project_id).toBe("home");
    const added = Object.values(store.getState().items).find((t) => t.content === "Buy stamps");
    expect(added?.project_id).toBe("home");
    expect(added?.due).not.toBeNull();
  });

  it("resyncs from scratch when Todoist rejects a command", async () => {
    const { store, calls } = await ready();
    store.update("does-not-exist", { content: "x" }); // no-op: unknown locally
    (store as any).send([{ type: "item_update", uuid: "u1", args: { id: "nope", content: "x" } }]);
    await settle();
    await settle();
    expect(calls.at(-1)?.sync_token).toBe("*");
    expect(store.getState().toast?.message).toMatch(/Couldn't save/);
  });
});
