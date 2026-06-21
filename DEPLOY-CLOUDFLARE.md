# Deploying to Cloudflare Pages

This app runs on Cloudflare Pages as a **static client + a Worker (Pages
Advanced mode) + Durable Objects** for live session state. No Firebase, no
external database.

## Architecture

| Piece | Where it runs |
| --- | --- |
| React client | Static assets in `dist/`, served by Pages |
| API (`/api/*`) | `dist/_worker.js` — a Hono app on the Workers runtime |
| Live session state | One **`RoomDO`** Durable Object per room code |
| Question bank, login rate limit, room registry | A single **`GlobalDO`** Durable Object |

`wrangler.toml` declares the Durable Object bindings (`ROOMS`, `GLOBAL`) and the
SQLite migration. The client calls the API with same-origin relative paths, so
nothing in the client needs configuration.

## Build settings

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cf` |
| Build output directory | `dist` |

`npm run build:cf` runs `vite build` (client → `dist/`) then bundles the Worker
to `dist/_worker.js`.

## Deploy via GitHub (recommended)

This repo is on Windows **ARM64**, where Cloudflare's local runtime (`workerd`)
won't install — so deploy from Cloudflare's cloud build instead of local CLI.

1. Push this branch to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
   select the repo.
3. Set **Build command** = `npm run build:cf` and **Output directory** = `dist`.
   Cloudflare reads `wrangler.toml` for the Durable Object bindings + migration.
4. **Settings → Variables and Secrets**, add (encrypt as secrets):
   - `APP_PASSWORD` — the instructor password. **Required in production.**
   - `GEMINI_API_KEY` — optional; enables the AI "teaching insights" tab.
5. Deploy. The first deploy applies the `v1` Durable Object migration.

## Deploy via CLI (x64 machine or CI only)

`wrangler` / `workerd` do not run on Windows ARM64. On Linux/macOS/Windows-x64:

```bash
npm run build:cf
npx wrangler pages deploy dist
```

Set secrets with `npx wrangler pages secret put APP_PASSWORD` (and
`GEMINI_API_KEY`).

## Local development

- **This machine (Windows ARM64):** use the Node server — `npm run dev` — which
  serves the identical API from `server.ts` with an in-memory store. The
  Cloudflare Worker can't run locally here because `workerd` has no ARM64-Windows
  build.
- **x64 machines:** you can run the real Worker locally with
  `npm run build:cf && npx wrangler pages dev dist`, and put secrets in a
  `.dev.vars` file (`APP_PASSWORD=...`).

## Notes

- **Durable Objects** use the SQLite storage backend (`new_sqlite_classes`),
  which is available on the Workers Free plan. Each room's state lives in its own
  object and survives restarts (unlike the Node server's in-memory store).
- Old rooms are not swept automatically on Cloudflare; delete them from the admin
  dashboard, or add a scheduled cleanup later if needed.
- The Worker calls the Gemini REST API directly (model `gemini-2.5-flash`) rather
  than the Node SDK.
