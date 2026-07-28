# LMNTLZ — Status

_Snapshot; updated each work session. Last updated: 2026-07-28._

## Current phase

**Planned — all 16 features specified and planned. Ready to implement.** Design
and tech stack are both **complete and closed**; the constitution is
LMNTLZ-specific at **v3.0.0**; and the Spec-Kit pass is finished: **16 specs, 16
plans, 16 quality checklists, zero unchecked items, zero clarifications
outstanding.** Every plan carries the nine Part II gates as explicit verdicts, and
**no plan recorded a violation** — every Complexity Tracking table is empty.

**Constitution VII's gate is now satisfied**, so implementation may begin. Build
order is settled: `packages/content` → `packages/sim` (rules, then resolver) →
`apps/api` → `apps/client`, headless and tested first.

> **The planning pass earned its keep once, concretely.** Feature 006's plan found
> that the **firing profile** — which the squad builder must display — was placed
> in `sim/ai`, which is server-only. It is a pure function of `(hero, ranking)`, so
> it moved to `sim/rules`. Discovered during implementation instead, the natural
> fix would have been an endpoint: a round trip on every drag of a ranking widget,
> to compute something the client can derive locally.

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

## Next — implementation

- **`speckit-tasks`** across the set, then build in dependency order.
- **Start with `packages/content`**, then `packages/sim/rules`, then
  `sim/resolver`. Headless, with tests, before anything renders.
- **Three tests to write before the code they cover**, each named in its plan:
  - `purity.test.ts` (002) — no entropy source reachable in `sim/rules`
  - `determinism.test.ts` (003) — 1,000 replays, byte-identical
  - the alternating-battles leak test (012) — proves *selected*, not *filtered*

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
- **Two figures to verify before launch:** Ably pricing above 200 peak concurrent
  connections, and whether Vercel Blob offers lifecycle expiry (if not, a cleanup
  cron ships — driven from Postgres, never from listing the bucket).
- **Steam auth has never been prototyped.** A spike to schedule, not a risk to
  retire — 1.0 must get the *seam* right, not the integration.
- **Reactive powers are specified but unpopulated**, leaving two unique passives
  dead. Authoring belongs with the hero-numbers pass.
- **Guild events, Wings and guild funds are deferred** with their design. Guilds
  keep roster, roles and permissions.

## Blockers

- None.
