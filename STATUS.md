# LMNTLZ — Status

_Snapshot; updated each work session. Last updated: 2026-07-28._

## Current phase

**Planning complete. Phase 0/1 done for all sixteen features. Ready for
`speckit-tasks`, then code.**

Design and tech stack are both **complete and closed**; the constitution is
LMNTLZ-specific at **v3.0.0**; **16 specs** are written with zero unchecked
checklist items; and each of the sixteen now carries the full set —
`plan.md` · `research.md` · `contracts/` · `quickstart.md` — against one shared
`specs/data-model.md`.

**All 49 Phase 0 research questions are answered**, and the answers say honestly
which kind of answer they are:

| | |
|---|---|
| **Decided** from the docs, the vendor's, or the arithmetic | 41 |
| **Computed** — a sweep or a simulated population was actually run | 5 |
| **Specified but not run** — needs the live model or production data; the file names the measurement rather than inventing its result | 3 |

Build order remains settled: `packages/content` → `packages/sim` (rules, then
resolver) → `apps/api` → `apps/client`, headless and tested first.

## What the Phase 0 pass turned up

**The planning pass has now earned its keep several times over.** In order of how
expensive each would have been to find later:

- **The battle metadata row gained nothing and lost nothing** — `startedAt`/`endedAt`
  were already in the shared model, and feature 016 needs them for the drain. The
  risk is a migration dropping them as redundant next to `turnCount`, which measures
  *engine* length where the drain needs *wall-clock*. Flagged in three files.
- **`07-defense-ai.md`'s *"every safe ordering ends `1·0`"* is wrong by one**, and
  its own published Tank default is the exception. The plan had turned that claim
  into a **tripwire** — *"if a re-derivation produces one that does not, the ladder
  changed"* — so following it literally would have sent someone to re-tune a correct
  ladder. The real rule is *tier 0 last*, and it is provable rather than measured.
- **The "12 safe orderings" is a 60-turn statement, and a hero takes ~8.5 turns.**
  At real battle length **no** ordering keeps all six powers live. The four published
  role defaults survive anyway — the only casualty is the tier-0 auto-attack, which is
  the fallback — but the squad builder must show a **9-turn** profile, not a 60-turn
  one, or the number on screen describes a game nobody plays.
- **Ably's cost driver is message fan-out, not presence.** `docs/tech-stack.md` names
  presence as the lever if pricing came in high; presence is **$9/month at 10k DAU**
  against **~$270** for Global fan-out — and fan-out is **quadratic in players**.
  A capped Global room size makes it linear. Raised, not taken: it is player-facing.
- **The Hidden 2× rating bonus makes rating non-zero-sum**, injecting ~2,700 points a
  year into an active account. Both stated jobs of the rating are ordinal and survive
  it; what breaks is *"everyone starts at 1000"* meaning "starts at average".
  Recommendation raised, not taken — the fixed 1000 is recorded canon.
- **Vercel Blob has no lifecycle expiry** (verified against current docs), so the
  cleanup cron ships. `del()` is free and **`list()` is billed** — which independently
  confirms the Postgres-driven design chosen on correctness grounds.
- **Feature 006's plan found the firing profile in `sim/ai`**, which is server-only,
  when the squad builder needs it client-side. It moved to `sim/rules`. Found during
  implementation instead, the natural fix is an endpoint — a round trip on every drag
  of a ranking widget.

## Done

- **Design closed.** `resources/mechanics/` `01`–`09` + `11`. `10-equipment.md` is
  a deliberate fast-follower; guild event design is parked.
- **All 27 heroes authored** with derived bane/fault (`resources/characters/`),
  validated by `tools/validate-matchups.ps1`.
- **Combat fully specified** — five-phase turn, bounded-accumulator turn order,
  reach on a shared 1–6 axis, the damage pipeline, a 300-hero-turn cap resolved on
  pooled HP share.
- **Tech stack complete (2026-07-28).** TypeScript · pnpm + Turborepo · Vite +
  React + Tailwind · Hono on Vercel · Neon + Drizzle · Paddle · Vercel Blob ·
  Ably · Resend · Sentry · Claude Haiku 4.5 · Vitest + Playwright. **No analytics
  vendor** — game telemetry is SQL against the battle metadata row.
- **Monetization settled** — passes, not subscriptions; nothing auto-renews;
  advantage capped at **$160/year**; shard balance capped at 6,500.
- **Architecture diagram** generated and reviewed; three discrepancies logged in
  `resources/README.md`, screens left unedited per the standing rule.
- **Repo layout decided** — one repository for design *and* code. Client and
  server were never separable.
- **Constitution v3.0.0** — Part I process (I–XI) unchanged; **Part II product
  constraints (XII–XX)** added and wired into `plan-template.md`'s gate.
- **Feature set scoped** — 16 features in 6 dependency layers (`specs/README.md`).
- **All 16 specified**: content · sim-rules · sim-resolver · defense-ai · auth ·
  roster-and-squads · battle · replays · matchmaking · progression · payments ·
  profiles · guilds · chat · moderation · ops-admin.
- **The shared data model settled once** (`specs/data-model.md`) — six models cross
  feature boundaries, and the battle record is written by two and read by four.
- **All 16 planned**, each gated on the nine Part II constraints. No violations.
- **Phase 0/1 complete for all 16** — `research.md`, `contracts/` and `quickstart.md`
  each. All 49 research questions answered.
- **Two read-only analysis scripts committed** so every computed figure is
  reproducible: `tools/characterize-orderings.py` and `tools/verify-accuracy.py`.

## Next — `speckit-tasks`, then code

**Four tests to write before the code they cover**, each named in its quickstart:

- `purity.test.ts` (002) — no entropy source reachable in `sim/rules`, **and** no
  transitive import of `resolver/` or `ai/` from the client
- `determinism.test.ts` (003) — 1,000 replays, **byte-identical**, not deep-equal
- the alternating-battles leak test (012) — proves *selected*, not *filtered*
- `ordering.test.ts` (014) — the blocklist gates, the classifier does not; drawn
  backwards by two generated diagrams

**Three questions are specified but not yet run**, and each names its measurement:

| Question | Needs | Where |
|---|---|---|
| Classifier quality at 100 items per call | the live model + a 300-message hand-labelled set | `015/research.md` |
| Whether Hidden actually holds better than Visible | production battles — the whole zone commitment rests on it | `010/research.md` |
| Requests per battle (predicted 20–40) | the first real battles; `turnCount` vs action-log length answers it with no new field | `007/research.md` |

**Two proposals raised, not taken** — both are canon changes, both are cheap now and
expensive later:

- **Cap Global chat room size** (feature 014). Fan-out cost is quadratic in players.
- **Start new accounts at the population median** rather than a fixed 1000 (feature
  010), because the Hidden bonus inflates the population.

**One open authoring question with a balance consequence**: do bots carry Hidden
squads? The ambush counter is the recorded answer to opponent farming and it only
bites if a bot's Hidden squad is harder than its Visible one. 20 starter bots with
Hidden squads is twice the content of 20 without. (`009/research.md`)

**A working Python 3.13 interpreter is at `py`** — the bare `python` on PATH is a
Store stub.

## Carried risks and deferred work

- **The hero-numbers pass has not run.** Every formula is specified; the values
  are still a Role-shaped template. Blocks no spec; blocks all balance. Under the
  **no-nerf rule** this is the last moment numbers move freely.
- **Zone balance is an untested commitment.** Neither Visible nor Hidden may
  dominate, and it rests on Hidden holding better. **If the hold rates converge,
  Visible wins both currencies and the choice collapses.** Only feature `008`'s
  recorded metadata can detect it.
- **The battle metadata row cannot be backfilled** (Constitution XVI). Turn count,
  squad composition both sides, a bot flag and league-at-battle-time must ship
  with the first battle ever recorded.
- ~~**Two figures to verify before launch**~~ — **both verified 2026-07-28.**
  **Vercel Blob has no lifecycle expiry**, so the cleanup cron ships; `del()` is free
  and `list()` is billed, which confirms the Postgres-driven design twice over.
  **Ably** is 200 peak connections free, $29/mo for 10,000, then $2.50/M messages and
  $1.00/M connection-minutes. **The open figure that replaced them is Global chat
  fan-out**, which is quadratic in players and unbounded without a room cap.
- **Steam auth has never been prototyped.** A spike to schedule, not a risk to
  retire — 1.0 must get the *seam* right, not the integration.
- **Reactive powers are specified but unpopulated**, leaving two unique passives
  dead. Authoring belongs with the hero-numbers pass.
- **Guild events, Wings and guild funds are deferred** with their design. Guilds
  keep roster, roles and permissions.

## Blockers

- None.
