# Backlog — automated via `/loop`

Each item is one self-contained, verifiable unit of work. The loop implements
the next unchecked item, runs `npm run lint`, commits it, and checks the box.
It stops when every box is checked.

- [x] **Trust proxy for accurate client IPs.** In `server.ts`, call
  `app.set("trust proxy", 1)` right after `const app = express()` so `req.ip`
  and the login rate limiter use the real client IP behind Cloud Run / a load
  balancer (one proxy hop) instead of the proxy's address.
- [x] **Remove vestigial Firebase.** The app no longer uses Firebase. Delete
  `firestore.rules`, `firebase.json`, and `.firebaserc`, and remove the
  `firebase` dependency from `package.json`. Confirm `npm run lint` still passes.
- [x] **Rewrite README.** Replace the AI Studio boilerplate in `README.md` with
  real docs: what the app is, `npm install` / `npm run dev`, the `APP_PASSWORD`
  and `GEMINI_API_KEY` environment variables, and the host-a-session /
  join-with-code flow.
