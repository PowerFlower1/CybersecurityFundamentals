import { describe, it, expect } from "vitest";
import {
  advanceOnInput,
  biteDelay,
  fishForDifficulty,
  isInteractivePhase,
  phaseDuration,
  tileStyle,
  ANSWER_TILES,
  PHASE_MS,
  type FishingPhase,
} from "../src/lib/fishing";

describe("phase progression", () => {
  it("casts from idle and reels from hooked", () => {
    expect(advanceOnInput("idle")).toBe("casting");
    expect(advanceOnInput("hooked")).toBe("reeling");
  });

  it("ignores input during automatic phases", () => {
    for (const phase of ["casting", "waiting", "reeling", "question", "landed", "escaped"] as FishingPhase[]) {
      expect(advanceOnInput(phase), `phase ${phase}`).toBeNull();
    }
  });

  it("marks only idle and hooked as interactive", () => {
    expect(isInteractivePhase("idle")).toBe(true);
    expect(isInteractivePhase("hooked")).toBe(true);
    expect(isInteractivePhase("waiting")).toBe(false);
    expect(isInteractivePhase("question")).toBe(false);
  });

  it("completes a full loop from idle to the question", () => {
    // idle --tap--> casting --auto--> waiting --auto--> hooked --tap--> reeling --auto--> question
    let phase: FishingPhase = "idle";
    phase = advanceOnInput(phase)!;
    expect(phase).toBe("casting");
    phase = "waiting";
    phase = "hooked";
    phase = advanceOnInput(phase)!;
    expect(phase).toBe("reeling");
  });
});

describe("timing", () => {
  it("uses the configured durations for animated phases", () => {
    expect(phaseDuration("casting", false)).toBe(PHASE_MS.casting);
    expect(phaseDuration("reeling", false)).toBe(PHASE_MS.reeling);
  });

  it("has no duration for phases that are not animated", () => {
    expect(phaseDuration("idle", false)).toBe(0);
    expect(phaseDuration("question", false)).toBe(0);
  });

  // Reduced motion must collapse the arcade beats to zero rather than just
  // shortening them, so the loop stays usable without animation.
  it("collapses every duration under reduced motion", () => {
    expect(phaseDuration("casting", true)).toBe(0);
    expect(phaseDuration("reeling", true)).toBe(0);
    expect(biteDelay(true)).toBe(0);
  });

  it("keeps the bite delay inside the configured window", () => {
    expect(biteDelay(false, () => 0)).toBe(PHASE_MS.waitMin);
    expect(biteDelay(false, () => 1)).toBe(PHASE_MS.waitMax);
    const mid = biteDelay(false, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(PHASE_MS.waitMin);
    expect(mid).toBeLessThanOrEqual(PHASE_MS.waitMax);
  });
});

describe("fishForDifficulty", () => {
  it("returns a distinct fish per difficulty", () => {
    const ids = ["easy", "medium", "hard"].map((d) => fishForDifficulty(d).id);
    expect(new Set(ids).size).toBe(3);
  });

  it("falls back for unknown or missing difficulty", () => {
    expect(fishForDifficulty(undefined).id).toBe("minnow");
    expect(fishForDifficulty("nonsense").id).toBe("minnow");
  });

  it("always provides a name and emoji to display", () => {
    for (const d of ["easy", "medium", "hard", undefined]) {
      const fish = fishForDifficulty(d);
      expect(fish.name).toBeTruthy();
      expect(fish.emoji).toBeTruthy();
    }
  });
});

describe("answer tiles", () => {
  it("provides four distinct colours", () => {
    expect(new Set(ANSWER_TILES.map((t) => t.bg)).size).toBe(4);
  });

  // Colour alone would fail WCAG 1.4.1, so each tile also carries a unique
  // shape and letter.
  it("pairs every colour with a unique shape and letter", () => {
    expect(new Set(ANSWER_TILES.map((t) => t.shape)).size).toBe(4);
    expect(new Set(ANSWER_TILES.map((t) => t.letter)).size).toBe(4);
  });

  it("assigns tiles by index and wraps safely beyond four options", () => {
    expect(tileStyle(0)).toBe(ANSWER_TILES[0]);
    expect(tileStyle(3)).toBe(ANSWER_TILES[3]);
    expect(tileStyle(4)).toBe(ANSWER_TILES[0]);
    expect(tileStyle(9)).toBe(ANSWER_TILES[1]);
  });
});
