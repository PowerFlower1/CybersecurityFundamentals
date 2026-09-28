// Rules engine for the live class game-show mode: a projected wheel, teams
// taking turns, and a question per spin.
//
// Everything here is pure so both runtimes (the Node server and the Cloudflare
// RoomDO) can share it and it can be tested without a server. The caller owns
// randomness — pass an `rng` to make a spin deterministic in tests.

export type WheelSegmentKind = "points" | "double" | "lose_turn" | "bankrupt";

export interface WheelSegment {
  id: string;
  kind: WheelSegmentKind;
  /** Point value for `points` segments; 0 otherwise. */
  value: number;
  label: string;
}

/**
 * The wheel face. Point values dominate so most spins lead to a question;
 * the hazards are what make it feel like the game show.
 */
export const WHEEL: WheelSegment[] = [
  { id: "p200", kind: "points", value: 200, label: "200" },
  { id: "p400", kind: "points", value: 400, label: "400" },
  { id: "lose1", kind: "lose_turn", value: 0, label: "Lose a Turn" },
  { id: "p600", kind: "points", value: 600, label: "600" },
  { id: "p800", kind: "points", value: 800, label: "800" },
  { id: "double1", kind: "double", value: 0, label: "Double" },
  { id: "p300", kind: "points", value: 300, label: "300" },
  { id: "p1000", kind: "points", value: 1000, label: "1000" },
  { id: "bankrupt1", kind: "bankrupt", value: 0, label: "Bankrupt" },
  { id: "p500", kind: "points", value: 500, label: "500" },
  { id: "p700", kind: "points", value: 700, label: "700" },
  { id: "p900", kind: "points", value: 900, label: "900" },
];

export interface Team {
  id: string;
  name: string;
  /** Tailwind-ish colour key the UI maps to classes. */
  color: string;
  score: number;
}

export const TEAM_PRESETS: { id: string; name: string; color: string }[] = [
  { id: "blue", name: "Blue Team", color: "blue" },
  { id: "red", name: "Red Team", color: "rose" },
  { id: "green", name: "Green Team", color: "emerald" },
  { id: "amber", name: "Gold Team", color: "amber" },
];

export const MIN_TEAMS = 2;
export const MAX_TEAMS = TEAM_PRESETS.length;

/** Phase of the current turn. */
export type GameShowPhase =
  | "idle" // waiting for the host to spin
  | "question" // a question is on screen, the active team may answer
  | "resolved"; // outcome shown, waiting for the host to advance

export interface GameShowState {
  teams: Team[];
  /** Index into `teams` whose turn it is. */
  turnIndex: number;
  phase: GameShowPhase;
  /** The segment from the most recent spin. */
  spin: WheelSegment | null;
  /** Question id currently in play. */
  questionId: string | null;
  /** True when the pending question is worth double. */
  doubleNext: boolean;
  /** Human-readable outcome of the last resolution, for the projector. */
  lastOutcome: string | null;
  /** Turns taken so far, used to end the game after a set number. */
  turnsTaken: number;
}

export function createTeams(count: number): Team[] {
  const n = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.floor(count) || MIN_TEAMS));
  return TEAM_PRESETS.slice(0, n).map((t) => ({ ...t, score: 0 }));
}

export function createGameShowState(teamCount: number): GameShowState {
  return {
    teams: createTeams(teamCount),
    turnIndex: 0,
    phase: "idle",
    spin: null,
    questionId: null,
    doubleNext: false,
    lastOutcome: null,
    turnsTaken: 0,
  };
}

/**
 * Assign a joining player to the smallest team, so teams stay balanced however
 * many students turn up.
 */
export function assignTeam(teams: Team[], teamSizes: Record<string, number>): string {
  if (teams.length === 0) return "";
  let best = teams[0];
  let bestSize = teamSizes[best.id] ?? 0;
  for (const team of teams.slice(1)) {
    const size = teamSizes[team.id] ?? 0;
    if (size < bestSize) {
      best = team;
      bestSize = size;
    }
  }
  return best.id;
}

/** Spin the wheel. `rng` returns [0,1); injectable so tests are deterministic. */
export function spinWheel(rng: () => number = Math.random): WheelSegment {
  const idx = Math.min(WHEEL.length - 1, Math.floor(rng() * WHEEL.length));
  return WHEEL[idx];
}

export const activeTeam = (s: GameShowState): Team | null => s.teams[s.turnIndex] ?? null;

/**
 * Apply a spin. Hazards resolve immediately (no question); point segments put
 * a question in play for the active team.
 */
export function applySpin(state: GameShowState, segment: WheelSegment, questionId: string | null): GameShowState {
  const team = activeTeam(state);
  if (!team) return state;

  switch (segment.kind) {
    case "lose_turn":
      return {
        ...state,
        spin: segment,
        phase: "resolved",
        questionId: null,
        lastOutcome: `${team.name} lost a turn.`,
      };

    case "bankrupt":
      return {
        ...state,
        spin: segment,
        phase: "resolved",
        questionId: null,
        doubleNext: false,
        teams: state.teams.map((t) => (t.id === team.id ? { ...t, score: 0 } : t)),
        lastOutcome: `Bankrupt! ${team.name} lost their points.`,
      };

    case "double":
      return {
        ...state,
        spin: segment,
        phase: "resolved",
        questionId: null,
        doubleNext: true,
        lastOutcome: `${team.name} doubles their next question.`,
      };

    case "points":
    default:
      return {
        ...state,
        spin: segment,
        phase: "question",
        questionId,
        lastOutcome: null,
      };
  }
}

/** Score the active team's answer and move to the resolved phase. */
export function applyAnswer(state: GameShowState, correct: boolean): GameShowState {
  const team = activeTeam(state);
  if (!team || state.phase !== "question" || !state.spin) return state;

  const base = state.spin.value;
  const awarded = correct ? base * (state.doubleNext ? 2 : 1) : 0;

  return {
    ...state,
    phase: "resolved",
    doubleNext: correct ? false : state.doubleNext,
    teams: state.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + awarded } : t)),
    lastOutcome: correct
      ? `${team.name} scored ${awarded}.`
      : `${team.name} missed it — no points.`,
  };
}

/** Hand play to the next team and reset per-turn state. */
export function nextTurn(state: GameShowState): GameShowState {
  if (state.teams.length === 0) return state;
  return {
    ...state,
    turnIndex: (state.turnIndex + 1) % state.teams.length,
    phase: "idle",
    spin: null,
    questionId: null,
    lastOutcome: null,
    turnsTaken: state.turnsTaken + 1,
  };
}

/** Teams ranked for the leaderboard: highest score first, then name. */
export function rankedTeams(state: GameShowState): Team[] {
  return [...state.teams].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
