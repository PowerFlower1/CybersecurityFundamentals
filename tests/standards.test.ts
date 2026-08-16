import { describe, it, expect } from "vitest";
import {
  standardsFor,
  standardsCoverage,
  CONCEPT_STANDARDS,
  SECURITY_PLUS_DOMAINS,
  NICE_CATEGORIES,
} from "../src/lib/standards";
import { CYBER_QUESTIONS, type Question, type ConceptId } from "../src/constants";
import { CONCEPTS } from "../src/components/SoloMap";

function q(over: Partial<Question> = {}): Question {
  return {
    id: "1",
    concept: "integrity" as ConceptId,
    type: "mcq",
    question: "Q?",
    options: ["a", "b"],
    correctAnswer: "a",
    explanation: "e",
    difficulty: "easy",
    ...over,
  };
}

describe("CONCEPT_STANDARDS", () => {
  it("maps every campaign concept", () => {
    for (const c of CONCEPTS) {
      expect(CONCEPT_STANDARDS[c.id as ConceptId], `missing mapping for ${c.id}`).toBeDefined();
    }
  });

  it("gives every concept at least one Security+ domain and NICE category", () => {
    for (const [concept, std] of Object.entries(CONCEPT_STANDARDS)) {
      expect(std.securityPlus?.length, `${concept} securityPlus`).toBeGreaterThan(0);
      expect(std.nice?.length, `${concept} nice`).toBeGreaterThan(0);
    }
  });

  it("only uses the declared domain and category vocabularies", () => {
    const validDomains = Object.values(SECURITY_PLUS_DOMAINS) as string[];
    const validCategories = Object.values(NICE_CATEGORIES) as string[];
    for (const std of Object.values(CONCEPT_STANDARDS)) {
      for (const d of std.securityPlus ?? []) expect(validDomains).toContain(d);
      for (const n of std.nice ?? []) expect(validCategories).toContain(n);
    }
  });
});

describe("standardsFor", () => {
  it("falls back to the concept default", () => {
    expect(standardsFor(q({ concept: "authentication" as ConceptId }))).toEqual(
      CONCEPT_STANDARDS.authentication,
    );
  });

  it("prefers explicit per-question standards over the concept default", () => {
    const custom = { securityPlus: [SECURITY_PLUS_DOMAINS.GOVERNANCE] };
    expect(standardsFor(q({ standards: custom }))).toEqual(custom);
  });

  it("resolves standards for every question in the shipped bank", () => {
    for (const question of CYBER_QUESTIONS) {
      const s = standardsFor(question);
      expect(s.securityPlus?.length, `question ${question.id}`).toBeGreaterThan(0);
      expect(s.nice?.length, `question ${question.id}`).toBeGreaterThan(0);
    }
  });
});

describe("standardsCoverage", () => {
  it("counts questions per standard", () => {
    const coverage = standardsCoverage([
      q({ id: "1", concept: "authentication" as ConceptId }),
      q({ id: "2", concept: "authentication" as ConceptId }),
    ]);
    const ops = coverage.securityPlus.find(
      (r) => r.standard === SECURITY_PLUS_DOMAINS.OPERATIONS,
    );
    expect(ops?.questionCount).toBe(2);
  });

  it("lists the contributing concepts, de-duplicated and sorted", () => {
    const coverage = standardsCoverage([
      q({ id: "1", concept: "availability" as ConceptId }),
      q({ id: "2", concept: "availability" as ConceptId }),
      q({ id: "3", concept: "authentication" as ConceptId }),
    ]);
    const ops = coverage.securityPlus.find(
      (r) => r.standard === SECURITY_PLUS_DOMAINS.OPERATIONS,
    );
    expect(ops?.concepts).toEqual(["authentication", "availability"]);
  });

  it("returns empty reports for an empty bank", () => {
    expect(standardsCoverage([])).toEqual({ securityPlus: [], nice: [] });
  });

  it("sorts rows by standard for a stable report", () => {
    const rows = standardsCoverage(CYBER_QUESTIONS).securityPlus.map((r) => r.standard);
    expect(rows).toEqual([...rows].sort((a, b) => a.localeCompare(b)));
  });

  it("covers the shipped bank across multiple Security+ domains", () => {
    const coverage = standardsCoverage(CYBER_QUESTIONS);
    expect(coverage.securityPlus.length).toBeGreaterThan(1);
    expect(coverage.nice.length).toBeGreaterThan(0);
    // Every question contributes to at least one domain.
    const totalTagged = coverage.securityPlus.reduce((n, r) => n + r.questionCount, 0);
    expect(totalTagged).toBeGreaterThanOrEqual(CYBER_QUESTIONS.length);
  });
});
