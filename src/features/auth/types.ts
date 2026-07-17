// Types owned by the auth feature. Shared/cross-feature DTOs go in src/types/.

// Shape returned by GET /api/auth/me.
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  departmentId: string | null;
  roles: string[];
  mustChangePassword: boolean;
};
