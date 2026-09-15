// Shared session-setting normalisation, used by the Node server and the
// Cloudflare Worker's RoomDO so validation can't drift between runtimes.

/** Sentinel for the extended-time accommodation: no per-question limit. */
export const UNTIMED = 0;

/**
 * Normalise a per-question time limit.
 *
 * 0 is meaningful (it means "untimed"), so this deliberately avoids the
 * `Number(v) || fallback` idiom, which would treat 0 as absent.
 */
export function normalizeTimePerQuestion(value: unknown, fallback = 20): number {
  // Guard the coercion traps before calling Number(): Number(null),
  // Number(""), Number(false) and Number([]) all produce 0, which would
  // silently switch a session to untimed on malformed input.
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;

  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  // Cap at 10 minutes per question; anything longer is effectively untimed.
  if (n > 600) return 600;
  return Math.floor(n);
}

/** True when a room's per-question limit means "no limit". */
export function isUntimedLimit(timePerQuestion: number): boolean {
  return timePerQuestion === UNTIMED;
}
