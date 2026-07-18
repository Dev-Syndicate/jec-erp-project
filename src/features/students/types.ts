// Types owned by the students feature (admission wizard + list).

export type AdmissionStatus = "DRAFT" | "SUBMITTED";
export type SeatType = "CONVENER" | "MANAGEMENT";
export type Accommodation = "DAY_SCHOLAR" | "HOSTEL";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type AddressKind = "PRESENT" | "PERMANENT";
export type GuardianRelation = "FATHER" | "MOTHER" | "GUARDIAN";
export type EducationLevel = "SCHOOL" | "COLLEGE" | "ENTRANCE";
export type DocumentType =
  | "PHOTO"
  | "SIGNATURE"
  | "AADHAAR"
  | "PAN"
  | "TENTH"
  | "ELEVENTH"
  | "TWELFTH"
  | "INTER"
  | "TC"
  | "EAMCET"
  | "RANK_CARD"
  | "BIRTH_CERTIFICATE"
  | "COMMUNITY_CERTIFICATE"
  | "INCOME_CERTIFICATE"
  | "FIRST_GRADUATE_CERTIFICATE";

// Row in the students list.
export type StudentListItem = {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  admissionStatus: AdmissionStatus;
  name: string;
  email: string;
  departmentId: string | null;
  isActive: boolean;
};

// A lookup option (religion/category/caste/country/state/district).
export type LookupOption = { id: string; name: string };

export type Lookups = {
  religions: LookupOption[];
  categories: LookupOption[];
  castes: LookupOption[];
  countries: Array<LookupOption & { code: string }>;
};

// The Basic Info step's editable values (StudentProfile + a couple anchor fields).
export type BasicInfo = {
  fullNameSSC: string;
  region: string;
  alternatePhone: string;
  seatTypeCategory: SeatType | "";
  aadhaarNumber: string;
  nationality: string;
  scholarshipType: string;
  accommodation: Accommodation | "";
  religionId: string;
  categoryId: string;
  casteId: string;
  dateOfBirth: string; // ISO yyyy-mm-dd
  gender: Gender | "";
};

// The full student the wizard loads.
export type StudentDetail = {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  admissionStatus: AdmissionStatus;
  name: string;
  email: string;
  departmentId: string | null;
  profile: {
    fullNameSSC: string;
    region: string | null;
    alternatePhone: string | null;
    seatTypeCategory: SeatType;
    aadhaarNumber: string | null;
    nationality: string | null;
    scholarshipType: string | null;
    accommodation: Accommodation;
    religionId: string | null;
    categoryId: string | null;
    casteId: string | null;
  } | null;
  addresses: AddressRow[];
  guardians: GuardianRow[];
  education: EducationRow[];
  banks: BankRow[];
  documents: DocumentRow[];
};

// --- Personal Info step (guardians + addresses) ---

export type AddressRow = {
  id: string;
  kind: AddressKind;
  countryId: string;
  stateId: string;
  districtId: string;
  pincode: string;
  type: string;
  addressLine1: string;
  addressLine2: string | null;
};

export type GuardianRow = {
  id: string;
  relation: GuardianRelation;
  fullName: string;
  email: string | null;
  mobile: string | null;
  occupation: string | null;
  annualIncome: string | null;
  address: string | null;
};

// What the form edits for one guardian slot (all strings; "" = empty).
export type GuardianInput = {
  relation: GuardianRelation;
  fullName: string;
  email: string;
  mobile: string;
  occupation: string;
  annualIncome: string;
  address: string;
};

// What the form edits for one address slot.
export type AddressInput = {
  kind: AddressKind;
  countryId: string;
  stateId: string;
  districtId: string;
  pincode: string;
  type: string;
  addressLine1: string;
  addressLine2: string;
};

export type PersonalInfo = {
  guardians: GuardianInput[];
  addresses: AddressInput[];
};

// --- Educational Info step ---

export type EducationRow = {
  id: string;
  level: EducationLevel;
  instituteName: string;
  board: string | null;
  yearOfPassing: number | null;
  hallTicketNo: string | null;
  marks: string | null;
  percentage: string | null; // Prisma Decimal serializes to string
  gpa: string | null;
  totalMPC: number | null;
  obtainedMPC: number | null;
  rank: number | null;
};

export type EducationInput = {
  level: EducationLevel;
  instituteName: string;
  board: string;
  yearOfPassing: string;
  hallTicketNo: string;
  marks: string;
  percentage: string;
  gpa: string;
  totalMPC: string;
  obtainedMPC: string;
  rank: string;
};

// --- Banks step ---

export type BankRow = {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNo: string;
  ifscCode: string;
  type: string | null;
  branch: string | null;
};

export type BankInput = {
  bankName: string;
  accountHolder: string;
  accountNo: string;
  ifscCode: string;
  type: string;
  branch: string;
};

// --- Documents step ---

export type DocumentRow = {
  id: string;
  docType: DocumentType;
  url: string;
  fileName: string | null;
  uploadedAt: string;
};

// --- Bulk import ---

export type ImportRowStatus = "created" | "skipped" | "error";

export type ImportResultRow = {
  rowNumber: number;
  name: string;
  email: string;
  registerNumber: string;
  rollNumber: string;
  status: ImportRowStatus;
  reason: string | null;
  tempPassword: string | null;
};

export type ImportResult = {
  batchId: string;
  department: { id: string; name: string; code: string };
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  tooManyRows: boolean;
  maxRows: number;
  results: ImportResultRow[];
};

export type ImportBatchSummary = {
  id: string;
  fileName: string | null;
  department: { name: string; code: string };
  createdBy: string;
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
};

export type RegenResultRow = {
  registerNumber: string;
  name: string;
  email: string;
  status: "regenerated" | "skipped";
  reason?: string;
  tempPassword?: string;
};

export type BatchRegenResult = {
  batchId: string;
  department: { id: string; name: string; code: string };
  regeneratedCount: number;
  skippedCount: number;
  results: RegenResultRow[];
};
