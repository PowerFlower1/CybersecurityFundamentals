// CSV generation for instructor exports (gradebook / grant reporting).
//
// Student names are free text typed by learners, so two things matter here:
//   1. Correct RFC 4180 quoting for commas, quotes and newlines.
//   2. Formula-injection defence — a cell starting with = + - @ (or a
//      tab/carriage return) is executed as a formula by Excel and Sheets,
//      which turns "type your name" into a code-execution vector for anyone
//      who later opens the export. See CWE-1236.

import type { StudentStat } from "./metrics";

const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/** Quote and escape a single CSV cell, neutralising spreadsheet formulas. */
export function escapeCsvValue(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);

  // Neutralise a leading formula trigger by prefixing an apostrophe, which
  // spreadsheets treat as "this is literal text".
  if (s.length > 0 && FORMULA_TRIGGERS.includes(s[0])) {
    s = `'${s}`;
  }

  // Always quote, and double any embedded quotes. Quoting unconditionally
  // keeps output predictable and handles commas/newlines for free.
  return `"${s.replace(/"/g, '""')}"`;
}

/** Join rows into a CSV document (CRLF line endings, per RFC 4180). */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
}

export const STUDENT_CSV_HEADERS = [
  "Name",
  "Score",
  "Questions Attempted",
  "Correct",
  "Accuracy (%)",
  "Total Time (s)",
] as const;

/** Build the per-student results CSV shown in the admin metrics tab. */
export function studentsToCsv(students: StudentStat[]): string {
  const rows: unknown[][] = [
    [...STUDENT_CSV_HEADERS],
    ...students.map((s) => [
      s.name,
      s.score,
      s.attempted,
      s.correct,
      s.accuracy,
      s.completionTime,
    ]),
  ];
  return toCsv(rows);
}

/** Timestamped filename, e.g. ready-force-labs-results-2026-08-16.csv */
export function csvFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `ready-force-labs-results-${stamp}.csv`;
}
