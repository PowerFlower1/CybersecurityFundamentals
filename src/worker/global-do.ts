/// <reference types="@cloudflare/workers-types" />

// A single Durable Object instance (named "global") that holds cross-room state:
// the editable question bank, the login rate-limit counters, and a registry of
// active room codes (so the dashboard and metrics can enumerate sessions).
import { CYBER_QUESTIONS } from "../constants";

interface RateEntry {
  count: number;
  resetAt: number;
}

export class GlobalDO {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\//, "");
    const body: any = request.method !== "GET" ? await request.json().catch(() => ({})) : {};
    const json = (data: unknown, status = 200) => Response.json(data, { status });
    const storage = this.state.storage;

    switch (action) {
      case "questions:get": {
        const q = (await storage.get<any[]>("questions")) ?? CYBER_QUESTIONS;
        return json({ questions: q });
      }

      case "questions:set": {
        const q = Array.isArray(body.questions) ? body.questions.slice(0, 500) : [];
        await storage.put("questions", q);
        return json({ questions: q });
      }

      case "rate": {
        const { key, limit, windowMs } = body;
        const now = Date.now();
        const map = (await storage.get<Record<string, RateEntry>>("rate")) ?? {};
        // Prune expired entries so the map can't grow without bound.
        for (const k of Object.keys(map)) if (now > map[k].resetAt) delete map[k];
        const e = map[key];
        let limited = false;
        if (!e || now > e.resetAt) {
          map[key] = { count: 1, resetAt: now + windowMs };
        } else if (e.count >= limit) {
          limited = true;
        } else {
          e.count++;
        }
        await storage.put("rate", map);
        return json({ limited });
      }

      case "rooms:add": {
        const rooms = (await storage.get<Record<string, number>>("rooms")) ?? {};
        rooms[body.code] = Date.now();
        await storage.put("rooms", rooms);
        return json({ ok: true });
      }

      case "rooms:remove": {
        const rooms = (await storage.get<Record<string, number>>("rooms")) ?? {};
        delete rooms[body.code];
        await storage.put("rooms", rooms);
        return json({ ok: true });
      }

      case "rooms:list": {
        const rooms = (await storage.get<Record<string, number>>("rooms")) ?? {};
        return json({
          rooms: Object.entries(rooms).map(([code, createdAt]) => ({ code, createdAt })),
        });
      }

      default:
        return json({ error: "Unknown action." }, 404);
    }
  }
}
