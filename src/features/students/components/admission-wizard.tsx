// Admission wizard — the 5-step student admission form, saved per step.
//
// Tabs: Basic → Personal → Educational → Banks → Documents. Each step saves on
// its own (the student is a DRAFT until submitted), so an admin can fill part
// of it and return later. This component owns the tab state + loads the student;
// each step is its own component that saves through its own API route.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStudent } from "@/features/students/hooks/use-students";
import { TempPasswordBanner } from "@/components/temp-password-banner";
import { RegeneratePasswordButton } from "@/features/students/components/regenerate-password-button";
import { BasicInfoStep } from "@/features/students/components/steps/basic-info-step";
import { PersonalInfoStep } from "@/features/students/components/steps/personal-info-step";
import { EducationStep } from "@/features/students/components/steps/education-step";
import { BanksStep } from "@/features/students/components/steps/banks-step";
import { DocumentsStep } from "@/features/students/components/steps/documents-step";

const STEPS = [
  { id: "basic", label: "Basic info" },
  { id: "personal", label: "Personal info" },
  { id: "education", label: "Educational info" },
  { id: "banks", label: "Banks" },
  { id: "documents", label: "Documents" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

export function AdmissionWizard({ studentId }: { studentId: string }) {
  const student = useStudent(studentId);
  const [step, setStep] = useState<StepId>("basic");
  // Temp password to reveal once: either from creation (redirect query param) or
  // from a manual regenerate (state). Either surfaces the same banner.
  const passwordFromUrl = useSearchParams().get("tempPassword");
  const [regenerated, setRegenerated] = useState<string | null>(null);
  const tempPassword = regenerated ?? passwordFromUrl;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/students" />}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
            Admission
          </p>
          <h1 className="truncate font-heading text-xl font-semibold text-foreground">
            {student.data ? student.data.name : "Loading…"}
            {student.data && (
              <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                {student.data.registerNumber}
              </span>
            )}
          </h1>
        </div>
        {student.data && (
          <RegeneratePasswordButton studentId={studentId} onGenerated={setRegenerated} />
        )}
      </div>

      {tempPassword && student.data && (
        <TempPasswordBanner
          name={student.data.name}
          identifier={student.data.registerNumber}
          email={student.data.email}
          tempPassword={tempPassword}
          headline={
            regenerated
              ? "New temporary password generated"
              : "Account created — continue the admission below"
          }
        />
      )}

      {/* Step tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {STEPS.map((s, i) => {
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-mono text-[0.7rem] opacity-70">{i + 1}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {student.isError ? (
        <p className="text-sm text-destructive">
          {student.error instanceof Error ? student.error.message : "Couldn’t load this student."}
        </p>
      ) : student.isPending ? (
        <p className="text-sm text-muted-foreground">Loading admission form…</p>
      ) : step === "basic" ? (
        <BasicInfoStep studentId={studentId} student={student.data} />
      ) : step === "personal" ? (
        <PersonalInfoStep studentId={studentId} student={student.data} />
      ) : step === "education" ? (
        <EducationStep studentId={studentId} student={student.data} />
      ) : step === "banks" ? (
        <BanksStep studentId={studentId} student={student.data} />
      ) : (
        <DocumentsStep studentId={studentId} student={student.data} />
      )}
    </main>
  );
}
