import { describe, it, expect } from "vitest";
import {
  normalizeTimePerQuestion,
  isUntimedLimit,
  UNTIMED,
} from "../src/lib/session-settings";

describe("normalizeTimePerQuestion", () => {
  it("keeps ordinary timed values", () => {
    for (const v of [10, 20, 30, 45, 60]) {
      expect(normalizeTimePerQuestion(v)).toBe(v);
    }
  });

  // The whole point of this helper: `Number(0) || 20` would yield 20 and
  // silently discard the accommodation.
  it("preserves 0 as the untimed sentinel rather than treating it as absent", () => {
    expect(normalizeTimePerQuestion(0)).toBe(UNTIMED);
    expect(normalizeTimePerQuestion("0")).toBe(UNTIMED);
  });

  it("falls back for values that are not numbers", () => {
    expect(normalizeTimePerQuestion(undefined)).toBe(20);
    expect(normalizeTimePerQuestion("abc")).toBe(20);
    expect(normalizeTimePerQuestion(NaN)).toBe(20);
  });

  // Number(null), Number(""), Number(false) and Number([]) are all 0. Without
  // an explicit guard these would silently switch a session to untimed.
  it("does not treat falsy non-numbers as the untimed sentinel", () => {
    for (const bad of [null, "", "   ", false, true, [], {}]) {
      expect(normalizeTimePerQuestion(bad), `input: ${JSON.stringify(bad)}`).toBe(20);
    }
  });

  it("falls back for negative values", () => {
    expect(normalizeTimePerQuestion(-5)).toBe(20);
  });

  it("respects an explicit fallback, including keeping an existing untimed setting", () => {
    expect(normalizeTimePerQuestion("nonsense", 45)).toBe(45);
    expect(normalizeTimePerQuestion(undefined, UNTIMED)).toBe(UNTIMED);
  });

  it("caps absurdly long limits", () => {
    expect(normalizeTimePerQuestion(99999)).toBe(600);
  });

  it("floors fractional seconds", () => {
    expect(normalizeTimePerQuestion(20.9)).toBe(20);
  });
});

describe("isUntimedLimit", () => {
  it("identifies the untimed sentinel", () => {
    expect(isUntimedLimit(0)).toBe(true);
    expect(isUntimedLimit(20)).toBe(false);
  });
});
