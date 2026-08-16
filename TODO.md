# Backlog — automated via `/loop`

Each item is one self-contained, verifiable unit of work. The loop implements
the next unchecked item, runs `npm run lint`, `npm run lint:worker`, and
`npm test`, commits it, and checks the box. It stops when every box is checked.

## Project AIDE — cybersecurity instructional quality

Ordered so each item unblocks the next. Content work is gated on item 1.

- [x] **Tag questions by concept (unblocks all content work).** `src/App.tsx`
  currently slices campaign questions positionally (`conceptIdx * 3`), assuming
  exactly 3 questions per concept in order — so adding any question silently
  corrupts every later concept. Add a `concept` field to the `Question`
  interface in `src/constants.ts`, tag all 15 questions using the existing
  section comments (art_of_defending, confidentiality, integrity, availability,
  authentication), and replace the positional slice with a filter on
  `concept === activeCampaignConcept`. Add tests asserting each concept returns
  only its own questions, and that adding a 4th question to one concept does
  not change what any other concept serves.

- [x] **Per-question item analysis for instructors.** The "Check on Learning"
  view a teacher actually needs — which questions the class missed — does not
  exist. Extend `GET /api/metrics` in both `server.ts` and
  `src/worker/index.ts` to return a `questionStats` array (question id, text,
  concept, attempted, correct, percentMissed) aggregated across all players,
  sorted most-missed first. Render a "Most missed questions" table in the admin
  metrics tab. Add tests for the aggregation.

- [x] **Accessibility pass.** Currently zero `prefers-reduced-motion` handling,
  one `aria-label`, and no `aria-live` regions. (1) Respect reduced motion —
  gate the decorative background animations and screen transitions behind
  framer-motion's `useReducedMotion()`. (2) Add an `aria-live="polite"` region
  announcing answer correct/incorrect and the resulting score. (3) Add
  `aria-label`s to icon-only buttons. (4) Ensure answer options are reachable
  and activatable by keyboard with a visible focus ring.

- [x] **Extended-time accommodation.** Time-per-question is a single global
  value, so there is no IEP/504 accommodation path. Add an "Untimed" option to
  the host's Time per Question control (alongside 10/20/30/45/60s) that
  disables the per-question countdown for that session, and make the gameplay
  timer and scoring handle the untimed case (award base points, no time bonus).

- [x] **CSV export of session results.** No export exists anywhere. Add a
  "Download CSV" button to the admin metrics tab that builds a CSV client-side
  (one row per student: name, score, questions attempted, correct, accuracy,
  time) and triggers a download via a Blob URL. No new server route needed.

- [ ] **Soften the campaign mastery gate.** `src/App.tsx` requires
  `accuracy === 100` to unlock the next concept, so one wrong answer out of
  three locks the learner out and forces a replay of the same items. Lower the
  unlock threshold to 80%, and on the results screen for a failed attempt,
  offer a "Retry missed questions" action that replays only the incorrect items.

- [ ] **Enable TypeScript `strict` mode.** `tsconfig.json` has no `strict`
  flag, so it defaults off. This was caught in practice: the admin editor
  constructed a `Question` missing the newly-required `concept` field and
  `tsc` did not flag it at the call site (it only errors on a direct
  annotated assignment). Turn on `strict` (or at minimum `strictNullChecks`),
  fix the resulting errors, and confirm `npm test` still passes. Expect a
  meaningful number of null-check errors given the app's `any`-typed state.

- [ ] **Standards alignment tags (NICE / Security+).** Add an optional
  `standards` field to `Question` (e.g. `{ nice?: string[]; securityPlus?: string[] }`),
  populate it for the existing bank, display the tags on the explanation screen,
  and add a coverage summary to the admin metrics tab so coverage can be
  reported to districts and funders.
