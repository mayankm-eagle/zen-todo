import { describe, expect, it } from "vitest";
import { dueDay, dueLabel, dueMinutes, isOverdue } from "./dates";

const due = (date: string, timezone: string | null = null) => ({ date, timezone, string: "", is_recurring: false });
const now = new Date(2026, 10, 20, 12, 0); // Fri Nov 20 2026, noon local

describe("dates", () => {
  it("reads all-day and floating dates as local days", () => {
    expect(dueDay(due("2026-11-21"))).toBe("2026-11-21");
    expect(dueDay(due("2026-11-21T09:30:00"))).toBe("2026-11-21");
    expect(dueMinutes(due("2026-11-21T09:30:00"))).toBe(570);
    expect(dueMinutes(due("2026-11-21"))).toBeNull();
  });

  it("labels relative days", () => {
    expect(dueLabel(due("2026-11-20"), now)).toBe("Today");
    expect(dueLabel(due("2026-11-20T15:00:00"), now)).toBe("3pm");
    expect(dueLabel(due("2026-11-21T09:30:00"), now)).toBe("Tomorrow 9:30am");
    expect(dueLabel(due("2026-11-19"), now)).toBe("Yesterday");
    expect(dueLabel(due("2026-11-24"), now)).toBe("Tuesday");
    expect(dueLabel(due("2026-12-25"), now)).toBe("Dec 25");
  });

  it("knows what is overdue", () => {
    expect(isOverdue(due("2026-11-19"), now)).toBe(true);
    expect(isOverdue(due("2026-11-20"), now)).toBe(false);
    expect(isOverdue(due("2026-11-20T09:00:00"), now)).toBe(true);
    expect(isOverdue(due("2026-11-20T18:00:00"), now)).toBe(false);
  });
});
