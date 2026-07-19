// GET /api/lookups/geo            → all Indian states
// GET /api/lookups/geo?state=Tamil Nadu → districts for that state
//
// Served from the bundled JSON (src/lib/india-geo), not the DB — states/districts
// are static reference data. The cascade fetches one level at a time so the form
// doesn't ship every district up front. Authenticated (behind the token boundary).
import { authenticate, toAuthResponse } from "@/lib/auth";
import { listDistricts, listStates } from "@/lib/india-geo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authenticate(req);
    const state = new URL(req.url).searchParams.get("state");

    if (state) {
      return Response.json({ districts: listDistricts(state) });
    }
    return Response.json({ states: listStates() });
  } catch (err) {
    return toAuthResponse(err);
  }
}
