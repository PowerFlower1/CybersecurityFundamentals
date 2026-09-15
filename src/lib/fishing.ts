// Logic for the fishing game loop that wraps each question.
//
// The loop is: idle → cast → wait for a bite → hooked → reel → question.
// Answer correctly and you land the fish; miss and it gets away.
//
// Scoring deliberately lives in App.tsx and is NOT changed by the fish tier —
// the catch is flavour. Keeping the points formula identical means metrics
// stay comparable with sessions recorded before the game existed.

export type FishingPhase =
  | "idle"      // rod ready, waiting for the player to cast
  | "casting"   // line in flight
  | "waiting"   // bobber in the water, waiting for a bite
  | "hooked"    // a fish is on — prompt to reel
  | "reeling"   // reeling in
  | "question"  // the question is on screen
  | "landed"    // answered correctly
  | "escaped";  // answered incorrectly or ran out of time

/** Phase durations in ms. All collapse to 0 when reduced motion is requested. */
export const PHASE_MS = {
  casting: 700,
  reeling: 650,
  /** A bite lands somewhere in this range, so the wait doesn't feel scripted. */
  waitMin: 500,
  waitMax: 1400,
} as const;

export function biteDelay(reducedMotion: boolean, random: () => number = Math.random): number {
  if (reducedMotion) return 0;
  const { waitMin, waitMax } = PHASE_MS;
  return Math.round(waitMin + random() * (waitMax - waitMin));
}

export function phaseDuration(phase: FishingPhase, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  if (phase === "casting") return PHASE_MS.casting;
  if (phase === "reeling") return PHASE_MS.reeling;
  return 0;
}

/** Phases where a click / key press advances the loop. */
export function isInteractivePhase(phase: FishingPhase): boolean {
  return phase === "idle" || phase === "hooked";
}

/** What a tap does in the current phase, or null if taps are ignored. */
export function advanceOnInput(phase: FishingPhase): FishingPhase | null {
  if (phase === "idle") return "casting";
  if (phase === "hooked") return "reeling";
  return null;
}

export interface Fish {
  id: string;
  name: string;
  emoji: string;
  /** Tailwind text colour for the catch banner. */
  tone: string;
}

const FISH_BY_DIFFICULTY: Record<string, Fish> = {
  easy: { id: "minnow", name: "Minnow", emoji: "🐟", tone: "text-sky-300" },
  medium: { id: "bass", name: "Bass", emoji: "🐠", tone: "text-emerald-300" },
  hard: { id: "marlin", name: "Marlin", emoji: "🐡", tone: "text-amber-300" },
};

/** Harder questions hook rarer fish — flavour only, no scoring effect. */
export function fishForDifficulty(difficulty: string | undefined): Fish {
  return FISH_BY_DIFFICULTY[difficulty ?? ""] ?? FISH_BY_DIFFICULTY.easy;
}

/**
 * Answer tile styling. Each tile carries a distinct SHAPE and letter as well
 * as a colour, so the options remain distinguishable for colour-blind players
 * (colour alone would fail WCAG 1.4.1 "use of colour").
 */
export interface AnswerTileStyle {
  bg: string;
  hover: string;
  ring: string;
  shape: "triangle" | "diamond" | "circle" | "square";
  letter: string;
}

export const ANSWER_TILES: AnswerTileStyle[] = [
  { bg: "bg-amber-500", hover: "hover:bg-amber-400", ring: "ring-amber-300", shape: "triangle", letter: "A" },
  { bg: "bg-blue-600", hover: "hover:bg-blue-500", ring: "ring-blue-300", shape: "diamond", letter: "B" },
  { bg: "bg-emerald-500", hover: "hover:bg-emerald-400", ring: "ring-emerald-300", shape: "circle", letter: "C" },
  { bg: "bg-rose-500", hover: "hover:bg-rose-400", ring: "ring-rose-300", shape: "square", letter: "D" },
];

export function tileStyle(index: number): AnswerTileStyle {
  return ANSWER_TILES[index % ANSWER_TILES.length];
}
