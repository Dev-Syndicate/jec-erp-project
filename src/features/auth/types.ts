// Types owned by the auth feature. Shared/cross-feature DTOs go in src/types/.

// Shape returned by GET /api/auth/me.
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  programId: string | null;
  roles: string[];
  mustChangePassword: boolean;
  // True when the user advises ≥1 active class (is a class teacher). Gates the
  // "Day attendance" nav for a plain Faculty; HOD/SA see it via their role.
  advisesClass: boolean;
};
