import type { Question } from "../constants";

/**
 * Minimum accuracy (%) required to complete a concept and unlock the next one.
 *
 * This was previously 100%, which meant a single wrong answer in a three
 * question set locked the learner out and made them replay the identical
 * items. 80% leaves room for one slip in a five question set while still
 * requiring genuine mastery.
 */
export const CAMPAIGN_PASS_THRESHOLD = 80;

export interface AttemptEntry {
  question: Question;
  correct: boolean;
  timeTaken: number;
}

export function hasPassedConcept(accuracy: number): boolean {
  return accuracy >= CAMPAIGN_PASS_THRESHOLD;
}

/**
 * The distinct questions the learner answered incorrectly, in the order they
 * were first seen — the set replayed by "Retry missed questions".
 */
export function getMissedQuestions(history: AttemptEntry[]): Question[] {
  const seen = new Set<string>();
  const missed: Question[] = [];
  for (const entry of history) {
    if (entry.correct || !entry.question) continue;
    const key = entry.question.id || entry.question.question;
    if (seen.has(key)) continue;
    seen.add(key);
    missed.push(entry.question);
  }
  return missed;
}

/**
 * The concept unlocked by completing `conceptId`, or null when it is the last
 * one in the path.
 */
export function nextConceptId(
  concepts: { id: string }[],
  conceptId: string | null,
): string | null {
  if (!conceptId) return null;
  const idx = concepts.findIndex((c) => c.id === conceptId);
  if (idx === -1 || idx >= concepts.length - 1) return null;
  return concepts[idx + 1].id;
}
