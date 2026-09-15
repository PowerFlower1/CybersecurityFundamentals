import type { Question } from "../constants";

/**
 * Pick the questions belonging to one campaign concept.
 *
 * This filters on each question's `concept` tag rather than slicing the bank
 * positionally, so questions can be added to (or removed from) any concept
 * without changing what the other concepts serve.
 */
export function selectConceptQuestions(
  bank: Question[],
  conceptId: string | null,
): Question[] {
  if (!conceptId) return [];
  return bank.filter((q) => q.concept === conceptId);
}
