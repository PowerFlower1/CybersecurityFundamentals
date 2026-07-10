import { describe, it, expect, vi, afterEach } from "vitest";
import { RoomDO } from "../src/worker/room-do";
import { GlobalDO } from "../src/worker/global-do";
import { CYBER_QUESTIONS } from "../src/constants";

// Minimal in-memory fake of the one DurableObjectState surface both DOs
// actually use: state.storage.get/put/deleteAll. Good enough to exercise the
// real fetch() handlers without needing the Workers runtime.
function fakeState() {
  const map = new Map<string, any>();
  return {
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return map.get(key);
      },
      async put(key: string, value: any): Promise<void> {
        map.set(key, value);
      },
      async deleteAll(): Promise<void> {
        map.clear();
      },
    },
  } as any;
}

function req(action: string, body?: unknown) {
  return new Request(`https://do/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("RoomDO", () => {
  it("returns 404 for any action before the room is created", async () => {
    const room = new RoomDO(fakeState());
    const res = await room.fetch(req("state"));
    expect(res.status).toBe(404);
  });

  it("creates a room and reports its public state", async () => {
    const room = new RoomDO(fakeState());
    const created = await (await room.fetch(req("create", { code: "ABC123", difficulty: "hard", questionCount: 7, timePerQuestion: 15 }))).json();
    expect(created).toEqual({ code: "ABC123" });

    const state: any = await (await room.fetch(req("state"))).json();
    expect(state).toMatchObject({
      code: "ABC123",
      status: "waiting",
      difficulty: "hard",
      questionCount: 7,
      timePerQuestion: 15,
      players: [],
    });
  });

  it("falls back to defaults for an invalid difficulty and missing settings", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X", difficulty: "impossible" }));
    const state: any = await (await room.fetch(req("state"))).json();
    expect(state.difficulty).toBe("all");
    expect(state.questionCount).toBe(10);
    expect(state.timePerQuestion).toBe(20);
    expect(state.hostName).toBe("Instructor");
  });

  it("lets players join and rejects an empty name", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));

    const bad = await room.fetch(req("join", { name: "   " }));
    expect(bad.status).toBe(400);

    const joined: any = await (await room.fetch(req("join", { name: "Alice" }))).json();
    expect(joined.playerId).toBeTruthy();
    expect(joined.playerToken).toBeTruthy();
    expect(joined.room.players).toEqual([{ id: joined.playerId, name: "Alice", score: 0 }]);
  });

  it("rejects joining a finished session", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    await room.fetch(req("end", {}));

    const res = await room.fetch(req("join", { name: "Alice" }));
    expect(res.status).toBe(409);
  });

  it("locks settings once the session has started", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));

    const okBefore = await room.fetch(req("settings", { timePerQuestion: 45 }));
    expect(okBefore.status).toBe(200);

    await room.fetch(req("start", { durationMinutes: 5 }));

    const blocked = await room.fetch(req("settings", { timePerQuestion: 60 }));
    expect(blocked.status).toBe(409);
  });

  it("clamps the session duration to 1-120 minutes", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));

    const before = Date.now();
    const { endTime: tooLong }: any = await (await room.fetch(req("start", { durationMinutes: 999 }))).json();
    expect(tooLong - before).toBeLessThanOrEqual(120 * 60 * 1000 + 1000);

    await room.fetch(req("create", { code: "X" })); // reset back to waiting
    const before2 = Date.now();
    const { endTime: tooShort }: any = await (await room.fetch(req("start", { durationMinutes: 0 }))).json();
    expect(tooShort - before2).toBeGreaterThanOrEqual(1 * 60 * 1000 - 1000);
  });

  it("enforces score anti-cheat: monotonic, capped, own-token-only", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    const { playerId, playerToken }: any = await (await room.fetch(req("join", { name: "Alice" }))).json();

    // Wrong token is rejected.
    const wrongToken = await room.fetch(req("score", { playerId, playerToken: "nope", score: 999 }));
    expect(wrongToken.status).toBe(403);

    // Unknown player is rejected.
    const unknownPlayer = await room.fetch(req("score", { playerId: "ghost", playerToken, score: 999 }));
    expect(unknownPlayer.status).toBe(403);

    // A valid increase is accepted.
    await room.fetch(req("score", { playerId, playerToken, score: 500 }));
    let state: any = await (await room.fetch(req("state"))).json();
    expect(state.players[0].score).toBe(500);

    // A decrease is silently ignored.
    await room.fetch(req("score", { playerId, playerToken, score: 10 }));
    state = await (await room.fetch(req("state"))).json();
    expect(state.players[0].score).toBe(500);

    // A score above the 100000 cap is ignored.
    await room.fetch(req("score", { playerId, playerToken, score: 999999 }));
    state = await (await room.fetch(req("state"))).json();
    expect(state.players[0].score).toBe(500);

    // The cap itself is a valid score.
    await room.fetch(req("score", { playerId, playerToken, score: 100000 }));
    state = await (await room.fetch(req("state"))).json();
    expect(state.players[0].score).toBe(100000);
  });

  it("truncates submitted history to 100 entries", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    const { playerId, playerToken }: any = await (await room.fetch(req("join", { name: "Alice" }))).json();

    const longHistory = Array.from({ length: 150 }, (_, i) => ({ correct: true, timeTaken: i }));
    await room.fetch(req("score", { playerId, playerToken, score: 1, history: longHistory }));

    const metrics: any = await (await room.fetch(req("metrics"))).json();
    expect(metrics.players[0].history).toHaveLength(100);
  });

  it("sorts players by score descending in public state", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    const a: any = await (await room.fetch(req("join", { name: "Alice" }))).json();
    const b: any = await (await room.fetch(req("join", { name: "Bob" }))).json();
    await room.fetch(req("score", { playerId: a.playerId, playerToken: a.playerToken, score: 100 }));
    await room.fetch(req("score", { playerId: b.playerId, playerToken: b.playerToken, score: 900 }));

    const state: any = await (await room.fetch(req("state"))).json();
    expect(state.players.map((p: any) => p.name)).toEqual(["Bob", "Alice"]);
  });

  it("ends a session and marks it finished", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    await room.fetch(req("end", {}));
    const state: any = await (await room.fetch(req("state"))).json();
    expect(state.status).toBe("finished");
  });

  it("destroys a room so it no longer exists", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    await room.fetch(req("destroy", {}));
    const res = await room.fetch(req("state"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown action", async () => {
    const room = new RoomDO(fakeState());
    await room.fetch(req("create", { code: "X" }));
    const res = await room.fetch(req("nonsense"));
    expect(res.status).toBe(404);
  });
});

describe("GlobalDO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the built-in question bank before any questions are set", async () => {
    const g = new GlobalDO(fakeState());
    const { questions }: any = await (await g.fetch(req("questions:get"))).json();
    expect(questions).toEqual(CYBER_QUESTIONS);
  });

  it("stores and returns a custom question bank", async () => {
    const g = new GlobalDO(fakeState());
    const custom = [{ id: "1", question: "Q?", correctAnswer: "A" }];
    await g.fetch(req("questions:set", { questions: custom }));
    const { questions }: any = await (await g.fetch(req("questions:get"))).json();
    expect(questions).toEqual(custom);
  });

  it("stores an empty array (not the fallback) when questions is not an array", async () => {
    const g = new GlobalDO(fakeState());
    await g.fetch(req("questions:set", { questions: "not-an-array" }));
    const { questions }: any = await (await g.fetch(req("questions:get"))).json();
    expect(questions).toEqual([]);
  });

  it("rate-limits after the Nth attempt within the window", async () => {
    const g = new GlobalDO(fakeState());
    const body = { key: "login:1.2.3.4", limit: 3, windowMs: 60_000 };

    const r1: any = await (await g.fetch(req("rate", body))).json();
    const r2: any = await (await g.fetch(req("rate", body))).json();
    const r3: any = await (await g.fetch(req("rate", body))).json();
    const r4: any = await (await g.fetch(req("rate", body))).json();

    expect([r1.limited, r2.limited, r3.limited]).toEqual([false, false, false]);
    expect(r4.limited).toBe(true);
  });

  it("resets the rate limit once the window passes", async () => {
    vi.useFakeTimers();
    const start = new Date(2030, 0, 1);
    vi.setSystemTime(start);

    const g = new GlobalDO(fakeState());
    const body = { key: "login:5.6.7.8", limit: 1, windowMs: 1000 };

    const first: any = await (await g.fetch(req("rate", body))).json();
    const second: any = await (await g.fetch(req("rate", body))).json();
    expect(first.limited).toBe(false);
    expect(second.limited).toBe(true);

    vi.setSystemTime(new Date(start.getTime() + 2000));
    const third: any = await (await g.fetch(req("rate", body))).json();
    expect(third.limited).toBe(false);
  });

  it("adds, lists, and removes rooms from the registry", async () => {
    const g = new GlobalDO(fakeState());
    await g.fetch(req("rooms:add", { code: "AAA" }));
    await g.fetch(req("rooms:add", { code: "BBB" }));

    let list: any = await (await g.fetch(req("rooms:list"))).json();
    expect(list.rooms.map((r: any) => r.code).sort()).toEqual(["AAA", "BBB"]);

    await g.fetch(req("rooms:remove", { code: "AAA" }));
    list = await (await g.fetch(req("rooms:list"))).json();
    expect(list.rooms.map((r: any) => r.code)).toEqual(["BBB"]);
  });

  it("returns 404 for an unknown action", async () => {
    const g = new GlobalDO(fakeState());
    const res = await g.fetch(req("nonsense"));
    expect(res.status).toBe(404);
  });
});
