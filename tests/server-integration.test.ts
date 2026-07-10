import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { CYBER_QUESTIONS } from "../src/constants";

// Black-box integration tests: spawn the real server.ts (via tsx) as a child
// process on a dedicated test port, then exercise it purely over HTTP — no
// imports from server.ts, so this proves the actual running server behaves
// correctly end to end.

const require = createRequire(import.meta.url);
// tsx's package.json "exports" map blocks resolving "tsx/dist/cli.mjs"
// directly, so resolve the (exported) package.json and join the known
// relative path ourselves instead of going through module resolution.
const TSX_CLI = path.join(path.dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = 3799;
const BASE = `http://localhost:${PORT}`;
const TEST_PASSWORD = "integration-test-pw";

let child: ChildProcess;

async function waitForServer(timeoutMs = 20_000) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/questions`);
      if (res.ok) return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms: ${lastError}`);
}

async function login(ip: string, password = TEST_PASSWORD) {
  return fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ password }),
  });
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  child = spawn(
    process.execPath,
    [TSX_CLI, "server.ts"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(PORT), APP_PASSWORD: TEST_PASSWORD, DISABLE_HMR: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await waitForServer();
}, 30_000);

afterAll(() => {
  child?.kill();
});

describe("GET /api/questions", () => {
  it("serves the question bank without authentication", async () => {
    const res = await fetch(`${BASE}/api/questions`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.questions).toHaveLength(CYBER_QUESTIONS.length);
  });
});

describe("POST /api/auth/login", () => {
  it("rejects an incorrect password", async () => {
    const res = await login("10.0.0.1", "definitely-wrong");
    expect(res.status).toBe(401);
  });

  it("issues a signed token for the correct password", async () => {
    const res = await login("10.0.0.2");
    expect(res.status).toBe(200);
    const { token }: any = await res.json();
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it("rate-limits after 5 attempts per IP within a minute", async () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 5; i++) {
      const res = await login(ip, "wrong");
      expect(res.status).toBe(401);
    }
    const sixth = await login(ip, "wrong");
    expect(sixth.status).toBe(429);

    // Even the correct password is blocked once the bucket is exhausted.
    const stillBlocked = await login(ip, TEST_PASSWORD);
    expect(stillBlocked.status).toBe(429);
  });
});

describe("instructor-only routes", () => {
  it("reject requests with no Authorization header", async () => {
    const noAuth = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
    expect((await fetch(`${BASE}/api/session`, noAuth)).status).toBe(401);
    expect((await fetch(`${BASE}/api/sessions`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/metrics`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/questions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
  });

  it("reject a malformed or bogus token", async () => {
    const res = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: authHeaders("garbage.notarealtoken"),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe("session lifecycle", () => {
  it("supports create → join → settings → start → score → end → delete", async () => {
    const loginRes = await login("10.0.0.4");
    const { token } = (await loginRes.json()) as { token: string };

    // Create.
    const createRes = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ difficulty: "all", questionCount: 5, timePerQuestion: 20 }),
    });
    expect(createRes.status).toBe(200);
    const { code } = (await createRes.json()) as { code: string };
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Initial state.
    const initial: any = await (await fetch(`${BASE}/api/session/${code}`)).json();
    expect(initial).toMatchObject({ status: "waiting", players: [] });

    // Join requires a name.
    const emptyName = await fetch(`${BASE}/api/session/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });
    expect(emptyName.status).toBe(400);

    // Join for real.
    const joinRes = await fetch(`${BASE}/api/session/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });
    expect(joinRes.status).toBe(200);
    const { playerId, playerToken } = (await joinRes.json()) as { playerId: string; playerToken: string };

    // Settings can change while waiting.
    const settingsRes = await fetch(`${BASE}/api/session/${code}/settings`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ timePerQuestion: 45 }),
    });
    expect(settingsRes.status).toBe(200);
    const settingsBody: any = await settingsRes.json();
    expect(settingsBody.timePerQuestion).toBe(45);

    // Start.
    const startRes = await fetch(`${BASE}/api/session/${code}/start`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ durationMinutes: 5 }),
    });
    expect(startRes.status).toBe(200);
    const { endTime } = (await startRes.json()) as { endTime: number };
    expect(endTime).toBeGreaterThan(Date.now());

    // Settings lock once started.
    const lockedRes = await fetch(`${BASE}/api/session/${code}/settings`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ timePerQuestion: 10 }),
    });
    expect(lockedRes.status).toBe(409);

    // Wrong player token is rejected.
    const wrongToken = await fetch(`${BASE}/api/session/${code}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerToken: "nope", score: 999, history: [] }),
    });
    expect(wrongToken.status).toBe(403);

    // Valid score submission.
    const scoreRes = await fetch(`${BASE}/api/session/${code}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerToken, score: 300, history: [] }),
    });
    expect(scoreRes.status).toBe(200);

    const afterScore: any = await (await fetch(`${BASE}/api/session/${code}`)).json();
    expect(afterScore.players).toEqual([{ id: playerId, name: "Alice", score: 300 }]);

    // End.
    const endRes = await fetch(`${BASE}/api/session/${code}/end`, {
      method: "POST",
      headers: authHeaders(token),
      body: "{}",
    });
    expect(endRes.status).toBe(200);
    const afterEnd: any = await (await fetch(`${BASE}/api/session/${code}`)).json();
    expect(afterEnd.status).toBe("finished");

    // Delete.
    const deleteRes = await fetch(`${BASE}/api/session/${code}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    expect(deleteRes.status).toBe(200);
    const goneRes = await fetch(`${BASE}/api/session/${code}`);
    expect(goneRes.status).toBe(404);
  }, 15_000);

  it("returns 404 for a nonexistent session code", async () => {
    const getRes = await fetch(`${BASE}/api/session/ZZZZZZ`);
    expect(getRes.status).toBe(404);

    const joinRes = await fetch(`${BASE}/api/session/ZZZZZZ/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Someone" }),
    });
    expect(joinRes.status).toBe(404);
  });
});
