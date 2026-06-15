import express from "express";
import path from "path";
import crypto from "crypto";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { CYBER_QUESTIONS, type Question } from "./src/constants";

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
  question?: { difficulty?: string; question?: string };
  correct?: boolean;
  timeTaken?: number;
}
interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  history: HistoryEntry[];
}
interface Room {
  code: string;
  status: "waiting" | "started" | "finished";
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  endTime: number;
  hostName: string;
  createdAt: number;
  players: Map<string, Player>;
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
    difficulty: room.difficulty,
    questionCount: room.questionCount,
    timePerQuestion: room.timePerQuestion,
    endTime: room.endTime,
    hostName: room.hostName,
    players: [...room.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score),
  };
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "500kb" }));

  // ---- Auth -------------------------------------------------------------
  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip ?? "unknown";
    if (isRateLimited(`login:${ip}`, 10, 10 * 60 * 1000)) {
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
    const { difficulty, questionCount, timePerQuestion, hostName } = req.body ?? {};
    const code = newCode();
    rooms.set(code, {
      code,
      status: "waiting",
      difficulty: ["all", "easy", "medium", "hard"].includes(difficulty) ? difficulty : "all",
      questionCount: Number(questionCount) || 10,
      timePerQuestion: Number(timePerQuestion) || 20,
      endTime: 0,
      hostName: typeof hostName === "string" && hostName ? hostName.slice(0, 50) : "Instructor",
      createdAt: Date.now(),
      players: new Map(),
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
    room.players.set(id, { id, token, name: name.trim().slice(0, 50), score: 0, history: [] });
    res.json({ playerId: id, playerToken: token, room: publicRoom(room) });
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
    const totalStudents = allPlayers.length;
    const averageScore = totalStudents
      ? Math.round(allPlayers.reduce((acc, p) => acc + (p.score || 0), 0) / totalStudents)
      : 0;
    let totalQuestionsAttempted = 0;
    let totalCorrect = 0;
    const diffStats: Record<string, { attempted: number; correct: number }> = {};
    const students = allPlayers.map((p) => {
      let timeTaken = 0;
      const wrongQuestions: string[] = [];
      for (const h of p.history) {
        totalQuestionsAttempted++;
        if (h.correct) totalCorrect++;
        const d = h.question?.difficulty || "unknown";
        diffStats[d] = diffStats[d] || { attempted: 0, correct: 0 };
        diffStats[d].attempted++;
        if (h.correct) diffStats[d].correct++;
        timeTaken += h.timeTaken || 0;
        if (!h.correct) wrongQuestions.push(h.question?.question || "Unknown Question");
      }
      return { uid: p.id, name: p.name, score: p.score, completionTime: timeTaken, wrongQuestions };
    });
    res.json({
      totalStudents,
      averageScore,
      totalQuestionsAttempted,
      totalCorrect,
      accuracy: totalQuestionsAttempted
        ? Math.round((totalCorrect / totalQuestionsAttempted) * 100)
        : 0,
      skillBreakdown: diffStats,
      students,
    });
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
