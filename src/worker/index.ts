/// <reference types="@cloudflare/workers-types" />

// Cloudflare Pages Worker (Advanced mode). Serves the static client via the
// ASSETS binding and implements the same /api the Node server does, backed by
// Durable Objects instead of in-memory Maps.
import { Hono } from "hono";
import { RoomDO } from "./room-do";
import { GlobalDO } from "./global-do";
import { createToken, verifyToken, passwordMatches } from "./auth";
import { computeMetrics } from "../lib/metrics";

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace;
  GLOBAL: DurableObjectNamespace;
  APP_PASSWORD?: string;
  GEMINI_API_KEY?: string;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

const password = (env: Env) => env.APP_PASSWORD || "readyforce";
const globalStub = (env: Env) => env.GLOBAL.get(env.GLOBAL.idFromName("global"));
const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

function callDO(stub: DurableObjectStub, action: string, body?: unknown): Promise<Response> {
  return stub.fetch(`https://do/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function isInstructor(env: Env, authHeader: string | undefined): Promise<boolean> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return verifyToken(password(env), token);
}

// Proxy a Durable Object's JSON Response straight back to the client.
const proxy = (res: Response) => new Response(res.body, res);

const app = new Hono<{ Bindings: Env }>();
const api = new Hono<{ Bindings: Env }>();

api.post("/auth/login", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  const rl = await (
    await callDO(globalStub(c.env), "rate", { key: `login:${ip}`, limit: 5, windowMs: 60_000 })
  ).json<{ limited: boolean }>();
  if (rl.limited) return c.json({ error: "Too many attempts. Try again later." }, 429);
  const { password: pw } = await c.req.json().catch(() => ({}) as any);
  if (typeof pw !== "string" || !(await passwordMatches(pw, password(c.env)))) {
    return c.json({ error: "Incorrect password." }, 401);
  }
  return c.json({ token: await createToken(password(c.env)) });
});

api.get("/questions", async (c) => proxy(await callDO(globalStub(c.env), "questions:get")));

api.put("/questions", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(globalStub(c.env), "questions:set", { questions: body.questions }));
});

api.post("/session", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const body = await c.req.json().catch(() => ({}) as any);
  const code = newCode();

  // A game-show room grades answers itself, so hand it a snapshot of the
  // question bank (which otherwise lives in GlobalDO) at creation time.
  let questions: unknown[] | undefined;
  if (body.mode === "gameshow") {
    const res = await callDO(globalStub(c.env), "questions:get");
    if (res.ok) questions = ((await res.json()) as { questions: unknown[] }).questions;
  }

  await callDO(roomStub(c.env, code), "create", { code, ...body, questions });
  await callDO(globalStub(c.env), "rooms:add", { code });
  return c.json({ code });
});

api.get("/sessions", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const { rooms } = await (await callDO(globalStub(c.env), "rooms:list")).json<{
    rooms: { code: string; createdAt: number }[];
  }>();
  const sessions: any[] = [];
  for (const { code, createdAt } of rooms) {
    const res = await callDO(roomStub(c.env, code), "state");
    if (res.ok) {
      const r: any = await res.json();
      sessions.push({ code, status: r.status, difficulty: r.difficulty, playerCount: r.players.length, createdAt });
    }
  }
  sessions.sort((a, b) => b.createdAt - a.createdAt);
  return c.json({ sessions });
});

api.get("/session/:code", async (c) =>
  proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "state")),
);

api.post("/session/:code/join", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "join", body));
});

api.post("/session/:code/settings", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "settings", body));
});

api.post("/session/:code/start", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "start", body));
});

api.post("/session/:code/end", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "end", {}));
});

// ---- Game show ---------------------------------------------------------
api.post("/session/:code/spin", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "spin", {}));
});

api.post("/session/:code/next-turn", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "next-turn", {}));
});

// Players answer directly — the Durable Object checks the player token and
// that it is actually their team's turn.
api.post("/session/:code/answer", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "answer", body));
});

api.delete("/session/:code", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const code = c.req.param("code").toUpperCase();
  await callDO(roomStub(c.env, code), "destroy", {});
  await callDO(globalStub(c.env), "rooms:remove", { code });
  return c.json({ ok: true });
});

api.post("/session/:code/score", async (c) => {
  const body = await c.req.json().catch(() => ({}) as any);
  return proxy(await callDO(roomStub(c.env, c.req.param("code").toUpperCase()), "score", body));
});

api.get("/metrics", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  const { rooms } = await (await callDO(globalStub(c.env), "rooms:list")).json<{ rooms: { code: string }[] }>();
  const allPlayers: any[] = [];
  for (const { code } of rooms) {
    const res = await callDO(roomStub(c.env, code), "metrics");
    if (res.ok) {
      const d: any = await res.json();
      allPlayers.push(...d.players);
    }
  }

  return c.json(computeMetrics(allPlayers));
});

api.post("/metrics/analyze", async (c) => {
  if (!(await isInstructor(c.env, c.req.header("Authorization")))) {
    return c.json({ error: "Instructor sign-in required." }, 401);
  }
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "AI suggestions are not configured." }, 503);
  const { metrics } = await c.req.json().catch(() => ({}) as any);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are an expert instructional designer and game metric analyst. Based on the following metrics, suggest 3 practical improvements for the assessment or teaching plan.\n\nMetrics:\n${JSON.stringify(metrics, null, 2)}\n\nProvide your analysis in JSON format with an array of "suggestions", each containing a "title" and "description".`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                suggestions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { title: { type: "STRING" }, description: { type: "STRING" } },
                    required: ["title", "description"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }),
      },
    );
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from AI");
    return c.json(JSON.parse(text));
  } catch (e) {
    console.error("Gemini error:", e);
    return c.json({ error: "Failed to fetch AI suggestions." }, 500);
  }
});

app.route("/api", api);

// Everything else is a static asset served by Pages.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
export { RoomDO, GlobalDO };
