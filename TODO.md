# Backlog — automated via `/loop`

Each item is one self-contained, verifiable unit of work. The loop implements
the next unchecked item, runs `npm run lint` (and `npm test` once tests exist),
commits it, and checks the box. It stops when every box is checked.

## Test coverage

- [x] **Set up Vitest.** Add `vitest` as a dev dependency, a minimal
  `vitest.config.ts`, and `npm test` / `npm run test:watch` scripts. Add one
  trivial smoke test under `tests/` to prove the runner works end to end.
- [x] **Unit test `src/worker/auth.ts`.** Cover `createToken` /
  `verifyToken` (valid token accepted, tampered signature rejected, expired
  token rejected) and `passwordMatches` (correct vs. incorrect password).
- [x] **Unit test the Durable Objects.** Write a minimal in-memory fake of
  `DurableObjectState.storage` (get/put/delete on a Map) and use it to test
  `RoomDO` (create → join → start → score → anti-cheat rejects a lower score
  or wrong player token → end) and `GlobalDO` (question bank get/set, rate
  limiter allows N then blocks, room registry add/remove/list).
- [x] **Integration test the Node server API.** Spawn `server.ts` (via `tsx`)
  as a child process on a test port, then black-box test with `fetch`: login
  (wrong password → 401, right password → token, 6th attempt in a minute →
  429), session create/join/start/score/end, and that instructor-only routes
  reject requests without a valid token (401).
