// The internal-assessment scheme — the single source of truth for what an
// assessment is made of and what each part is out of.
//
// IAT 1 and IAT 2 are COMPOSITES out of 100:
//     cycle test 1   10
//     cycle test 2   10
//     assignment 1   10
//     assignment 2   10
//     IAT exam       60
//                   ---
//                   100
// MODEL is a single mark out of 100.
//
// Each component is its own InternalMark row (the enum values below), so a
// teacher can correct one part without touching the rest and every part stays
// independently visible. The TOTAL is summed on read and never stored — nothing
// can drift out of step with its parts.
//
// The maximums are a college rule, not per-subject configuration: they are fixed
// here so marks stay comparable across subjects and a typo can't silently change
// what a paper was out of. Changing the scheme means editing this file (and the
// Prisma enum), which is a deliberate, reviewable act.
import "server-only";

export const ASSESSMENTS = ["IA1", "IA2", "MODEL"] as const;
export type Assessment = (typeof ASSESSMENTS)[number];

export function isAssessment(v: unknown): v is Assessment {
  return typeof v === "string" && (ASSESSMENTS as readonly string[]).includes(v);
}

/** Every stored component, matching the Prisma AssessmentType enum. */
export const COMPONENTS = [
  "IA1_CT1",
  "IA1_CT2",
  "IA1_ASG1",
  "IA1_ASG2",
  "IA1_EXAM",
  "IA2_CT1",
  "IA2_CT2",
  "IA2_ASG1",
  "IA2_ASG2",
  "IA2_EXAM",
  "MODEL",
] as const;
export type Component = (typeof COMPONENTS)[number];

/** What each component is out of. These sum to 100 per assessment. */
export const COMPONENT_MAX: Record<Component, number> = {
  IA1_CT1: 10,
  IA1_CT2: 10,
  IA1_ASG1: 10,
  IA1_ASG2: 10,
  IA1_EXAM: 60,
  IA2_CT1: 10,
  IA2_CT2: 10,
  IA2_ASG1: 10,
  IA2_ASG2: 10,
  IA2_EXAM: 60,
  MODEL: 100,
};

/** Column headings for the entry grid, in order. */
export const COMPONENT_LABEL: Record<Component, string> = {
  IA1_CT1: "Cycle test 1",
  IA1_CT2: "Cycle test 2",
  IA1_ASG1: "Assignment 1",
  IA1_ASG2: "Assignment 2",
  IA1_EXAM: "IAT",
  IA2_CT1: "Cycle test 1",
  IA2_CT2: "Cycle test 2",
  IA2_ASG1: "Assignment 1",
  IA2_ASG2: "Assignment 2",
  IA2_EXAM: "IAT",
  MODEL: "Model",
};

/** The components that make up one assessment, in entry order. */
export function componentsOf(assessment: Assessment): Component[] {
  if (assessment === "MODEL") return ["MODEL"];
  const prefix = assessment === "IA1" ? "IA1" : "IA2";
  return [
    `${prefix}_CT1`,
    `${prefix}_CT2`,
    `${prefix}_ASG1`,
    `${prefix}_ASG2`,
    `${prefix}_EXAM`,
  ] as Component[];
}

/** An assessment's total — always 100, but derived so it can't drift. */
export function assessmentTotal(assessment: Assessment): number {
  return componentsOf(assessment).reduce((sum, c) => sum + COMPONENT_MAX[c], 0);
}
