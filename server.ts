import express from "express";
import path from "path";
import crypto from "crypto";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Instructor password. Set APP_PASSWORD in the environment for production;
// the fallback is only a convenience for local development.
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
  const [exp, sig] = token.split(".");
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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // COOP must allow popups or Firebase signInWithPopup breaks.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));
  app.use(express.json({ limit: "500kb" }));

  // Instructor login: exchanges the shared password for a signed session token.
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

  // API Route for Gemini analysis (instructor only)
  app.post("/api/metrics/analyze", async (req, res) => {
    try {
      const authHeader = req.headers.authorization ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token || !verifyToken(token)) {
        return res.status(401).json({ error: "Instructor sign-in required." });
      }

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
                       description: { type: Type.STRING }
                    },
                    required: ["title", "description"]
                 }
               }
            },
            required: ["suggestions"]
          },
        },
      });

      const suggestionsStr = response.text;
      if (!suggestionsStr) {
         throw new Error("No response from AI");
      }

      const json = JSON.parse(suggestionsStr);
      res.json(json);
    } catch (e) {
      console.error("Gemini Error:", e);
      res.status(500).json({ error: "Failed to fetch AI suggestions." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
