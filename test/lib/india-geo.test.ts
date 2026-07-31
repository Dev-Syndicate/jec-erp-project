// India geo reference data (src/lib/india-geo.ts) — served from bundled JSON, not
// the DB. Student addresses store state/district BY NAME, so a lookup that quietly
// returns [] would silently strand an address form.
import { describe, it, expect } from "vitest";

import { listStates, listDistricts, INDIA } from "@/lib/india-geo";

describe("listStates", () => {
  it("returns a non-trivial list", () => {
    expect(listStates().length).toBeGreaterThan(25);
  });

  it("is sorted alphabetically", () => {
    const states = listStates();
    expect(states).toEqual([...states].sort((a, b) => a.localeCompare(b)));
  });

  it("contains no duplicates or blanks", () => {
    const states = listStates();
    expect(new Set(states).size).toBe(states.length);
    expect(states.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("includes Tamil Nadu — the college's own state", () => {
    expect(listStates()).toContain("Tamil Nadu");
  });
});

describe("listDistricts", () => {
  it("returns districts for a known state", () => {
    const districts = listDistricts("Tamil Nadu");
    expect(districts.length).toBeGreaterThan(10);
    expect(districts).toContain("Chennai");
  });

  it("is sorted alphabetically", () => {
    const districts = listDistricts("Tamil Nadu");
    expect(districts).toEqual([...districts].sort((a, b) => a.localeCompare(b)));
  });

  it("matches the state name case-insensitively", () => {
    const canonical = listDistricts("Tamil Nadu");
    expect(listDistricts("tamil nadu")).toEqual(canonical);
    expect(listDistricts("TAMIL NADU")).toEqual(canonical);
  });

  it("returns [] for an unknown state rather than throwing", () => {
    expect(listDistricts("Atlantis")).toEqual([]);
    expect(listDistricts("")).toEqual([]);
  });

  it("does not mutate the underlying dataset when sorting", () => {
    // listDistricts sorts a copy; calling it twice must give the same answer.
    const first = listDistricts("Tamil Nadu");
    const second = listDistricts("Tamil Nadu");
    expect(first).toEqual(second);
  });

  it("every listed state resolves to at least one district", () => {
    const empty = listStates().filter((s) => listDistricts(s).length === 0);
    expect(empty).toEqual([]);
  });
});

describe("INDIA", () => {
  it("is the implicit country constant", () => {
    expect(INDIA).toBe("India");
  });
});
