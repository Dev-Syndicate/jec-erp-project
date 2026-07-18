// TanStack Query hooks for the students feature.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteDocument,
  getDistricts,
  getLookups,
  getStates,
  getStudent,
  listStudents,
  saveBanks,
  saveBasicInfo,
  saveEducation,
  savePersonalInfo,
  uploadDocument,
} from "@/features/students/api/students-api";
import type {
  BankInput,
  BasicInfo,
  DocumentType,
  EducationInput,
  PersonalInfo,
} from "@/features/students/types";

export function useStudents() {
  return useQuery({ queryKey: ["students"], queryFn: listStudents });
}

export function useStudent(id: string) {
  return useQuery({ queryKey: ["students", id], queryFn: () => getStudent(id), enabled: !!id });
}

export function useLookups() {
  // Reference data — cache it hard; it barely changes within a session.
  return useQuery({ queryKey: ["lookups"], queryFn: getLookups, staleTime: 10 * 60_000 });
}

export function useStates(countryId: string | undefined) {
  return useQuery({
    queryKey: ["geo", "states", countryId],
    queryFn: () => getStates(countryId!),
    enabled: !!countryId,
    staleTime: 10 * 60_000,
  });
}

export function useDistricts(stateId: string | undefined) {
  return useQuery({
    queryKey: ["geo", "districts", stateId],
    queryFn: () => getDistricts(stateId!),
    enabled: !!stateId,
    staleTime: 10 * 60_000,
  });
}

// After any step saves, refresh this student (and the list, since the row's
// derived state — name, status — can change).
function invalidateStudent(qc: ReturnType<typeof useQueryClient>, studentId: string) {
  qc.invalidateQueries({ queryKey: ["students", studentId] });
  qc.invalidateQueries({ queryKey: ["students"] });
}

export function useSaveBasicInfo(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: BasicInfo) => saveBasicInfo(studentId, values),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}

export function useSavePersonalInfo(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: PersonalInfo) => savePersonalInfo(studentId, values),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}

export function useSaveEducation(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (records: EducationInput[]) => saveEducation(studentId, records),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}

export function useSaveBanks(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (banks: BankInput[]) => saveBanks(studentId, banks),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}

export function useUploadDocument(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docType, file }: { docType: DocumentType; file: File }) =>
      uploadDocument(studentId, docType, file),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}

export function useDeleteDocument(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docType: DocumentType) => deleteDocument(studentId, docType),
    onSuccess: () => invalidateStudent(qc, studentId),
  });
}
