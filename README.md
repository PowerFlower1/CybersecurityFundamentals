<div align="center">
  <img src="public/rfc-logo.svg" width="120" height="120" alt="Ready Force Cyber logo" />
  <h1>Ready Force Labs</h1>
  <p><strong>Learn cybersecurity by playing.</strong> A game-style learning module for the five core cybersecurity concepts, built for classrooms.</p>
</div>

---

## What it is

Ready Force Labs is a React + Express app where students learn cybersecurity
fundamentals through short, timed, multiple-choice missions. There are two ways
to play:

- **Solo practice** — anyone can work through the five concepts (Art of
  Defending, Confidentiality, Integrity, Availability, Authentication) at their
  own pace on a personal skill map. No account needed.
- **Live class sessions** — an instructor hosts a session, students join with a
  6-character code from the home page, and everyone plays together while the
  instructor monitors a live leaderboard (Kahoot/Blooket style).

Live session state lives entirely on the Express server (in memory) — there is
**no Firebase or external database**, and nothing to configure to get hosting
working.

## Tech stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, Recharts
- **Backend:** Express (TypeScript, run via `tsx`)
- **AI:** Google Gemini (optional — powers instructor metric insights)

## Prerequisites

- Node.js 18+

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Create a `.env` file — see [Environment variables](#environment-variables).
   The app runs without it using sensible defaults.
3. Start the app (Express + Vite on one port):
   ```bash
   npm run dev
   ```
4. Open <http://localhost:3000> (or set `PORT`, e.g. `PORT=3001 npm run dev`).

## Environment variables

Copy [.env.example](.env.example) to `.env` and fill in as needed. All are optional for local development.

| Variable | Purpose | Default |
| --- | --- | --- |
| `APP_PASSWORD` | The instructor password used to host sessions. **Always set this in production.** | `readyforce` |
| `GEMINI_API_KEY` | Enables the AI "teaching insights" on the instructor metrics tab. Without it, the rest of the app works normally. | _none_ |
| `PORT` | Port the server listens on. | `3000` |

## How it works

### Students
1. Open the app and either **Practice Solo** or **Join a Class Session**.
2. To join a live session, enter your name and the 6-character code from your
   instructor, then wait in the lobby until they start.
3. Answer questions before the timer runs out — faster correct answers score more.

### Instructors
1. On the home page, enter the instructor password under **Teaching a class?**.
2. From the lobby, choose difficulty / question count / time-per-question, then
   **Host New Session**.
3. Share the generated code. Watch students join, optionally adjust the session
   time limit and time-per-question, then **Begin Session**.
4. Monitor the live leaderboard; **End Session** stops it for everyone. The
   metrics tab aggregates results and (with a Gemini key) suggests improvements.

Authentication is a single shared instructor password exchanged for a signed,
expiring session token — no per-user accounts.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Express API + Vite client) |
| `npm run build` | Build the client and bundle the server to `dist/` |
| `npm start` | Run the production build from `dist/` |
| `npm run lint` | Type-check with `tsc --noEmit` |

## Deployment

**Node host** (Render / Fly / Railway / any Node server): `npm run build`
produces a static client in `dist/` and a bundled server at `dist/server.cjs`;
`npm start` serves both. Set `APP_PASSWORD` (and optionally `GEMINI_API_KEY`) in
the host environment.

**Cloudflare (Worker + Static Assets)**: see
[DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md). One Worker serves the client,
the `/api`, and the Durable Objects that hold live session state; build the
client with `npm run build:cf`, then `wrangler deploy`.

> **Note:** live session state is held in memory in a single server process, so
> it resets on restart and is not shared across multiple instances. This is fine
> for a classroom running on one server; to scale horizontally, back the session
> store with a shared store (e.g. Redis).
