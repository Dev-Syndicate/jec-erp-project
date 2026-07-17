// Types owned by the departments feature. Shared/cross-feature DTOs go in src/types/.

export type Department = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  // Present in list responses (GET) — how many classes/users hang off the dept.
  counts?: { classes: number; users: number };
};

export type CreateDepartmentInput = {
  name: string;
  code: string;
};
