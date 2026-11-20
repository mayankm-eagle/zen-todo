import { describe, expect, it } from "vitest";
import { emptyData, mergeSync, remapIds } from "./merge";
import type { Task } from "./types";

const t = (id: string, p: Partial<Task> = {}): Task => ({
  id,
  project_id: "p",
  section_id: null,
  parent_id: null,
  content: id,
  description: "",
  priority: 1,
  due: null,
  labels: [],
  child_order: 0,
  checked: false,
  is_deleted: false,
  ...p,
});

describe("mergeSync", () => {
  it("replaces everything on a full sync", () => {
    const base = { ...emptyData(), items: { old: t("old") } };
    const out = mergeSync(base, { sync_token: "a", full_sync: true, items: [t("x")], projects: [], sections: [], labels: [] });
    expect(Object.keys(out.items)).toEqual(["x"]);
    expect(out.syncToken).toBe("a");
  });

  it("upserts and drops completed/deleted tasks on incremental sync", () => {
    const base = { ...emptyData(), items: { a: t("a"), b: t("b"), c: t("c") } };
    const out = mergeSync(base, {
      sync_token: "b",
      full_sync: false,
      items: [t("a", { content: "A!" }), t("b", { checked: true }), t("c", { is_deleted: true }), t("d")],
    });
    expect(out.items.a.content).toBe("A!");
    expect(out.items.b).toBeUndefined();
    expect(out.items.c).toBeUndefined();
    expect(out.items.d).toBeDefined();
  });

  it("keeps local edits that are still in flight", () => {
    const base = { ...emptyData(), items: { a: t("a", { priority: 4 }) } };
    const out = mergeSync(base, { sync_token: "c", full_sync: false, items: [t("a", { priority: 1 })] }, new Set(["a"]));
    expect(out.items.a.priority).toBe(4);
  });

  it("drops archived projects and sections", () => {
    const base = emptyData();
    const out = mergeSync(base, {
      sync_token: "d",
      full_sync: false,
      projects: [{ id: "p1", name: "x", parent_id: null, child_order: 0, is_archived: true }],
      sections: [{ id: "s1", name: "y", project_id: "p1", section_order: 0, is_deleted: true }],
    });
    expect(out.projects).toEqual({});
    expect(out.sections).toEqual({});
  });
});

describe("remapIds", () => {
  it("rewrites temp ids including parent references", () => {
    const base = { ...emptyData(), items: { tmp1: t("tmp1"), kid: t("kid", { parent_id: "tmp1" }) } };
    const out = remapIds(base, { tmp1: "real1" });
    expect(out.items.real1).toBeDefined();
    expect(out.items.kid.parent_id).toBe("real1");
  });
});
