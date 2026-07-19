// India geo reference data — served from the bundled JSON, NOT the database.
//
// States/districts are static reference data that never meaningfully change, so
// there's no reason to seed 700+ rows into Neon (that also made the seed crawl).
// We read the bundled dataset directly. India-only; the country is implicitly
// "India" (student addresses store state/district by name, not FK ids).
//
// server-only: the JSON is a ~700-district file — importing it here keeps it in
// the API layer and out of the client bundle.
import "server-only";

import data from "@/data/india-states-districts.json";

export const INDIA = "India";

type GeoData = { states: Array<{ state: string; districts: string[] }> };
const geo = data as GeoData;

// State names, sorted.
export function listStates(): string[] {
  return geo.states.map((s) => s.state).sort((a, b) => a.localeCompare(b));
}

// Districts for a given state name, sorted. Unknown state → [].
export function listDistricts(state: string): string[] {
  const match = geo.states.find((s) => s.state.toLowerCase() === state.toLowerCase());
  return match ? [...match.districts].sort((a, b) => a.localeCompare(b)) : [];
}
