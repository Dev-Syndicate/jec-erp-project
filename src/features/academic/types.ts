// Types owned by the academic feature (academic years + terms).

export type TermKind = "ODD" | "EVEN";

export type Term = {
  id: string;
  name: string;
  kind: TermKind;
  academicYearId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  terms: Term[];
};

export type NewYearInput = { name: string; startDate: string; endDate: string };
export type NewTermInput = { kind: TermKind; startDate: string; endDate: string };

// --- Classes & Sections ---

export type SectionRow = {
  id: string;
  name: string;
  classId: string;
};

export type ClassRow = {
  id: string;
  name: string;
  departmentId: string;
  sections: SectionRow[];
};

// --- Subjects (curriculum catalog) ---

export type Subject = {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  semesterNumber: number;
  isActive: boolean;
};

export type NewSubjectInput = { name: string; code: string; semesterNumber: number };

// --- Teacher assignments (active-term scoped) ---

export type AssignmentRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  semesterNumber: number;
  sectionId: string;
  sectionName: string;
  className: string;
};

export type ActiveTermInfo = { id: string; name: string; yearName: string } | null;

export type AssignmentsResponse = {
  term: ActiveTermInfo;
  assignments: AssignmentRow[];
};

export type TeacherOption = { id: string; name: string };

export type NewAssignmentInput = { teacherId: string; subjectId: string; sectionId: string };
