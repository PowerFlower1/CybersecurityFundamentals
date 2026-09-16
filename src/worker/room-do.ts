/// <reference types="@cloudflare/workers-types" />

import { normalizeTimePerQuestion } from "../lib/session-settings";
import type { Question } from "../constants";
import {
  type GameShowState,
  createGameShowState,
  assignTeam,
  spinWheel,
  applySpin,
  applyAnswer,
  nextTurn,
  activeTeam,
} from "../lib/gameshow";

// One Durable Object instance per room code. Holds the live session state that
// the in-memory Map held in the Node server — but durably and consistently,
// which is what makes this work on Cloudflare's serverless runtime.

export interface PlayerRec {
  id: string;
  token: string;
  name: string;
  score: number;
  history: any[];
  /** Game-show mode only: which team this player plays for. */
  teamId?: string;
}

export interface RoomRec {
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
  players: Record<string, PlayerRec>;
  /** Present only in game-show mode. */
  gameshow?: GameShowState;
  /**
   * Snapshot of the question bank taken when a game-show room is created.
   * The bank itself lives in GlobalDO, but copying it here keeps spinning and
   * grading inside this object (no cross-DO call per spin) and means editing
   * the bank mid-game cannot change a game already in progress.
   */
  questions?: Question[];
  /** Question ids already used this game, so spins don't repeat them. */
  usedQuestionIds?: string[];
}

function publicRoom(r: RoomRec) {
  return {
    code: r.code,
    status: r.status,
    mode: r.mode,
    difficulty: r.difficulty,
    questionCount: r.questionCount,
    timePerQuestion: r.timePerQuestion,
    endTime: r.endTime,
    hostName: r.hostName,
    players: Object.values(r.players)
      .map((p) => ({ id: p.id, name: p.name, score: p.score, teamId: p.teamId }))
      .sort((a, b) => b.score - a.score),
    // The in-play question is sent without its answer key — answers are
    // graded in here, so the correct answer never reaches a browser.
    gameshow: r.gameshow
      ? { ...r.gameshow, question: publicQuestion(r, r.gameshow.questionId) }
      : undefined,
  };
}

function publicQuestion(r: RoomRec, questionId: string | null) {
  if (!questionId) return null;
  const q = (r.questions ?? []).find((x) => x.id === questionId);
  if (!q) return null;
  return { id: q.id, question: q.question, options: q.options, concept: q.concept, difficulty: q.difficulty };
}

/** Pick a question for a spin, avoiding ones already used this game. */
function pickGameShowQuestion(r: RoomRec): Question | null {
  const bank = r.questions ?? [];
  const used = new Set(r.usedQuestionIds ?? []);
  let pool = bank.filter((q) => !used.has(q.id));
  if (r.difficulty !== "all") {
    const byDifficulty = pool.filter((q) => q.difficulty === r.difficulty);
    if (byDifficulty.length > 0) pool = byDifficulty;
  }
  // Every question used — recycle rather than stall the game.
  if (pool.length === 0) {
    r.usedQuestionIds = [];
    pool = bank;
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export class RoomDO {
  constructor(private state: DurableObjectState) {}

  private async room(): Promise<RoomRec | null> {
    return (await this.state.storage.get<RoomRec>("room")) ?? null;
  }
  private async save(r: RoomRec): Promise<void> {
    await this.state.storage.put("room", r);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\//, "");
    const body: any = request.method !== "GET" ? await request.json().catch(() => ({})) : {};
    const json = (data: unknown, status = 200) => Response.json(data, { status });

    if (action === "create") {
      const gameshowMode = body.mode === "gameshow";
      const r: RoomRec = {
        code: body.code,
        status: "waiting",
        mode: gameshowMode ? "gameshow" : "quiz",
        difficulty: ["all", "easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "all",
        questionCount: Number(body.questionCount) || 10,
        timePerQuestion: normalizeTimePerQuestion(body.timePerQuestion),
        endTime: 0,
        hostName: typeof body.hostName === "string" && body.hostName ? body.hostName.slice(0, 50) : "Instructor",
        createdAt: Date.now(),
        players: {},
        gameshow: gameshowMode ? createGameShowState(Number(body.teamCount) || 2) : undefined,
        // The worker passes the bank in, since it lives in GlobalDO.
        questions: gameshowMode && Array.isArray(body.questions) ? body.questions : undefined,
        usedQuestionIds: [],
      };
      await this.save(r);
      return json({ code: r.code });
    }

    const r = await this.room();
    if (!r) return json({ error: "Session not found." }, 404);

    switch (action) {
      case "state":
        return json(publicRoom(r));

      case "join": {
        if (r.status === "finished") return json({ error: "This session has already ended." }, 409);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return json({ error: "A name is required." }, 400);
        if (Object.keys(r.players).length >= 200) return json({ error: "This session is full." }, 409);
        const id = crypto.randomUUID();
        const token = crypto.randomUUID().replace(/-/g, "");

        // In game-show mode put the player on the smallest team.
        let teamId: string | undefined;
        if (r.mode === "gameshow" && r.gameshow) {
          const sizes: Record<string, number> = {};
          for (const p of Object.values(r.players)) {
            if (p.teamId) sizes[p.teamId] = (sizes[p.teamId] ?? 0) + 1;
          }
          teamId = assignTeam(r.gameshow.teams, sizes);
        }

        r.players[id] = { id, token, name: name.slice(0, 50), score: 0, history: [], teamId };
        await this.save(r);
        return json({ playerId: id, playerToken: token, teamId, room: publicRoom(r) });
      }

      case "settings": {
        if (r.status !== "waiting") {
          return json({ error: "Settings can only change before the session starts." }, 409);
        }
        if (["all", "easy", "medium", "hard"].includes(body.difficulty)) r.difficulty = body.difficulty;
        if (Number(body.questionCount) > 0) r.questionCount = Number(body.questionCount);
        // 0 is valid here — it selects the untimed accommodation.
        if (body.timePerQuestion !== undefined) {
          r.timePerQuestion = normalizeTimePerQuestion(body.timePerQuestion, r.timePerQuestion);
        }
        await this.save(r);
        return json(publicRoom(r));
      }

      case "start": {
        const minutes = Math.min(120, Math.max(1, Number(body.durationMinutes) || 5));
        r.status = "started";
        r.endTime = Date.now() + minutes * 60 * 1000;
        await this.save(r);
        return json({ endTime: r.endTime });
      }

      case "end": {
        r.status = "finished";
        r.endTime = Date.now();
        await this.save(r);
        return json({ ok: true });
      }

      case "score": {
        const p = r.players[body.playerId];
        if (!p || p.token !== body.playerToken) return json({ error: "Invalid player." }, 403);
        const next = Number(body.score);
        if (Number.isFinite(next) && next >= p.score && next <= 100000) p.score = next;
        if (Array.isArray(body.history)) p.history = body.history.slice(0, 100);
        await this.save(r);
        return json({ ok: true });
      }

      // ---- Game show ----------------------------------------------------
      case "spin": {
        if (r.mode !== "gameshow" || !r.gameshow) {
          return json({ error: "This session is not in game-show mode." }, 409);
        }
        if (r.gameshow.phase !== "idle") {
          return json({ error: "Finish the current turn before spinning again." }, 409);
        }
        const segment = spinWheel();
        const question = segment.kind === "points" ? pickGameShowQuestion(r) : null;
        if (question) r.usedQuestionIds = [...(r.usedQuestionIds ?? []), question.id];
        r.gameshow = applySpin(r.gameshow, segment, question?.id ?? null);
        await this.save(r);
        return json(publicRoom(r));
      }

      case "answer": {
        if (r.mode !== "gameshow" || !r.gameshow) {
          return json({ error: "This session is not in game-show mode." }, 409);
        }
        const p = r.players[body.playerId];
        if (!p || p.token !== body.playerToken) return json({ error: "Invalid player." }, 403);
        if (r.gameshow.phase !== "question") {
          return json({ error: "There is no question to answer right now." }, 409);
        }
        const team = activeTeam(r.gameshow);
        if (!team || p.teamId !== team.id) {
          return json({ error: "It is not your team's turn." }, 403);
        }
        const question = (r.questions ?? []).find((q) => q.id === r.gameshow!.questionId);
        if (!question) return json({ error: "Question is no longer available." }, 409);

        // Graded here so the answer key never leaves the Durable Object.
        const correct =
          typeof body.answer === "string" &&
          body.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();

        p.history.push({
          question: { id: question.id, question: question.question, concept: question.concept, difficulty: question.difficulty },
          correct,
          timeTaken: 0,
        });
        r.gameshow = applyAnswer(r.gameshow, correct);
        await this.save(r);
        return json({ correct, correctAnswer: question.correctAnswer, room: publicRoom(r) });
      }

      case "next-turn": {
        if (r.mode !== "gameshow" || !r.gameshow) {
          return json({ error: "This session is not in game-show mode." }, 409);
        }
        r.gameshow = nextTurn(r.gameshow);
        await this.save(r);
        return json(publicRoom(r));
      }

      case "metrics":
        return json({ players: Object.values(r.players) });

      case "destroy":
        await this.state.storage.deleteAll();
        return json({ ok: true });

      default:
        return json({ error: "Unknown action." }, 404);
    }
  }
}
