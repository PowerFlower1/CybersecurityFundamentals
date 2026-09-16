import { describe, it, expect } from "vitest";
import {
  WHEEL,
  TEAM_PRESETS,
  MIN_TEAMS,
  MAX_TEAMS,
  createTeams,
  createGameShowState,
  assignTeam,
  spinWheel,
  applySpin,
  applyAnswer,
  nextTurn,
  rankedTeams,
  activeTeam,
  type WheelSegment,
} from "../src/lib/gameshow";

const seg = (id: string): WheelSegment => WHEEL.find((s) => s.id === id)!;

describe("the wheel", () => {
  it("has a segment of every kind", () => {
    const kinds = new Set(WHEEL.map((s) => s.kind));
    expect(kinds).toEqual(new Set(["points", "double", "lose_turn", "bankrupt"]));
  });

  it("uses unique segment ids", () => {
    expect(new Set(WHEEL.map((s) => s.id)).size).toBe(WHEEL.length);
  });

  it("is mostly point segments so most spins ask a question", () => {
    const points = WHEEL.filter((s) => s.kind === "points").length;
    expect(points / WHEEL.length).toBeGreaterThan(0.6);
  });

  it("gives every point segment a positive value and hazards zero", () => {
    for (const s of WHEEL) {
      if (s.kind === "points") expect(s.value).toBeGreaterThan(0);
      else expect(s.value).toBe(0);
    }
  });
});

describe("spinWheel", () => {
  it("returns the first segment for rng 0 and the last for rng approaching 1", () => {
    expect(spinWheel(() => 0)).toEqual(WHEEL[0]);
    expect(spinWheel(() => 0.9999)).toEqual(WHEEL[WHEEL.length - 1]);
  });

  it("never returns undefined, even if rng returns exactly 1", () => {
    expect(spinWheel(() => 1)).toBeDefined();
  });

  it("can reach every segment", () => {
    const seen = new Set<string>();
    for (let i = 0; i < WHEEL.length; i++) {
      seen.add(spinWheel(() => i / WHEEL.length).id);
    }
    expect(seen.size).toBe(WHEEL.length);
  });
});

describe("teams", () => {
  it("creates the requested number of teams", () => {
    expect(createTeams(3)).toHaveLength(3);
  });

  it("clamps to the supported range", () => {
    expect(createTeams(1)).toHaveLength(MIN_TEAMS);
    expect(createTeams(99)).toHaveLength(MAX_TEAMS);
    expect(createTeams(0)).toHaveLength(MIN_TEAMS);
  });

  it("starts every team on zero", () => {
    expect(createTeams(4).every((t) => t.score === 0)).toBe(true);
  });

  it("gives teams distinct names and colours", () => {
    const teams = createTeams(MAX_TEAMS);
    expect(new Set(teams.map((t) => t.name)).size).toBe(MAX_TEAMS);
    expect(new Set(teams.map((t) => t.color)).size).toBe(MAX_TEAMS);
  });
});

describe("assignTeam", () => {
  it("fills the smallest team so sides stay balanced", () => {
    const teams = createTeams(2);
    expect(assignTeam(teams, { blue: 3, red: 1 })).toBe("red");
  });

  it("picks the first team when all are equal", () => {
    const teams = createTeams(3);
    expect(assignTeam(teams, { blue: 2, red: 2, green: 2 })).toBe("blue");
  });

  it("treats a missing count as zero", () => {
    const teams = createTeams(2);
    expect(assignTeam(teams, { blue: 4 })).toBe("red");
  });

  it("balances a sequence of joins evenly", () => {
    const teams = createTeams(2);
    const sizes: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const id = assignTeam(teams, sizes);
      sizes[id] = (sizes[id] ?? 0) + 1;
    }
    expect(sizes).toEqual({ blue: 3, red: 3 });
  });
});

describe("applySpin", () => {
  it("puts a question in play for a points segment", () => {
    const s = applySpin(createGameShowState(2), seg("p600"), "q1");
    expect(s.phase).toBe("question");
    expect(s.questionId).toBe("q1");
    expect(s.spin?.value).toBe(600);
  });

  it("resolves Lose a Turn immediately with no question", () => {
    const s = applySpin(createGameShowState(2), seg("lose1"), "q1");
    expect(s.phase).toBe("resolved");
    expect(s.questionId).toBeNull();
    expect(s.lastOutcome).toMatch(/lost a turn/i);
  });

  it("zeroes the active team's score on Bankrupt", () => {
    let s = createGameShowState(2);
    s = { ...s, teams: s.teams.map((t, i) => (i === 0 ? { ...t, score: 2500 } : t)) };
    s = applySpin(s, seg("bankrupt1"), "q1");
    expect(s.teams[0].score).toBe(0);
    expect(s.phase).toBe("resolved");
    expect(s.lastOutcome).toMatch(/bankrupt/i);
  });

  it("only bankrupts the active team", () => {
    let s = createGameShowState(2);
    s = { ...s, teams: s.teams.map((t) => ({ ...t, score: 900 })) };
    s = applySpin(s, seg("bankrupt1"), null);
    expect(s.teams[0].score).toBe(0);
    expect(s.teams[1].score).toBe(900);
  });

  it("arms the double for the next question", () => {
    const s = applySpin(createGameShowState(2), seg("double1"), null);
    expect(s.doubleNext).toBe(true);
    expect(s.phase).toBe("resolved");
  });
});

describe("applyAnswer", () => {
  it("awards the segment value on a correct answer", () => {
    let s = applySpin(createGameShowState(2), seg("p800"), "q1");
    s = applyAnswer(s, true);
    expect(s.teams[0].score).toBe(800);
    expect(s.phase).toBe("resolved");
  });

  it("awards nothing on a wrong answer", () => {
    let s = applySpin(createGameShowState(2), seg("p800"), "q1");
    s = applyAnswer(s, false);
    expect(s.teams[0].score).toBe(0);
    expect(s.lastOutcome).toMatch(/missed/i);
  });

  it("doubles the award when the double is armed", () => {
    let s = applySpin(createGameShowState(2), seg("double1"), null);
    s = nextTurn(s); // double carries to this team's next spin
    s = { ...s, turnIndex: 0, doubleNext: true };
    s = applySpin(s, seg("p500"), "q1");
    s = applyAnswer(s, true);
    expect(s.teams[0].score).toBe(1000);
    expect(s.doubleNext).toBe(false); // consumed
  });

  it("keeps the double armed if the doubled question is missed", () => {
    let s = { ...createGameShowState(2), doubleNext: true };
    s = applySpin(s, seg("p500"), "q1");
    s = applyAnswer(s, false);
    expect(s.doubleNext).toBe(true);
  });

  it("ignores an answer when no question is in play", () => {
    const s = createGameShowState(2);
    expect(applyAnswer(s, true)).toEqual(s);
  });
});

describe("nextTurn", () => {
  it("cycles through teams and wraps around", () => {
    let s = createGameShowState(3);
    expect(activeTeam(s)!.id).toBe("blue");
    s = nextTurn(s);
    expect(activeTeam(s)!.id).toBe("red");
    s = nextTurn(s);
    expect(activeTeam(s)!.id).toBe("green");
    s = nextTurn(s);
    expect(activeTeam(s)!.id).toBe("blue");
  });

  it("clears per-turn state and counts the turn", () => {
    let s = applySpin(createGameShowState(2), seg("p400"), "q1");
    s = applyAnswer(s, true);
    s = nextTurn(s);
    expect(s).toMatchObject({ phase: "idle", spin: null, questionId: null, lastOutcome: null, turnsTaken: 1 });
  });

  it("preserves scores across turns", () => {
    let s = applySpin(createGameShowState(2), seg("p400"), "q1");
    s = applyAnswer(s, true);
    s = nextTurn(s);
    expect(s.teams[0].score).toBe(400);
  });
});

describe("rankedTeams", () => {
  it("sorts by score descending", () => {
    const s = createGameShowState(3);
    s.teams[0].score = 100;
    s.teams[1].score = 900;
    s.teams[2].score = 500;
    expect(rankedTeams(s).map((t) => t.score)).toEqual([900, 500, 100]);
  });

  it("breaks ties by name for a stable board", () => {
    const s = createGameShowState(2);
    expect(rankedTeams(s).map((t) => t.name)).toEqual(
      [...s.teams].map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("does not mutate the original team order", () => {
    const s = createGameShowState(3);
    s.teams[2].score = 999;
    const before = s.teams.map((t) => t.id);
    rankedTeams(s);
    expect(s.teams.map((t) => t.id)).toEqual(before);
  });
});

describe("a full round", () => {
  it("plays two teams through spins, hazards and scoring", () => {
    let s = createGameShowState(2);

    // Blue spins 600 and gets it right.
    s = applySpin(s, seg("p600"), "q1");
    s = applyAnswer(s, true);
    expect(s.teams[0].score).toBe(600);
    s = nextTurn(s);

    // Red hits Lose a Turn.
    s = applySpin(s, seg("lose1"), null);
    expect(s.teams[1].score).toBe(0);
    s = nextTurn(s);

    // Blue hits Bankrupt and loses the 600.
    s = applySpin(s, seg("bankrupt1"), null);
    expect(s.teams[0].score).toBe(0);
    s = nextTurn(s);

    // Red spins 1000 and wins it.
    s = applySpin(s, seg("p1000"), "q2");
    s = applyAnswer(s, true);
    expect(s.teams[1].score).toBe(1000);

    expect(rankedTeams(s)[0].id).toBe("red");
    expect(s.turnsTaken).toBe(3);
  });
});
