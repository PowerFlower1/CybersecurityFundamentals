import express from "express";
import path from "path";
import crypto from "crypto";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { CYBER_QUESTIONS, type Question } from "./src/constants";
import { computeMetrics } from "./src/lib/metrics";
import { normalizeTimePerQuestion } from "./src/lib/session-settings";
import {
  type GameShowState,
  createGameShowState,
  assignTeam,
  spinWheel,
  applySpin,
  applyAnswer,
  nextTurn,
  activeTeam,
} from "./src/lib/gameshow";

// ---------------------------------------------------------------------------
// Auth: a single shared instructor password, exchanged for a signed token.
// ---------------------------------------------------------------------------
const APP_PASSWORD = process.env.APP_PASSWORD || "readyforce";
const TOKEN_SECRET = crypto
  .createHash("sha256")
  .update(`rfc-token-secret:${APP_PASSWORD}`)
  .digest();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function createToken(): string {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

function verifyToken(token: string): boolean {
  const [exp, sig] = (token || "").split(".");
  if (!exp || !sig) return false;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(exp).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return false;
    }
  } catch {
    return false;
  }
  return Number(exp) > Date.now();
}

function safeCompare(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function bearer(req: express.Request): string {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function requireInstructor(req: express.Request, res: express.Response): boolean {
  if (!verifyToken(bearer(req))) {
    res.status(401).json({ error: "Instructor sign-in required." });
    return false;
  }
  return true;
}

// Simple in-memory rate limiter per key.
const requestLog = new Map<string, number[]>();
function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    requestLog.set(key, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(key, recent);
  return false;
}

// ---------------------------------------------------------------------------
// In-memory session store. Replaces Firestore for the host/join/play loop, so
// no Firebase security rules are involved.
// NOTE: state lives in this single process — rooms reset on restart and are not
// shared across multiple server instances. Fine for a classroom run on one
// server; use a shared store (Redis/DB) if you scale horizontally.
// ---------------------------------------------------------------------------
interface HistoryEntry {
  // `id` and `concept` are what the metrics item-analysis groups by, so keep
  // this in step with MetricsHistoryEntry in src/lib/metrics.ts.
  question?: { id?: string; question?: string; concept?: string; difficulty?: string };
  correct?: boolean;
  timeTaken?: number;
}
interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  history: HistoryEntry[];
  /** Game-show mode only: which team this player plays for. */
  teamId?: string;
}
interface Room {
  code: string;
  status: "waiting" | "started" | "finished";
  /** "quiz" is the original everyone-answers mode; "gameshow" is team play. */
  mode: "quiz" | "gameshow";
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  endTime: number;
  hostName: string;
  createdAt: number;
  players: Map<string, Player>;
  /** Present only in game-show mode. */
  gameshow?: GameShowState;
  /** Question ids already used this game, so spins don't repeat them. */
  usedQuestionIds?: string[];
}

const rooms = new Map<string, Room>();
let questionBank: Question[] = CYBER_QUESTIONS.map((q) => ({ ...q }));

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
function sweepRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += alphabet[crypto.randomInt(alphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

function publicRoom(room: Room) {
  return {
    code: room.code,
    status: room.status,
    mode: room.mode,
    difficulty: room.difficulty,
    questionCount: room.questionCount,
    timePerQuestion: room.timePerQuestion,
    endTime: room.endTime,
    hostName: room.hostName,
    players: [...room.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score, teamId: p.teamId }))
      .sort((a, b) => b.score - a.score),
    // Game-show state, including the question currently in play. The correct
    // answer is never sent — answers are graded server-side.
    gameshow: room.gameshow
      ? { ...room.gameshow, question: publicQuestion(room.gameshow.questionId) }
      : undefined,
  };
}

/** The in-play question, stripped of its answer key. */
function publicQuestion(questionId: string | null) {
  if (!questionId) return null;
  const q = questionBank.find((x) => x.id === questionId);
  if (!q) return null;
  return { id: q.id, question: q.question, options: q.options, concept: q.concept, difficulty: q.difficulty };
}

/** Pick a question for a spin, avoiding ones already used this game. */
function pickGameShowQuestion(room: Room): Question | null {
  const used = new Set(room.usedQuestionIds ?? []);
  let pool = questionBank.filter((q) => !used.has(q.id));
  if (room.difficulty !== "all") {
    const byDifficulty = pool.filter((q) => q.difficulty === room.difficulty);
    if (byDifficulty.length > 0) pool = byDifficulty;
  }
  // Every question used — recycle rather than stall the game.
  if (pool.length === 0) {
    room.usedQuestionIds = [];
    pool = questionBank;
  }
  if (pool.length === 0) return null;
  return pool[crypto.randomInt(pool.length)];
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust one proxy hop (e.g. Cloud Run / a load balancer) so req.ip and the
  // login rate limiter see the real client IP rather than the proxy's address.
  app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "500kb" }));

  // ---- Auth -------------------------------------------------------------
  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip ?? "unknown";
    // 5 attempts per IP per minute.
    if (isRateLimited(`login:${ip}`, 5, 60 * 1000)) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !safeCompare(password, APP_PASSWORD)) {
      return res.status(401).json({ error: "Incorrect password." });
    }
    res.json({ token: createToken() });
  });

  // ---- Question bank ----------------------------------------------------
  app.get("/api/questions", (_req, res) => {
    res.json({ questions: questionBank });
  });

  app.put("/api/questions", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const { questions } = req.body ?? {};
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: "Expected an array of questions." });
    }
    questionBank = questions.slice(0, 500);
    res.json({ questions: questionBank });
  });

  // ---- Sessions ---------------------------------------------------------
  app.post("/api/session", (req, res) => {
    if (!requireInstructor(req, res)) return;
    sweepRooms();
    const { difficulty, questionCount, timePerQuestion, hostName, mode, teamCount } = req.body ?? {};
    const code = newCode();
    const gameshowMode = mode === "gameshow";
    rooms.set(code, {
      code,
      status: "waiting",
      mode: gameshowMode ? "gameshow" : "quiz",
      difficulty: ["all", "easy", "medium", "hard"].includes(difficulty) ? difficulty : "all",
      questionCount: Number(questionCount) || 10,
      timePerQuestion: normalizeTimePerQuestion(timePerQuestion),
      endTime: 0,
      hostName: typeof hostName === "string" && hostName ? hostName.slice(0, 50) : "Instructor",
      createdAt: Date.now(),
      players: new Map(),
      gameshow: gameshowMode ? createGameShowState(Number(teamCount) || 2) : undefined,
      usedQuestionIds: [],
    });
    res.json({ code });
  });

  app.get("/api/sessions", (req, res) => {
    if (!requireInstructor(req, res)) return;
    sweepRooms();
    const list = [...rooms.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        code: r.code,
        status: r.status,
        difficulty: r.difficulty,
        playerCount: r.players.size,
        createdAt: r.createdAt,
      }));
    res.json({ sessions: list });
  });

  app.get("/api/session/:code", (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    res.json(publicRoom(room));
  });

  app.post("/api/session/:code/join", (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found. Check the code." });
    if (room.status === "finished") {
      return res.status(409).json({ error: "This session has already ended." });
    }
    const { name } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "A name is required." });
    }
    if (room.players.size >= 200) {
      return res.status(409).json({ error: "This session is full." });
    }
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString("hex");

    // In game-show mode put the player on the smallest team so sides stay even.
    let teamId: string | undefined;
    if (room.mode === "gameshow" && room.gameshow) {
      const sizes: Record<string, number> = {};
      for (const p of room.players.values()) {
        if (p.teamId) sizes[p.teamId] = (sizes[p.teamId] ?? 0) + 1;
      }
      teamId = assignTeam(room.gameshow.teams, sizes);
    }

    room.players.set(id, { id, token, name: name.trim().slice(0, 50), score: 0, history: [], teamId });
    res.json({ playerId: id, playerToken: token, teamId, room: publicRoom(room) });
  });

  // ---- Game show --------------------------------------------------------
  /** Host spins the wheel; hazards resolve at once, points put a question up. */
  app.post("/api/session/:code/spin", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    if (room.mode !== "gameshow" || !room.gameshow) {
      return res.status(409).json({ error: "This session is not in game-show mode." });
    }
    if (room.gameshow.phase !== "idle") {
      return res.status(409).json({ error: "Finish the current turn before spinning again." });
    }

    const segment = spinWheel();
    const question = segment.kind === "points" ? pickGameShowQuestion(room) : null;
    if (question) room.usedQuestionIds = [...(room.usedQuestionIds ?? []), question.id];
    room.gameshow = applySpin(room.gameshow, segment, question?.id ?? null);
    res.json(publicRoom(room));
  });

  /** A player on the active team answers the question in play. */
  app.post("/api/session/:code/answer", (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    if (room.mode !== "gameshow" || !room.gameshow) {
      return res.status(409).json({ error: "This session is not in game-show mode." });
    }
    const { playerId, playerToken, answer } = req.body ?? {};
    const player = room.players.get(playerId);
    if (!player || player.token !== playerToken) {
      return res.status(403).json({ error: "Invalid player." });
    }
    if (room.gameshow.phase !== "question") {
      return res.status(409).json({ error: "There is no question to answer right now." });
    }
    const team = activeTeam(room.gameshow);
    if (!team || player.teamId !== team.id) {
      return res.status(403).json({ error: "It is not your team's turn." });
    }

    const question = questionBank.find((q) => q.id === room.gameshow!.questionId);
    if (!question) return res.status(409).json({ error: "Question is no longer available." });

    // Graded server-side so the answer key never reaches the client.
    const correct =
      typeof answer === "string" &&
      answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();

    player.history.push({ question: { id: question.id, question: question.question, concept: question.concept, difficulty: question.difficulty }, correct, timeTaken: 0 });
    room.gameshow = applyAnswer(room.gameshow, correct);
    res.json({ correct, correctAnswer: question.correctAnswer, room: publicRoom(room) });
  });

  /** Host hands play to the next team. */
  app.post("/api/session/:code/next-turn", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    if (room.mode !== "gameshow" || !room.gameshow) {
      return res.status(409).json({ error: "This session is not in game-show mode." });
    }
    room.gameshow = nextTurn(room.gameshow);
    res.json(publicRoom(room));
  });

  app.post("/api/session/:code/settings", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    if (room.status !== "waiting") {
      return res.status(409).json({ error: "Settings can only change before the session starts." });
    }
    const { difficulty, questionCount, timePerQuestion } = req.body ?? {};
    if (["all", "easy", "medium", "hard"].includes(difficulty)) room.difficulty = difficulty;
    if (Number(questionCount) > 0) room.questionCount = Number(questionCount);
    // 0 is valid here — it selects the untimed accommodation.
    if (timePerQuestion !== undefined) {
      room.timePerQuestion = normalizeTimePerQuestion(timePerQuestion, room.timePerQuestion);
    }
    res.json(publicRoom(room));
  });

  app.post("/api/session/:code/start", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    const minutes = Math.min(120, Math.max(1, Number(req.body?.durationMinutes) || 5));
    room.status = "started";
    room.endTime = Date.now() + minutes * 60 * 1000;
    res.json({ endTime: room.endTime });
  });

  app.post("/api/session/:code/end", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    room.status = "finished";
    room.endTime = Date.now();
    res.json({ ok: true });
  });

  app.delete("/api/session/:code", (req, res) => {
    if (!requireInstructor(req, res)) return;
    rooms.delete(req.params.code.toUpperCase());
    res.json({ ok: true });
  });

  app.post("/api/session/:code/score", (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Session not found." });
    const { playerId, playerToken, score, history } = req.body ?? {};
    const player = room.players.get(playerId);
    if (!player || player.token !== playerToken) {
      return res.status(403).json({ error: "Invalid player." });
    }
    // Server-side anti-cheat, mirroring the old Firestore rules.
    const next = Number(score);
    if (Number.isFinite(next) && next >= player.score && next <= 100000) {
      player.score = next;
    }
    if (Array.isArray(history)) {
      player.history = history.slice(0, 100);
    }
    res.json({ ok: true });
  });

  // ---- Metrics + AI -----------------------------------------------------
  app.get("/api/metrics", (req, res) => {
    if (!requireInstructor(req, res)) return;
    const allPlayers = [...rooms.values()].flatMap((r) => [...r.players.values()]);
    res.json(computeMetrics(allPlayers));
  });

  app.post("/api/metrics/analyze", async (req, res) => {
    try {
      if (!requireInstructor(req, res)) return;
      if (isRateLimited("metrics", 10, 10 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many requests. Try again later." });
      }
      const { metrics } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert instructional designer and game metric analyst. Based on the following metrics, suggest 3 practical improvements for the assessment or teaching plan.

Metrics:
${JSON.stringify(metrics, null, 2)}

Provide your analysis in JSON format with an array of "suggestions", each containing a "title" and "description".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["title", "description"],
                },
              },
            },
            required: ["suggestions"],
          },
        },
      });
      const suggestionsStr = response.text;
      if (!suggestionsStr) throw new Error("No response from AI");
      res.json(JSON.parse(suggestionsStr));
    } catch (e) {
      console.error("Gemini Error:", e);
      res.status(500).json({ error: "Failed to fetch AI suggestions." });
    }
  });

  // ---- Static / Vite ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
