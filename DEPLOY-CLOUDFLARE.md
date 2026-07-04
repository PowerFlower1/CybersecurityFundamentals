# Deploying to Cloudflare

This app deploys as a **single Cloudflare Worker with Static Assets**: one Worker
serves the React client, handles the `/api/*` routes, and hosts the Durable
Objects that hold live session state. No Firebase, no external database.

> Why a Worker and not Pages? Cloudflare **Pages cannot define Durable Objects**
> inside the project — they must live in a Worker. Cloudflare now recommends
> Workers with Static Assets over Pages for full-stack apps, so everything lives
> in one deployable unit here.

## Architecture

| Piece | Where it runs |
| --- | --- |
| React client | Static assets in `dist/`, served via the `ASSETS` binding |
| API (`/api/*`) | `src/worker/index.ts` — a Hono app on the Workers runtime |
| Live session state | One **`RoomDO`** Durable Object per room code |
| Question bank, login rate limit, room registry | A single **`GlobalDO`** Durable Object |

`wrangler.toml` declares `main` (the Worker entry), the `assets` directory, the
Durable Object bindings (`ROOMS`, `GLOBAL`), and the SQLite migration. The client
calls the API with same-origin relative paths, so nothing in the client needs
configuration. Requests that match a static asset are served directly; `/api/*`
(no matching asset) is handled by the Worker.

## Deploy via GitHub — Workers Builds (recommended)

This repo is on Windows **ARM64**, where Cloudflare's local runtime (`workerd` /
`wrangler`) won't install — so deploy from Cloudflare's cloud build instead.

1. Push this branch to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect to Git**,
   select the repo (`PowerFlower1/CybersecurityFundamentals`).
3. Set the **build command** to `npm run build:cf` (produces `dist/`). Cloudflare
   reads `wrangler.toml` for `main`, assets, DO bindings, and the migration, then
   runs `wrangler deploy` for you.
4. In the Worker's **Settings → Variables and Secrets**, add (as secrets):
   - `APP_PASSWORD` — the instructor password. **Required in production.**
   - `GEMINI_API_KEY` — optional; enables the AI "teaching insights" tab.
5. Deploy. The first deploy applies the `v1` Durable Object migration and gives
   you a `https://ready-force-labs.<subdomain>.workers.dev` URL.

## Deploy via CLI (x64 machine or CI only)

`wrangler` / `workerd` do not run on Windows ARM64. On Linux / macOS / Windows-x64:

```bash
npm install
npm run build:cf          # builds the client into dist/
npx wrangler deploy       # bundles the Worker + uploads assets + applies migration
npx wrangler secret put APP_PASSWORD
npx wrangler secret put GEMINI_API_KEY   # optional
```

## Local development

- **This machine (Windows ARM64):** use the Node server — `npm run dev` — which
  serves the identical API from `server.ts` with an in-memory store. The
  Cloudflare Worker can't run locally here because `workerd` has no ARM64-Windows
  build.
- **x64 machines:** run the real Worker locally with
  `npm run build:cf && npx wrangler dev`, and put secrets in a `.dev.vars` file
  (`APP_PASSWORD=...`).

## Notes

- **Durable Objects** use the SQLite backend (`new_sqlite_classes`), available on
  the Workers **Free** plan. Each room's state lives in its own object and
  survives restarts (unlike the Node server's in-memory store).
- Old rooms are not swept automatically; delete them from the admin dashboard, or
  add a scheduled cleanup (Cron Trigger) later if needed.
- The Worker calls the Gemini REST API directly (model `gemini-2.5-flash`).
