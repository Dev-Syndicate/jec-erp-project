// Types owned by the Promotion feature — end-of-year advancement of a whole
// class's roster at once. Promotion adds a new Enrollment ("yearly sticker") for
// the target year; a final-year class graduates instead. Kept local — no
// cross-feature imports; the feature fetches classes for its picker itself.

export type PromotionMode = "PROMOTE" | "GRADUATE";

export type PromotionStudent = {
  studentId: string;
  registerNumber: string;
  displayName: string;
};

export type TargetYear = { id: string; name: string };

// A candidate landing class. It carries its OWNING department because that is
// what promotion changes: the same award's year-2 class belongs to the branch's
// department, while the year-1 class it came from belongs to S&H.
export type TargetClass = {
  id: string;
  year: number;
  section: string;
  departmentId: string;
  departmentCode: string; // "CSE"
  departmentName: string; // "Computer Science and Engineering Department"
};

// The context for promoting one source class (GET /api/promotion?classId=).
export type PromotionContext = {
  sourceClass: {
    id: string;
    programId: string;
    programLabel: string; // "B.E · CSE" — the award, unchanged by promotion
    // The department that owns it today. Compare with the chosen TargetClass's to
    // show the hand-off ("S&H → CSE Department") on a year-1 source.
    departmentId: string;
    departmentCode: string; // "S&H"
    departmentName: string;
    year: number;
    section: string;
    label: string; // "B.E · CSE · II-A"
    durationYears: number;
    isFinalYear: boolean; // year >= durationYears → graduate, don't promote
  };
  activeYear: { id: string; name: string };
  targetYears: TargetYear[]; // years you can promote INTO (not the active one)
  suggestedTargetYearId: string | null; // earliest year starting after the active one
  targetClasses: TargetClass[]; // year-(N+1) classes for the same award, whichever department owns them (empty if final year)
  suggestedTargetClassId: string | null; // same section, next year
  roster: PromotionStudent[]; // active students enrolled this year
};

// Body for POST /api/promotion.
export type PromotionInput = {
  sourceClassId: string;
  mode: PromotionMode;
  targetYearId?: string; // required for PROMOTE
  targetClassId?: string; // required for PROMOTE
  studentIds: string[];
};

export type PromotionResult = {
  processed: number;
  mode: PromotionMode;
  // The department that now owns the promoted roster (PROMOTE only) — absent on
  // GRADUATE, which moves nobody into a class.
  departmentId?: string;
};

// This feature's own read-only class fetch (features don't import each other).
export type ClassOption = {
  id: string;
  label: string; // "B.E · CSE · II-A"
  shortLabel: string; // "II-A"
  programId: string;
  programLabel: string; // "B.E · CSE"
  isActive: boolean;
};
