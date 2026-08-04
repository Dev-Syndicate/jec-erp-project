// WHERE MAY A LECTURER BE TIMETABLED? — one rule, one place.
//
// The rule is "employed there, OR attached there for the active semester":
//
//   home department  = FacultyProfile.departmentId (permanent, their HR home)
//   host departments = FacultyAttachment rows for THIS semester (a loan)
//
// This exists because the answer was previously inlined as a bare equality in
// two routes (timetable POST and attendance/substitutions POST). Both were
// therefore wrong in the same way — an S&H lecturer could only ever be put on a
// grid S&H itself owned, which contradicts how the college actually runs: S&H
// teaches first year for every department, and its staff also visit others.
//
// Cross-cutting (routes under two different API trees need it), so it lives in
// lib/ per CLAUDE.md rather than in either route's dto.
import "server-only";

import { db } from "@/lib/db";

export type TeachingCheck =
  | { ok: true; via: "home" | "attachment" }
  | { error: string };

// The decision itself, with no DB access — every fact it needs is passed in, so
// the rule can be unit-tested (the suite stubs @/lib/db to throw). canTeachIn
// below is the thin shell that fetches those facts.
export type TeachingFacts = {
  status: "ACTIVE" | "INACTIVE";
  isStudent: boolean;
  // null when the account has no FacultyProfile at all.
  homeDepartmentId: string | null;
  // Is there an attachment to the target department for the target semester?
  hasAttachment: boolean;
};

export function decideTeaching(
  facts: TeachingFacts,
  departmentId: string,
): TeachingCheck {
  if (facts.status !== "ACTIVE" || facts.homeDepartmentId === null) {
    return { error: "Select an active faculty member." };
  }
  // A student account must never hold a teaching slot, even if some data fix
  // gave it a faculty profile.
  if (facts.isStudent) {
    return { error: "A student can't be timetabled to teach." };
  }
  if (facts.homeDepartmentId === departmentId) return { ok: true, via: "home" };
  if (facts.hasAttachment) return { ok: true, via: "attachment" };
  return {
    error:
      "That faculty member isn't in the department that owns this class, and has no attachment to it this semester.",
  };
}

/**
 * May `userId` be timetabled into a class owned by `departmentId`, during
 * `semesterId`?
 *
 * Returns a user-facing error rather than a boolean so both callers phrase the
 * refusal identically — the previous inline checks had drifted into two
 * different messages for the same condition.
 *
 * Rejects non-staff and inactive accounts first: teaching rights are never a
 * side effect of merely having a User row.
 */
export async function canTeachIn(
  userId: string,
  departmentId: string,
  semesterId: string,
): Promise<TeachingCheck> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      student: { select: { id: true } },
      facultyProfile: { select: { id: true, departmentId: true } },
    },
  });

  const profile = user?.facultyProfile;
  if (!user || !profile) return { error: "Select an active faculty member." };

  const base = {
    status: user.status,
    isStudent: user.student !== null,
    homeDepartmentId: profile.departmentId,
  };

  // Decide on what we already know. Anything settled here — employed in this
  // department, inactive, or a student — needs no attachment lookup, so the
  // common case stays a single round-trip.
  const settled = decideTeaching({ ...base, hasAttachment: false }, departmentId);
  if ("ok" in settled || base.status !== "ACTIVE" || base.isStudent) return settled;

  // Otherwise they must be on loan to this department FOR THIS SEMESTER. The
  // semester bound is what makes a loan expire instead of quietly becoming
  // permanent.
  const attachment = await db.facultyAttachment.findUnique({
    where: {
      facultyId_departmentId_semesterId: {
        facultyId: profile.id,
        departmentId,
        semesterId,
      },
    },
    select: { id: true },
  });

  return decideTeaching({ ...base, hasAttachment: attachment !== null }, departmentId);
}

/**
 * The department ids a lecturer may teach in this semester — their home plus any
 * current attachments. Used by list/picker endpoints so the UI only offers what
 * the write path would actually accept; the pickers previously filtered on a
 * single department and so hid every visiting lecturer.
 */
export async function teachableDepartmentIds(
  facultyProfileId: string,
  homeDepartmentId: string,
  semesterId: string,
): Promise<string[]> {
  const attachments = await db.facultyAttachment.findMany({
    where: { facultyId: facultyProfileId, semesterId },
    select: { departmentId: true },
  });
  return [...new Set([homeDepartmentId, ...attachments.map((a) => a.departmentId)])];
}
