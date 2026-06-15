// Client for the app server's session API. Replaces direct Firestore access,
// so the host/join/play loop runs without any Firebase security rules.

const INSTRUCTOR_TOKEN_KEY = "rfc_instructor_token";

export const getInstructorToken = () => sessionStorage.getItem(INSTRUCTOR_TOKEN_KEY);
export const setInstructorToken = (t: string) => sessionStorage.setItem(INSTRUCTOR_TOKEN_KEY, t);
export const clearInstructorToken = () => sessionStorage.removeItem(INSTRUCTOR_TOKEN_KEY);

export interface RoomPlayer {
  id: string;
  name: string;
  score: number;
}
export interface RoomState {
  code: string;
  status: "waiting" | "started" | "finished";
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  endTime: number;
  hostName: string;
  players: RoomPlayer[];
}

async function req(path: string, options: RequestInit = {}, auth = false) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getInstructorToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  login: (password: string): Promise<{ token: string }> =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),

  getQuestions: (): Promise<{ questions: any[] }> => req("/api/questions"),

  saveQuestions: (questions: any[]): Promise<{ questions: any[] }> =>
    req("/api/questions", { method: "PUT", body: JSON.stringify({ questions }) }, true),

  createSession: (settings: {
    difficulty: string;
    questionCount: number;
    timePerQuestion: number;
    hostName?: string;
  }): Promise<{ code: string }> =>
    req("/api/session", { method: "POST", body: JSON.stringify(settings) }, true),

  listSessions: (): Promise<{ sessions: any[] }> => req("/api/sessions", {}, true),

  getRoom: (code: string): Promise<RoomState> => req(`/api/session/${code}`),

  joinSession: (
    code: string,
    name: string,
  ): Promise<{ playerId: string; playerToken: string; room: RoomState }> =>
    req(`/api/session/${code}/join`, { method: "POST", body: JSON.stringify({ name }) }),

  startSession: (code: string, durationMinutes: number): Promise<{ endTime: number }> =>
    req(`/api/session/${code}/start`, { method: "POST", body: JSON.stringify({ durationMinutes }) }, true),

  endSession: (code: string): Promise<{ ok: true }> =>
    req(`/api/session/${code}/end`, { method: "POST", body: "{}" }, true),

  deleteSession: (code: string): Promise<{ ok: true }> =>
    req(`/api/session/${code}`, { method: "DELETE" }, true),

  submitScore: (
    code: string,
    playerId: string,
    playerToken: string,
    score: number,
    history: any[],
  ): Promise<{ ok: true }> =>
    req(`/api/session/${code}/score`, {
      method: "POST",
      body: JSON.stringify({ playerId, playerToken, score, history }),
    }),

  getMetrics: (): Promise<any> => req("/api/metrics", {}, true),

  analyzeMetrics: (metrics: any): Promise<{ suggestions: { title: string; description: string }[] }> =>
    req("/api/metrics/analyze", { method: "POST", body: JSON.stringify({ metrics }) }, true),
};
