import { describe, expect, it } from "vitest";
import { generateDoseTimes } from "./schedule.js";

describe("generateDoseTimes", () => {
  it("generates one entry per time-of-day per day in range, every day when daysOfWeek is empty", () => {
    const start = new Date("2026-01-01T00:00:00");
    const end = new Date("2026-01-03T23:59:59");
    const times = generateDoseTimes(
      { timesOfDay: ["08:00", "20:00"], daysOfWeek: [], windowMinutes: 60 },
      start,
      end,
    );
    expect(times).toHaveLength(6); // 3 days x 2 times
    expect(times[0]?.scheduledAt.getHours()).toBe(8);
    expect(times[1]?.scheduledAt.getHours()).toBe(20);
  });

  it("sets windowEndsAt windowMinutes after scheduledAt", () => {
    const start = new Date("2026-01-01T00:00:00");
    const end = new Date("2026-01-01T23:59:59");
    const [dose] = generateDoseTimes({ timesOfDay: ["08:00"], daysOfWeek: [], windowMinutes: 45 }, start, end);
    expect(dose).toBeDefined();
    expect(dose!.windowEndsAt.getTime() - dose!.scheduledAt.getTime()).toBe(45 * 60_000);
  });

  it("only includes matching days of week", () => {
    // 2026-01-01 is a Thursday (day 4).
    const start = new Date("2026-01-01T00:00:00");
    const end = new Date("2026-01-07T23:59:59");
    const times = generateDoseTimes({ timesOfDay: ["09:00"], daysOfWeek: [4], windowMinutes: 60 }, start, end);
    expect(times).toHaveLength(1);
    expect(times[0]?.scheduledAt.getDay()).toBe(4);
  });

  it("excludes times outside the range boundary even on a boundary day", () => {
    const start = new Date("2026-01-01T12:00:00");
    const end = new Date("2026-01-01T23:59:59");
    const times = generateDoseTimes({ timesOfDay: ["08:00", "18:00"], daysOfWeek: [], windowMinutes: 60 }, start, end);
    expect(times).toHaveLength(1);
    expect(times[0]?.scheduledAt.getHours()).toBe(18);
  });

  it("returns an empty array when rangeStart is after rangeEnd", () => {
    const times = generateDoseTimes(
      { timesOfDay: ["08:00"], daysOfWeek: [], windowMinutes: 60 },
      new Date("2026-01-02"),
      new Date("2026-01-01"),
    );
    expect(times).toEqual([]);
  });
});
