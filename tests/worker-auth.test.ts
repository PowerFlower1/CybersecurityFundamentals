import { describe, it, expect, vi, afterEach } from "vitest";
import { createToken, verifyToken, passwordMatches } from "../src/worker/auth";

describe("createToken / verifyToken", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a token verified with the same secret it was created with", async () => {
    const token = await createToken("secret");
    expect(await verifyToken("secret", token)).toBe(true);
  });

  it("rejects a token verified with a different secret", async () => {
    const token = await createToken("secret-a");
    expect(await verifyToken("secret-b", token)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createToken("secret");
    const [exp, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
    expect(await verifyToken("secret", `${exp}.${flipped}`)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyToken("secret", "")).toBe(false);
    expect(await verifyToken("secret", "no-dot-here")).toBe(false);
    expect(await verifyToken("secret", "123456.")).toBe(false);
    expect(await verifyToken("secret", ".abcdef")).toBe(false);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const start = new Date(2030, 0, 1);
    vi.setSystemTime(start);

    const token = await createToken("secret");
    // Advance well past the 12-hour TTL.
    vi.setSystemTime(new Date(start.getTime() + 13 * 60 * 60 * 1000));

    expect(await verifyToken("secret", token)).toBe(false);
  });

  it("accepts a token that has not yet expired", async () => {
    vi.useFakeTimers();
    const start = new Date(2030, 0, 1);
    vi.setSystemTime(start);

    const token = await createToken("secret");
    // Advance, but stay within the 12-hour TTL.
    vi.setSystemTime(new Date(start.getTime() + 1 * 60 * 60 * 1000));

    expect(await verifyToken("secret", token)).toBe(true);
  });
});

describe("passwordMatches", () => {
  it("returns true for identical passwords", async () => {
    expect(await passwordMatches("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different passwords of the same length", async () => {
    expect(await passwordMatches("hunter2", "hunter3")).toBe(false);
  });

  it("returns false for passwords of different lengths", async () => {
    expect(await passwordMatches("short", "a-much-longer-password")).toBe(false);
  });

  it("returns false against an empty expected password", async () => {
    expect(await passwordMatches("anything", "")).toBe(false);
  });
});
