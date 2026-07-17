// POST /api/auth/resolve-roll — translate a student roll number into the email
// Firebase authenticates against.
//
// Students log in with roll number + password (PRD line 48), but Firebase
// identity is the student's real email. So before Firebase sign-in the client
// resolves rollNumber → email here, then signs in with that email + password.
//
// This endpoint is UNAUTHENTICATED by necessity — the student isn't signed in
// yet. It therefore reveals as little as possible:
//   - It returns the email ONLY for an active student whose roll number matches.
//   - Knowing the email does not grant access: the caller still needs the
//     password, and every downstream API route re-verifies the Firebase token.
//   - It does not distinguish "no such roll number" from "inactive" in the
//     error, to avoid confirming which roll numbers exist.
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = { rollNumber?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const rollNumber = body?.rollNumber?.trim();
  if (!rollNumber) {
    return Response.json({ error: "Enter your roll number." }, { status: 400 });
  }

  const student = await db.student.findUnique({
    where: { rollNumber },
    include: { user: true },
  });

  // Same generic message whether the roll number is unknown, the student is
  // soft-deleted, or their account is inactive — don't leak which roll numbers
  // exist. The password check (Firebase) is the real gate regardless.
  if (!student || !student.isActive || !student.user.isActive) {
    return Response.json(
      { error: "We couldn't find an active account for that roll number." },
      { status: 404 },
    );
  }

  return Response.json({ email: student.user.email });
}
