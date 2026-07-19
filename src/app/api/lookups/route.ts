// GET /api/lookups — reference data for admission-form dropdowns.
//
// Returns the small optional lookups (religions, categories, castes). Geo
// (states/districts) is served separately from JSON (see the geo route), not
// the DB — so it's not here.
//
// Authenticated (any signed-in user) — this is non-sensitive reference data, but
// it still goes through the same verify-token boundary as every route.
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authenticate(req);
    const [religions, categories, castes] = await Promise.all([
      db.religion.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.caste.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return Response.json({ religions, categories, castes });
  } catch (err) {
    return toAuthResponse(err);
  }
}
