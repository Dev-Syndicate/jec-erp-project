// GET /api/lookups/geo?stateId=…  → districts for a state
// GET /api/lookups/geo?countryId=… → states for a country
//
// The address dropdowns cascade, so we fetch one level at a time instead of
// shipping every state+district on form load. Authenticated (reference data,
// but still behind the token boundary).
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authenticate(req);
    const { searchParams } = new URL(req.url);
    const countryId = searchParams.get("countryId");
    const stateId = searchParams.get("stateId");

    if (stateId) {
      const districts = await db.district.findMany({
        where: { stateId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return Response.json({ districts });
    }
    if (countryId) {
      const states = await db.state.findMany({
        where: { countryId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return Response.json({ states });
    }
    return Response.json({ error: "Provide countryId or stateId." }, { status: 400 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
