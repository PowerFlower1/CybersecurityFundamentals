import { describe, it, expect } from "vitest";
import {
  selectConceptQuestions,
  selectSoloQuestions,
  difficultyAvailability,
  SOLO_DIFFICULTIES,
} from "../src/lib/questions";
import { CYBER_QUESTIONS, type Question, type ConceptId } from "../src/constants";
import { CONCEPTS } from "../src/components/SoloMap";

const CONCEPT_IDS = CONCEPTS.map((c) => c.id);

describe("question bank integrity", () => {
  it("tags every question with a known concept", () => {
    for (const q of CYBER_QUESTIONS) {
      expect(CONCEPT_IDS, `question ${q.id} has an unknown concept`).toContain(q.concept);
    }
  });

  it("covers every concept in the campaign", () => {
    for (const id of CONCEPT_IDS) {
      const forConcept = CYBER_QUESTIONS.filter((q) => q.concept === id);
      expect(forConcept.length, `concept ${id} has no questions`).toBeGreaterThan(0);
    }
  });

  it("uses unique question ids", () => {
    const ids = CYBER_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectConceptQuestions", () => {
  it("returns only the questions for the requested concept", () => {
    for (const id of CONCEPT_IDS) {
      const selected = selectConceptQuestions(CYBER_QUESTIONS, id);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.every((q) => q.concept === id)).toBe(true);
    }
  });

  it("returns an empty list for a null or unknown concept", () => {
    expect(selectConceptQuestions(CYBER_QUESTIONS, null)).toEqual([]);
    expect(selectConceptQuestions(CYBER_QUESTIONS, "not_a_concept")).toEqual([]);
  });

  it("partitions the bank: every question belongs to exactly one concept", () => {
    const total = CONCEPT_IDS.reduce(
      (sum, id) => sum + selectConceptQuestions(CYBER_QUESTIONS, id).length,
      0,
    );
    expect(total).toBe(CYBER_QUESTIONS.length);
  });

  // This is the regression the old positional slice (`conceptIdx * 3`) failed:
  // adding a question to an early concept shifted every later concept's window.
  it("is unaffected by adding a question to a different concept", () => {
    const before = selectConceptQuestions(CYBER_QUESTIONS, "authentication");

    const extra: Question = {
      id: "extra-1",
      concept: "art_of_defending" as ConceptId,
      type: "mcq",
      question: "A newly added defense question?",
      options: ["a", "b"],
      correctAnswer: "a",
      explanation: "Because.",
      difficulty: "easy",
    };
    const grownBank = [...CYBER_QUESTIONS, extra];

    // The unrelated concept is untouched...
    expect(selectConceptQuestions(grownBank, "authentication")).toEqual(before);
    // ...and the edited concept picks the new question up.
    const defending = selectConceptQuestions(grownBank, "art_of_defending");
    expect(defending).toHaveLength(
      selectConceptQuestions(CYBER_QUESTIONS, "art_of_defending").length + 1,
    );
    expect(defending.map((q) => q.id)).toContain("extra-1");
  });

  it("handles a concept whose questions are non-contiguous in the bank", () => {
    // Interleave two concepts to prove ordering in the array does not matter.
    const bank = [
      { ...CYBER_QUESTIONS[0], id: "a1", concept: "integrity" as ConceptId },
      { ...CYBER_QUESTIONS[0], id: "b1", concept: "availability" as ConceptId },
      { ...CYBER_QUESTIONS[0], id: "a2", concept: "integrity" as ConceptId },
    ];
    expect(selectConceptQuestions(bank, "integrity").map((q) => q.id)).toEqual(["a1", "a2"]);
    expect(selectConceptQuestions(bank, "availability").map((q) => q.id)).toEqual(["b1"]);
  });
});

describe("selectSoloQuestions", () => {
  it("returns a single concept's questions when given a concept id", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: "integrity",
      difficulty: "all",
    });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((q) => q.concept === "integrity")).toBe(true);
  });

  it("draws from every concept for an all-topics round", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: null,
      difficulty: "all",
    });
    expect(picked).toHaveLength(CYBER_QUESTIONS.length);
    expect(new Set(picked.map((q) => q.concept)).size).toBe(CONCEPT_IDS.length);
  });

  it("filters by difficulty", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const picked = selectSoloQuestions(CYBER_QUESTIONS, { conceptId: null, difficulty });
      expect(picked.length).toBeGreaterThan(0);
      expect(picked.every((q) => q.difficulty === difficulty)).toBe(true);
    }
  });

  it("combines concept and difficulty filters", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: "authentication",
      difficulty: "easy",
    });
    expect(picked.every((q) => q.concept === "authentication" && q.difficulty === "easy")).toBe(true);
  });

  it("caps the round when a limit is given", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: null,
      difficulty: "all",
      limit: 3,
    });
    expect(picked).toHaveLength(3);
  });

  it("ignores a limit larger than the pool", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: "integrity",
      difficulty: "all",
      limit: 99,
    });
    expect(picked.length).toBeLessThanOrEqual(CYBER_QUESTIONS.length);
    expect(picked.every((q) => q.concept === "integrity")).toBe(true);
  });

  // The bank is small, so a concept+difficulty combination can legitimately
  // be empty. It must return [] rather than silently falling back.
  it("returns an empty list when no question matches", () => {
    const picked = selectSoloQuestions(CYBER_QUESTIONS, {
      conceptId: "not_a_concept",
      difficulty: "hard",
    });
    expect(picked).toEqual([]);
  });
});

describe("difficultyAvailability", () => {
  it("reports a count for every difficulty option", () => {
    const counts = difficultyAvailability(CYBER_QUESTIONS, null);
    for (const level of SOLO_DIFFICULTIES) {
      expect(typeof counts[level]).toBe("number");
    }
  });

  it("counts 'all' as the size of the whole bank", () => {
    expect(difficultyAvailability(CYBER_QUESTIONS, null).all).toBe(CYBER_QUESTIONS.length);
  });

  it("splits the bank across the three difficulties", () => {
    const c = difficultyAvailability(CYBER_QUESTIONS, null);
    expect(c.easy + c.medium + c.hard).toBe(c.all);
  });

  it("scopes counts to a concept", () => {
    const counts = difficultyAvailability(CYBER_QUESTIONS, "integrity");
    const total = CYBER_QUESTIONS.filter((q) => q.concept === "integrity").length;
    expect(counts.all).toBe(total);
    expect(counts.easy + counts.medium + counts.hard).toBe(total);
  });

  it("reports zero for a concept with no questions", () => {
    const counts = difficultyAvailability(CYBER_QUESTIONS, "not_a_concept");
    expect(counts).toEqual({ all: 0, easy: 0, medium: 0, hard: 0 });
  });
});
