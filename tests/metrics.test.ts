import { describe, it, expect } from "vitest";
import { computeMetrics, type MetricsPlayer } from "../src/lib/metrics";

function entry(id: string, correct: boolean, extra: Record<string, unknown> = {}) {
  return {
    question: { id, question: `Question ${id}`, concept: "integrity", difficulty: "easy", ...extra },
    correct,
    timeTaken: 5,
  };
}

describe("computeMetrics — totals", () => {
  it("returns zeroed metrics for no players", () => {
    const m = computeMetrics([]);
    expect(m).toMatchObject({
      totalStudents: 0,
      averageScore: 0,
      totalQuestionsAttempted: 0,
      totalCorrect: 0,
      accuracy: 0,
      students: [],
      questionStats: [],
    });
  });

  it("handles players that have no history yet", () => {
    const players: MetricsPlayer[] = [{ id: "p1", name: "Alice", score: 0 }];
    const m = computeMetrics(players);
    expect(m.totalStudents).toBe(1);
    expect(m.totalQuestionsAttempted).toBe(0);
    expect(m.accuracy).toBe(0);
    expect(m.questionStats).toEqual([]);
  });

  it("averages scores and computes overall accuracy", () => {
    const players: MetricsPlayer[] = [
      { id: "p1", name: "Alice", score: 300, history: [entry("1", true), entry("2", false)] },
      { id: "p2", name: "Bob", score: 500, history: [entry("1", true), entry("2", true)] },
    ];
    const m = computeMetrics(players);
    expect(m.totalStudents).toBe(2);
    expect(m.averageScore).toBe(400);
    expect(m.totalQuestionsAttempted).toBe(4);
    expect(m.totalCorrect).toBe(3);
    expect(m.accuracy).toBe(75);
  });

  it("breaks results down by difficulty", () => {
    const players: MetricsPlayer[] = [
      {
        id: "p1",
        name: "Alice",
        score: 0,
        history: [
          entry("1", true, { difficulty: "easy" }),
          entry("2", false, { difficulty: "hard" }),
          entry("3", true, { difficulty: "hard" }),
        ],
      },
    ];
    const m = computeMetrics(players);
    expect(m.skillBreakdown).toEqual({
      easy: { attempted: 1, correct: 1 },
      hard: { attempted: 2, correct: 1 },
    });
  });

  it("summarises each student", () => {
    const players: MetricsPlayer[] = [
      { id: "p1", name: "Alice", score: 300, history: [entry("1", true), entry("2", false)] },
    ];
    const [student] = computeMetrics(players).students;
    expect(student).toEqual({
      uid: "p1",
      name: "Alice",
      score: 300,
      completionTime: 10,
      wrongQuestions: ["Question 2"],
    });
  });
});

describe("computeMetrics — per-question item analysis", () => {
  it("aggregates attempts and correctness per question across students", () => {
    const players: MetricsPlayer[] = [
      { id: "p1", name: "Alice", score: 0, history: [entry("1", true), entry("2", false)] },
      { id: "p2", name: "Bob", score: 0, history: [entry("1", false), entry("2", false)] },
      { id: "p3", name: "Cara", score: 0, history: [entry("1", true), entry("2", false)] },
    ];
    const { questionStats } = computeMetrics(players);

    const q1 = questionStats.find((q) => q.id === "1")!;
    const q2 = questionStats.find((q) => q.id === "2")!;

    expect(q1).toMatchObject({ attempted: 3, correct: 2, percentMissed: 33 });
    expect(q2).toMatchObject({ attempted: 3, correct: 0, percentMissed: 100 });
  });

  it("sorts most-missed first", () => {
    const players: MetricsPlayer[] = [
      {
        id: "p1",
        name: "Alice",
        score: 0,
        history: [entry("easy-q", true), entry("hard-q", false), entry("mid-q", false)],
      },
      {
        id: "p2",
        name: "Bob",
        score: 0,
        history: [entry("easy-q", true), entry("hard-q", false), entry("mid-q", true)],
      },
    ];
    const { questionStats } = computeMetrics(players);
    expect(questionStats.map((q) => q.id)).toEqual(["hard-q", "mid-q", "easy-q"]);
    expect(questionStats[0].percentMissed).toBe(100);
    expect(questionStats.at(-1)!.percentMissed).toBe(0);
  });

  it("breaks ties by sample size so better-evidenced questions rank first", () => {
    const players: MetricsPlayer[] = [
      { id: "p1", name: "A", score: 0, history: [entry("wide", false), entry("narrow", false)] },
      { id: "p2", name: "B", score: 0, history: [entry("wide", false)] },
    ];
    const { questionStats } = computeMetrics(players);
    // Both are 100% missed, but "wide" has more attempts.
    expect(questionStats.map((q) => q.id)).toEqual(["wide", "narrow"]);
  });

  it("carries concept and difficulty through for grouping", () => {
    const players: MetricsPlayer[] = [
      {
        id: "p1",
        name: "A",
        score: 0,
        history: [entry("1", false, { concept: "authentication", difficulty: "hard" })],
      },
    ];
    const [stat] = computeMetrics(players).questionStats;
    expect(stat).toMatchObject({ concept: "authentication", difficulty: "hard" });
  });

  it("groups by question text when history entries predate question ids", () => {
    const players: MetricsPlayer[] = [
      {
        id: "p1",
        name: "A",
        score: 0,
        history: [{ question: { question: "Legacy question?" }, correct: false }],
      },
      {
        id: "p2",
        name: "B",
        score: 0,
        history: [{ question: { question: "Legacy question?" }, correct: true }],
      },
    ];
    const { questionStats } = computeMetrics(players);
    expect(questionStats).toHaveLength(1);
    expect(questionStats[0]).toMatchObject({
      question: "Legacy question?",
      attempted: 2,
      correct: 1,
      percentMissed: 50,
      concept: "unknown",
    });
  });

  it("tolerates history entries with no question payload at all", () => {
    const players: MetricsPlayer[] = [
      { id: "p1", name: "A", score: 0, history: [{ correct: false }, { correct: true }] },
    ];
    const { questionStats, totalQuestionsAttempted } = computeMetrics(players);
    expect(totalQuestionsAttempted).toBe(2);
    expect(questionStats).toHaveLength(1);
    expect(questionStats[0]).toMatchObject({ question: "Unknown Question", attempted: 2, correct: 1 });
  });
});
