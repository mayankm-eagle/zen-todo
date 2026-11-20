import { describe, expect, it } from "vitest";
import { estimate, isShallow, shallowTasks } from "./select";
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

describe("shallow selectors", () => {
  it("matches the label case-insensitively", () => {
    expect(isShallow(t("a", { labels: ["Shallow"] }))).toBe(true);
    expect(isShallow(t("a", { labels: ["deep"] }))).toBe(false);
  });

  it("estimates from Todoist durations, else 10 minutes", () => {
    expect(estimate(t("a"))).toBe(10);
    expect(estimate(t("a", { duration: { amount: 25, unit: "minute" } }))).toBe(25);
  });

  it("lists dated shallow tasks first, then by priority", () => {
    const items = {
      a: t("a", { labels: ["shallow"], priority: 4 }),
      b: t("b", { labels: ["shallow"], due: { date: "2026-11-25", string: "", timezone: null, is_recurring: false } }),
      c: t("c", { labels: ["shallow"], priority: 1 }),
      d: t("d"),
    };
    expect(shallowTasks({ items, done: {} }).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});
