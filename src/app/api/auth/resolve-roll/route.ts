// POST /api/auth/resolve-roll — translate a student register number into the
// email Firebase authenticates against.
//
// Students log in with register number + password, but Firebase identity is the
// student's real email. So before Firebase sign-in the client resolves
// registerNumber → email here, then signs in with that email + password.
//
// This endpoint is UNAUTHENTICATED by necessity — the student isn't signed in
// yet. It therefore reveals as little as possible:
//   - It returns the email ONLY for an active student whose register no matches.
//   - Knowing the email does not grant access: the caller still needs the
//     password, and every downstream API route re-verifies the Firebase token.
//   - It does not distinguish "no such register number" from "inactive" in the
//     error, to avoid confirming which register numbers exist.
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = { registerNumber?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const registerNumber = body?.registerNumber?.trim();
  if (!registerNumber) {
    return Response.json({ error: "Enter your register number." }, { status: 400 });
  }

  const student = await db.student.findUnique({
    where: { registerNumber },
    include: { user: true },
  });

  // Same generic message whether the register number is unknown, the student has
  // left, or their account is inactive — don't leak which numbers exist.
  // The password check (Firebase) is the real gate regardless.
  if (!student || student.status !== "ACTIVE" || student.user.status !== "ACTIVE") {
    return Response.json(
      { error: "We couldn't find an active account for that register number." },
      { status: 404 },
    );
  }

  return Response.json({ email: student.user.email });
}
