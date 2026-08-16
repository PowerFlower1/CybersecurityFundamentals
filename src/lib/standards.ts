import type { Question, QuestionStandards, ConceptId } from "../constants";

// Framework alignment for the five core concepts.
//
// Scope note: these are DOMAIN / CATEGORY level mappings, deliberately. They
// answer "which Security+ domains and NICE categories does this module touch?",
// which is the question districts and funders usually ask of an introductory
// course. They are a defensible starting point, not an authoritative
// objective-level crosswalk — a curriculum SME should review them, and add
// objective-level ids (e.g. a specific Security+ sub-objective) if a partner
// requires that granularity.

/** CompTIA Security+ SY0-701 exam domains. */
export const SECURITY_PLUS_DOMAINS = {
  GENERAL: "1.0 General Security Concepts",
  THREATS: "2.0 Threats, Vulnerabilities & Mitigations",
  ARCHITECTURE: "3.0 Security Architecture",
  OPERATIONS: "4.0 Security Operations",
  GOVERNANCE: "5.0 Security Program Management & Oversight",
} as const;

/** NICE Framework (NIST SP 800-181) workforce categories. */
export const NICE_CATEGORIES = {
  PROTECTION: "Protection and Defense",
  IMPLEMENTATION: "Implementation and Operation",
  OVERSIGHT: "Oversight and Governance",
  DESIGN: "Design and Development",
} as const;

/** Default alignment applied to every question in a concept. */
export const CONCEPT_STANDARDS: Record<ConceptId, QuestionStandards> = {
  art_of_defending: {
    securityPlus: [SECURITY_PLUS_DOMAINS.GENERAL, SECURITY_PLUS_DOMAINS.ARCHITECTURE],
    nice: [NICE_CATEGORIES.PROTECTION],
  },
  confidentiality: {
    securityPlus: [SECURITY_PLUS_DOMAINS.GENERAL, SECURITY_PLUS_DOMAINS.ARCHITECTURE],
    nice: [NICE_CATEGORIES.PROTECTION],
  },
  integrity: {
    securityPlus: [SECURITY_PLUS_DOMAINS.GENERAL, SECURITY_PLUS_DOMAINS.OPERATIONS],
    nice: [NICE_CATEGORIES.PROTECTION],
  },
  availability: {
    securityPlus: [SECURITY_PLUS_DOMAINS.ARCHITECTURE, SECURITY_PLUS_DOMAINS.OPERATIONS],
    nice: [NICE_CATEGORIES.IMPLEMENTATION],
  },
  authentication: {
    securityPlus: [SECURITY_PLUS_DOMAINS.OPERATIONS, SECURITY_PLUS_DOMAINS.GENERAL],
    nice: [NICE_CATEGORIES.IMPLEMENTATION],
  },
};

/** The alignment for a question: its own tags, else its concept's defaults. */
export function standardsFor(question: Question): QuestionStandards {
  if (question.standards) return question.standards;
  return CONCEPT_STANDARDS[question.concept] ?? {};
}

export interface CoverageRow {
  standard: string;
  questionCount: number;
  /** Concepts that contribute questions to this standard, sorted. */
  concepts: string[];
}

export interface StandardsCoverage {
  securityPlus: CoverageRow[];
  nice: CoverageRow[];
}

function rollUp(
  questions: Question[],
  pick: (s: QuestionStandards) => string[] | undefined,
): CoverageRow[] {
  const byStandard = new Map<string, { count: number; concepts: Set<string> }>();

  for (const q of questions) {
    for (const standard of pick(standardsFor(q)) ?? []) {
      let row = byStandard.get(standard);
      if (!row) {
        row = { count: 0, concepts: new Set() };
        byStandard.set(standard, row);
      }
      row.count++;
      row.concepts.add(q.concept);
    }
  }

  return [...byStandard.entries()]
    .map(([standard, { count, concepts }]) => ({
      standard,
      questionCount: count,
      concepts: [...concepts].sort(),
    }))
    // Alphabetical by standard keeps the report stable and readable.
    .sort((a, b) => a.standard.localeCompare(b.standard));
}

/** Coverage report over a question bank, for district / funder reporting. */
export function standardsCoverage(questions: Question[]): StandardsCoverage {
  return {
    securityPlus: rollUp(questions, (s) => s.securityPlus),
    nice: rollUp(questions, (s) => s.nice),
  };
}
