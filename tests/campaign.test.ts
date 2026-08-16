import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_PASS_THRESHOLD,
  hasPassedConcept,
  getMissedQuestions,
  nextConceptId,
  type AttemptEntry,
} from "../src/lib/campaign";
import type { Question, ConceptId } from "../src/constants";
import { CONCEPTS } from "../src/components/SoloMap";

function q(id: string): Question {
  return {
    id,
    concept: "integrity" as ConceptId,
    type: "mcq",
    question: `Question ${id}`,
    options: ["a", "b"],
    correctAnswer: "a",
    explanation: "because",
    difficulty: "easy",
  };
}

const attempt = (id: string, correct: boolean): AttemptEntry => ({
  question: q(id),
  correct,
  timeTaken: 3,
});

describe("hasPassedConcept", () => {
  it("passes at or above the threshold", () => {
    expect(hasPassedConcept(CAMPAIGN_PASS_THRESHOLD)).toBe(true);
    expect(hasPassedConcept(100)).toBe(true);
  });

  it("fails below the threshold", () => {
    expect(hasPassedConcept(CAMPAIGN_PASS_THRESHOLD - 1)).toBe(false);
    expect(hasPassedConcept(0)).toBe(false);
  });

  // The old gate was accuracy === 100, so 2/3 locked the learner out.
  it("no longer requires a perfect score", () => {
    expect(hasPassedConcept(80)).toBe(true);
    // 2 of 3 is 67%, still short — but 4 of 5 (80%) now passes.
    expect(hasPassedConcept(67)).toBe(false);
  });
});

describe("getMissedQuestions", () => {
  it("returns only the incorrect questions", () => {
    const history = [attempt("1", true), attempt("2", false), attempt("3", false)];
    expect(getMissedQuestions(history).map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("returns an empty list for a perfect attempt", () => {
    expect(getMissedQuestions([attempt("1", true), attempt("2", true)])).toEqual([]);
  });

  it("handles an empty history", () => {
    expect(getMissedQuestions([])).toEqual([]);
  });

  it("preserves the original order", () => {
    const history = [attempt("3", false), attempt("1", false), attempt("2", false)];
    expect(getMissedQuestions(history).map((x) => x.id)).toEqual(["3", "1", "2"]);
  });

  // A retry round can itself be re-missed; the set must not accumulate dupes.
  it("de-duplicates a question missed more than once", () => {
    const history = [attempt("1", false), attempt("1", false), attempt("2", false)];
    expect(getMissedQuestions(history).map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("returns whole question objects so a retry round can replay them", () => {
    const [missed] = getMissedQuestions([attempt("7", false)]);
    expect(missed).toMatchObject({ id: "7", correctAnswer: "a", explanation: "because" });
  });
});

describe("nextConceptId", () => {
  it("returns the following concept in the path", () => {
    expect(nextConceptId(CONCEPTS, CONCEPTS[0].id)).toBe(CONCEPTS[1].id);
  });

  it("returns null for the final concept", () => {
    expect(nextConceptId(CONCEPTS, CONCEPTS[CONCEPTS.length - 1].id)).toBeNull();
  });

  it("returns null for unknown or missing ids", () => {
    expect(nextConceptId(CONCEPTS, "not_a_concept")).toBeNull();
    expect(nextConceptId(CONCEPTS, null)).toBeNull();
  });

  it("walks the whole path without gaps", () => {
    const visited = [CONCEPTS[0].id];
    let cur: string | null = CONCEPTS[0].id;
    while ((cur = nextConceptId(CONCEPTS, cur))) visited.push(cur);
    expect(visited).toEqual(CONCEPTS.map((c) => c.id));
  });
});
