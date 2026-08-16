// Shared instructor-metrics aggregation, used by both runtimes: the Node
// server (server.ts) and the Cloudflare Worker (src/worker/index.ts). Keeping
// it here means the two can't drift, and the logic is unit-testable without
// standing up either server.

export interface MetricsHistoryEntry {
  question?: {
    id?: string;
    question?: string;
    concept?: string;
    difficulty?: string;
  };
  correct?: boolean;
  timeTaken?: number;
}

export interface MetricsPlayer {
  id: string;
  name: string;
  score: number;
  history?: MetricsHistoryEntry[];
}

/** Per-question rollup — the "which questions did my class miss?" view. */
export interface QuestionStat {
  id: string;
  question: string;
  concept: string;
  difficulty: string;
  attempted: number;
  correct: number;
  /** 0-100, rounded. */
  percentMissed: number;
}

export interface StudentStat {
  uid: string;
  name: string;
  score: number;
  completionTime: number;
  attempted: number;
  correct: number;
  /** 0-100, rounded. */
  accuracy: number;
  wrongQuestions: string[];
}

export interface Metrics {
  totalStudents: number;
  averageScore: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  accuracy: number;
  skillBreakdown: Record<string, { attempted: number; correct: number }>;
  students: StudentStat[];
  questionStats: QuestionStat[];
}

export function computeMetrics(players: MetricsPlayer[]): Metrics {
  const totalStudents = players.length;
  const averageScore = totalStudents
    ? Math.round(players.reduce((acc, p) => acc + (p.score || 0), 0) / totalStudents)
    : 0;

  let totalQuestionsAttempted = 0;
  let totalCorrect = 0;
  const skillBreakdown: Record<string, { attempted: number; correct: number }> = {};

  // Keyed by question id where available, else by question text, so questions
  // are still grouped sensibly for older history entries without an id.
  const byQuestion = new Map<string, QuestionStat>();

  const students: StudentStat[] = players.map((p) => {
    let completionTime = 0;
    let attempted = 0;
    let correct = 0;
    const wrongQuestions: string[] = [];

    for (const h of p.history ?? []) {
      attempted++;
      if (h.correct) correct++;
      totalQuestionsAttempted++;
      if (h.correct) totalCorrect++;

      const difficulty = h.question?.difficulty || "unknown";
      skillBreakdown[difficulty] = skillBreakdown[difficulty] || { attempted: 0, correct: 0 };
      skillBreakdown[difficulty].attempted++;
      if (h.correct) skillBreakdown[difficulty].correct++;

      completionTime += h.timeTaken || 0;
      const text = h.question?.question || "Unknown Question";
      if (!h.correct) wrongQuestions.push(text);

      const key = h.question?.id || text;
      let stat = byQuestion.get(key);
      if (!stat) {
        stat = {
          id: h.question?.id || key,
          question: text,
          concept: h.question?.concept || "unknown",
          difficulty,
          attempted: 0,
          correct: 0,
          percentMissed: 0,
        };
        byQuestion.set(key, stat);
      }
      stat.attempted++;
      if (h.correct) stat.correct++;
    }

    return {
      uid: p.id,
      name: p.name,
      score: p.score,
      completionTime,
      attempted,
      correct,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      wrongQuestions,
    };
  });

  const questionStats = [...byQuestion.values()]
    .map((s) => ({
      ...s,
      percentMissed: s.attempted ? Math.round(((s.attempted - s.correct) / s.attempted) * 100) : 0,
    }))
    // Most-missed first; break ties by sample size, then id for stable output.
    .sort(
      (a, b) =>
        b.percentMissed - a.percentMissed ||
        b.attempted - a.attempted ||
        a.id.localeCompare(b.id),
    );

  return {
    totalStudents,
    averageScore,
    totalQuestionsAttempted,
    totalCorrect,
    accuracy: totalQuestionsAttempted
      ? Math.round((totalCorrect / totalQuestionsAttempted) * 100)
      : 0,
    skillBreakdown,
    students,
    questionStats,
  };
}
