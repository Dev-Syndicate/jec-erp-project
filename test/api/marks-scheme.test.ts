// The internal-assessment scheme (src/app/api/marks/scheme.ts).
//
// IAT 1 and IAT 2 are composites out of 100 — cycle test 1 (10), cycle test 2
// (10), assignment 1 (10), assignment 2 (10), IAT paper (60). Model is a single
// mark out of 100. These are the college's rules, so the tests assert the actual
// numbers rather than just internal consistency: a typo in COMPONENT_MAX would
// silently change what a paper is out of.
import { describe, it, expect } from "vitest";

import {
  ASSESSMENTS,
  COMPONENTS,
  COMPONENT_LABEL,
  COMPONENT_MAX,
  assessmentTotal,
  componentsOf,
  isAssessment,
  type Component,
} from "@/app/api/marks/scheme";

describe("the assessments on offer", () => {
  it("is exactly IAT 1, IAT 2 and Model", () => {
    expect([...ASSESSMENTS]).toEqual(["IA1", "IA2", "MODEL"]);
  });

  it("no longer offers a standalone Assignment — it's a component now", () => {
    expect(isAssessment("ASSIGNMENT")).toBe(false);
    expect([...ASSESSMENTS]).not.toContain("ASSIGNMENT");
  });

  it("accepts only the three valid values", () => {
    for (const a of ASSESSMENTS) expect(isAssessment(a)).toBe(true);
    for (const bad of ["", "IA3", "ia1", "MODEL ", null, 1, undefined]) {
      expect(isAssessment(bad)).toBe(false);
    }
  });
});

describe("IAT composition — the 10/10/10/10/60 split", () => {
  it.each(["IA1", "IA2"] as const)("%s is five components in entry order", (assessment) => {
    const prefix = assessment;
    expect(componentsOf(assessment)).toEqual([
      `${prefix}_CT1`,
      `${prefix}_CT2`,
      `${prefix}_ASG1`,
      `${prefix}_ASG2`,
      `${prefix}_EXAM`,
    ]);
  });

  it.each(["IA1", "IA2"] as const)("%s parts are 10, 10, 10, 10, 60", (assessment) => {
    expect(componentsOf(assessment).map((c) => COMPONENT_MAX[c])).toEqual([10, 10, 10, 10, 60]);
  });

  it.each(["IA1", "IA2"] as const)("%s totals exactly 100", (assessment) => {
    expect(assessmentTotal(assessment)).toBe(100);
  });

  it("keeps IA1 and IA2 components distinct, so marks can't collide", () => {
    const a = new Set(componentsOf("IA1"));
    const b = componentsOf("IA2");
    expect(b.some((c) => a.has(c))).toBe(false);
  });
});

describe("Model", () => {
  it("is a single component out of 100", () => {
    expect(componentsOf("MODEL")).toEqual(["MODEL"]);
    expect(COMPONENT_MAX.MODEL).toBe(100);
    expect(assessmentTotal("MODEL")).toBe(100);
  });
});

describe("the component catalogue", () => {
  it("covers every component the three assessments use, and nothing more", () => {
    const used = ASSESSMENTS.flatMap((a) => componentsOf(a)).sort();
    expect(used).toEqual([...COMPONENTS].sort());
  });

  it("gives every component a maximum and a label", () => {
    for (const c of COMPONENTS) {
      expect(COMPONENT_MAX[c as Component]).toBeGreaterThan(0);
      expect(COMPONENT_LABEL[c as Component]).toBeTruthy();
    }
  });

  it("labels the two IATs' parts identically — the column headings match", () => {
    // The grid shows one IAT at a time, so "Cycle test 1" reads the same either
    // way; only the stored key differs.
    expect(componentsOf("IA1").map((c) => COMPONENT_LABEL[c])).toEqual(
      componentsOf("IA2").map((c) => COMPONENT_LABEL[c]),
    );
  });

  it("every assessment's parts sum to its stated total", () => {
    for (const a of ASSESSMENTS) {
      const sum = componentsOf(a).reduce((n, c) => n + COMPONENT_MAX[c], 0);
      expect(sum).toBe(assessmentTotal(a));
      expect(sum).toBe(100);
    }
  });
});
