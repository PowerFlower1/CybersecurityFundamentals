/// <reference types="@cloudflare/workers-types" />

// One Durable Object instance per room code. Holds the live session state that
// the in-memory Map held in the Node server — but durably and consistently,
// which is what makes this work on Cloudflare's serverless runtime.

export interface PlayerRec {
  id: string;
  token: string;
  name: string;
  score: number;
  history: any[];
}

export interface RoomRec {
  code: string;
  status: "waiting" | "started" | "finished";
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  endTime: number;
  hostName: string;
  createdAt: number;
  players: Record<string, PlayerRec>;
}

function publicRoom(r: RoomRec) {
  return {
    code: r.code,
    status: r.status,
    difficulty: r.difficulty,
    questionCount: r.questionCount,
    timePerQuestion: r.timePerQuestion,
    endTime: r.endTime,
    hostName: r.hostName,
    players: Object.values(r.players)
      .map((p) => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score),
  };
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
      const r: RoomRec = {
        code: body.code,
        status: "waiting",
        difficulty: ["all", "easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "all",
        questionCount: Number(body.questionCount) || 10,
        timePerQuestion: Number(body.timePerQuestion) || 20,
        endTime: 0,
        hostName: typeof body.hostName === "string" && body.hostName ? body.hostName.slice(0, 50) : "Instructor",
        createdAt: Date.now(),
        players: {},
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
        r.players[id] = { id, token, name: name.slice(0, 50), score: 0, history: [] };
        await this.save(r);
        return json({ playerId: id, playerToken: token, room: publicRoom(r) });
      }

      case "settings": {
        if (r.status !== "waiting") {
          return json({ error: "Settings can only change before the session starts." }, 409);
        }
        if (["all", "easy", "medium", "hard"].includes(body.difficulty)) r.difficulty = body.difficulty;
        if (Number(body.questionCount) > 0) r.questionCount = Number(body.questionCount);
        if (Number(body.timePerQuestion) > 0) r.timePerQuestion = Number(body.timePerQuestion);
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
