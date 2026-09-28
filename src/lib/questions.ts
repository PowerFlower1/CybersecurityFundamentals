import type { Question } from "../constants";

/** Difficulty choice for solo practice; "all" means no filtering. */
export type SoloDifficulty = "all" | "easy" | "medium" | "hard";

export const SOLO_DIFFICULTIES: SoloDifficulty[] = ["all", "easy", "medium", "hard"];

export interface SoloSelection {
  /** A concept id, or null for an all-topics round. */
  conceptId: string | null;
  difficulty: SoloDifficulty;
  /** Optional cap on how many questions to serve (used by all-topics rounds). */
  limit?: number;
}

/**
 * Pick the questions for a solo round.
 *
 * Handles both modes the campaign offers: a single concept, or all topics
 * (`conceptId: null`). Difficulty is applied on top of either.
 */
export function selectSoloQuestions(bank: Question[], sel: SoloSelection): Question[] {
  let pool = sel.conceptId ? bank.filter((q) => q.concept === sel.conceptId) : [...bank];

  if (sel.difficulty !== "all") {
    pool = pool.filter((q) => q.difficulty === sel.difficulty);
  }

  if (sel.limit !== undefined && sel.limit > 0) {
    pool = pool.slice(0, sel.limit);
  }
  return pool;
}

/**
 * How many questions exist for each difficulty, given a concept (or all
 * topics). Lets the UI show counts and disable choices that would produce an
 * empty round — important while the bank is small.
 */
export function difficultyAvailability(
  bank: Question[],
  conceptId: string | null,
): Record<SoloDifficulty, number> {
  const counts = { all: 0, easy: 0, medium: 0, hard: 0 } as Record<SoloDifficulty, number>;
  for (const difficulty of SOLO_DIFFICULTIES) {
    counts[difficulty] = selectSoloQuestions(bank, { conceptId, difficulty }).length;
  }
  return counts;
}

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

/**
 * Repair a persisted question bank against the built-in one.
 *
 * The Cloudflare GlobalDO stores the question bank, so a bank saved before a
 * schema field existed keeps being served forever and silently disables every
 * feature that depends on that field. This happened in production: a bank
 * saved before questions carried a `concept` was still being served months
 * later, which left concept filtering, the standards report and item analysis
 * with nothing to group by.
 *
 * Rather than discard a stored bank (which would throw away instructor edits),
 * fill in the metadata that is missing, matching on question id. Custom
 * questions with no built-in counterpart are passed through untouched.
 */
export function reconcileBank(
  stored: unknown,
  builtIn: Question[],
): { questions: Question[]; repaired: boolean } {
  if (!Array.isArray(stored)) return { questions: builtIn, repaired: false };

  const byId = new Map(builtIn.map((q) => [q.id, q]));
  let repaired = false;

  const questions = stored.map((raw: any) => {
    const reference = byId.get(raw?.id);
    if (!reference) return raw as Question;

    const patched = { ...raw } as Question;
    if (!patched.concept && reference.concept) {
      patched.concept = reference.concept;
      repaired = true;
    }
    if (!patched.standards && reference.standards) {
      patched.standards = reference.standards;
      repaired = true;
    }
    return patched;
  });

  return { questions, repaired };
}
