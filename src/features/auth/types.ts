// Types owned by the auth feature. Shared/cross-feature DTOs go in src/types/.

// Shape returned by GET /api/auth/me.
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  programId: string | null;
  roles: string[];
  // True when a role spans every program (INSTITUTION scope, e.g. Super Admin)
  // rather than just the user's own. Server-derived from the role's DB scope —
  // never infer this by comparing role names.
  isInstitutionScoped: boolean;
  mustChangePassword: boolean;
  // True when the user advises ≥1 active class (is a class teacher). Gates the
  // "Day attendance" nav for a plain Faculty; HOD/SA see it via their role.
  advisesClass: boolean;
  // True when the user holds ≥1 timetable slot this semester. Gates the marking
  // navs: a HOD who takes no hours has no register to mark or timetable to read.
  teaches: boolean;
};
