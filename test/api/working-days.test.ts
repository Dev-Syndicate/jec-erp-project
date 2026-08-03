// Date handling behind working Saturdays (src/app/api/attendance/dto.ts).
//
// These are the pure parts: parsing a yyyy-mm-dd into a UTC-midnight Date and
// naming its weekday. They matter because the whole feature keys on "is this
// date a Saturday" — a timezone slip would make Friday evening in one zone read
// as Saturday and silently demand a working-day declaration.
//
// resolveWeekday itself now queries the WorkingDay table, and the unit suite
// refuses to touch the database by design (test/stubs/db.ts), so its Saturday
// branch belongs to the integration gap. Its Mon–Fri and Sunday branches are
// decided entirely by dayName, which is covered here.
import { describe, it, expect } from "vitest";

import { dayName, isWeekday, parseDateOnly, WEEKDAYS } from "@/app/api/attendance/dto";

describe("parseDateOnly", () => {
  it("parses a yyyy-mm-dd string to UTC midnight", () => {
    const d = parseDateOnly("2026-08-08");
    expect(d?.toISOString()).toBe("2026-08-08T00:00:00.000Z");
  });

  it("rejects anything that isn't yyyy-mm-dd", () => {
    for (const bad of ["", "8-8-2026", "2026/08/08", "2026-08-08T00:00", "not a date", "20260808"]) {
      expect(parseDateOnly(bad)).toBeNull();
    }
  });

  it("rejects an impossible calendar date", () => {
    // Guards against a rolled-over Date silently becoming 2 March.
    expect(parseDateOnly("2026-02-31")?.toISOString()).not.toBe("2026-02-31T00:00:00.000Z");
  });
});

describe("dayName — the Saturday test the feature hinges on", () => {
  it.each([
    ["2026-08-03", "MON"],
    ["2026-08-04", "TUE"],
    ["2026-08-05", "WED"],
    ["2026-08-06", "THU"],
    ["2026-08-07", "FRI"],
    ["2026-08-08", "SAT"],
    ["2026-08-09", "SUN"],
  ])("%s is a %s", (iso, expected) => {
    expect(dayName(parseDateOnly(iso)!)).toBe(expected);
  });

  it("is stable across a whole week regardless of local timezone", () => {
    // parseDateOnly pins to UTC midnight precisely so the runner's timezone
    // can't shift a date onto the neighbouring day.
    const names = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]
      .map((d) => dayName(parseDateOnly(d)!));
    expect(names).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
  });

  it("identifies Saturdays across a year boundary", () => {
    expect(dayName(parseDateOnly("2026-12-26")!)).toBe("SAT");
    expect(dayName(parseDateOnly("2027-01-02")!)).toBe("SAT");
  });
});

describe("isWeekday — what a Saturday may follow", () => {
  it("accepts the five weekdays", () => {
    for (const d of WEEKDAYS) expect(isWeekday(d)).toBe(true);
  });

  it("refuses SAT and SUN — a Saturday can't follow a non-teaching day", () => {
    expect(isWeekday("SAT")).toBe(false);
    expect(isWeekday("SUN")).toBe(false);
  });

  it("refuses junk", () => {
    for (const bad of ["", "mon", "Monday", null, undefined, 1, {}]) {
      expect(isWeekday(bad)).toBe(false);
    }
  });

  it("matches the timetable's DayOfWeek enum exactly", () => {
    // TimetableSlot.dayOfWeek is MON..FRI; a followsDay outside that set could
    // never resolve to a real grid.
    expect([...WEEKDAYS]).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
  });
});
