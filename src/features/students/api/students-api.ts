// Client-side fetchers for the students feature — list, load one, lookups, and
// the per-step admission saves. All authenticated via apiFetch (Bearer token).
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  BankInput,
  BasicInfo,
  DocumentRow,
  DocumentType,
  EducationInput,
  Lookups,
  LookupOption,
  PersonalInfo,
  StudentDetail,
  StudentListItem,
} from "@/features/students/types";

export async function listStudents(): Promise<StudentListItem[]> {
  const { students } = await apiFetch<{ students: StudentListItem[] }>("/api/students");
  return students;
}

export function getStudent(id: string): Promise<StudentDetail> {
  return apiFetch<StudentDetail>(`/api/students/${id}`);
}

export function getLookups(): Promise<Lookups> {
  return apiFetch<Lookups>("/api/lookups");
}

export async function getStates(countryId: string): Promise<LookupOption[]> {
  const { states } = await apiFetch<{ states: LookupOption[] }>(
    `/api/lookups/geo?countryId=${countryId}`,
  );
  return states;
}

export async function getDistricts(stateId: string): Promise<LookupOption[]> {
  const { districts } = await apiFetch<{ districts: LookupOption[] }>(
    `/api/lookups/geo?stateId=${stateId}`,
  );
  return districts;
}

/** Save the Basic Info step. Sends "" as null for optional fields. */
export function saveBasicInfo(studentId: string, values: BasicInfo): Promise<{ ok: true }> {
  const payload = {
    fullNameSSC: values.fullNameSSC,
    region: values.region || null,
    alternatePhone: values.alternatePhone || null,
    seatTypeCategory: values.seatTypeCategory || undefined,
    aadhaarNumber: values.aadhaarNumber || null,
    nationality: values.nationality || null,
    scholarshipType: values.scholarshipType || null,
    accommodation: values.accommodation || undefined,
    religionId: values.religionId || null,
    categoryId: values.categoryId || null,
    casteId: values.casteId || null,
    dateOfBirth: values.dateOfBirth || undefined,
    gender: values.gender || null,
  };
  return apiFetch<{ ok: true }>(`/api/students/${studentId}/admission/basic`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Save the Personal Info step (guardians + addresses). Only non-empty entries. */
export function savePersonalInfo(
  studentId: string,
  values: PersonalInfo,
): Promise<{ ok: true }> {
  // Only send guardians that have a name, and addresses that have been started
  // (line 1 typed). Empty slots are dropped — the step is optional.
  const guardians = values.guardians
    .filter((g) => g.fullName.trim())
    .map((g) => ({
      relation: g.relation,
      fullName: g.fullName,
      email: g.email || null,
      mobile: g.mobile || null,
      occupation: g.occupation || null,
      annualIncome: g.annualIncome || null,
      address: g.address || null,
    }));
  const addresses = values.addresses
    .filter((a) => a.addressLine1.trim() || a.pincode.trim() || a.districtId)
    .map((a) => ({
      kind: a.kind,
      countryId: a.countryId,
      stateId: a.stateId,
      districtId: a.districtId,
      pincode: a.pincode,
      type: a.type,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2 || null,
    }));
  return apiFetch<{ ok: true }>(`/api/students/${studentId}/admission/personal`, {
    method: "PUT",
    body: JSON.stringify({ guardians, addresses }),
  });
}

/** Save the Educational Info step. Only records with an institute name. */
export function saveEducation(
  studentId: string,
  records: EducationInput[],
): Promise<{ ok: true }> {
  const payload = records
    .filter((r) => r.instituteName.trim())
    .map((r) => ({
      level: r.level,
      instituteName: r.instituteName,
      board: r.board || null,
      yearOfPassing: r.yearOfPassing || null,
      hallTicketNo: r.hallTicketNo || null,
      marks: r.marks || null,
      percentage: r.percentage || null,
      gpa: r.gpa || null,
      totalMPC: r.totalMPC || null,
      obtainedMPC: r.obtainedMPC || null,
      rank: r.rank || null,
    }));
  return apiFetch<{ ok: true }>(`/api/students/${studentId}/admission/education`, {
    method: "PUT",
    body: JSON.stringify({ records: payload }),
  });
}

/** Save the Banks step. Only banks with the four required fields filled. */
export function saveBanks(studentId: string, banks: BankInput[]): Promise<{ ok: true }> {
  const payload = banks
    .filter((b) => b.bankName.trim() && b.accountHolder.trim() && b.accountNo.trim() && b.ifscCode.trim())
    .map((b) => ({
      bankName: b.bankName,
      accountHolder: b.accountHolder,
      accountNo: b.accountNo,
      ifscCode: b.ifscCode,
      type: b.type || null,
      branch: b.branch || null,
    }));
  return apiFetch<{ ok: true }>(`/api/students/${studentId}/admission/banks`, {
    method: "PUT",
    body: JSON.stringify({ banks: payload }),
  });
}

/** Upload a document into a slot (multipart). Returns the saved row. */
export function uploadDocument(
  studentId: string,
  docType: DocumentType,
  file: File,
): Promise<{ ok: true; document: DocumentRow }> {
  const body = new FormData();
  body.append("file", file);
  body.append("docType", docType);
  return apiFetch<{ ok: true; document: DocumentRow }>(
    `/api/students/${studentId}/admission/documents`,
    { method: "POST", body },
  );
}

/** Remove a document slot. */
export function deleteDocument(
  studentId: string,
  docType: DocumentType,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(
    `/api/students/${studentId}/admission/documents?docType=${docType}`,
    { method: "DELETE" },
  );
}
