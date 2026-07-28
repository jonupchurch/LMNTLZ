# LMNTLZ — Status

_Snapshot; updated each work session. Last updated: 2026-07-28._

## Current phase

**Specifying (6 of 16 features done; 0 planned; no code yet).** Design and tech
stack are both **complete and closed** — `resources/mechanics/` holds `01`–`09`
and `11` with no design blocker outstanding, and `docs/tech-stack.md` has **no TBD
rows**. The constitution is LMNTLZ-specific at **v3.0.0**, carrying nine product
constraints (XII–XX) that every plan is gated against. Spec-Kit is mid-pass:
`001`–`006` are written and pass their quality checklists.

**Constitution VII forbids implementing anything until all sixteen features are
specified *and* planned**, so the remaining work before a first line of code is
**10 specs, then 16 plans**. That is deliberate — six models cross feature
boundaries, and the battle record is written by four features and read by four
more.

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
- **Specs written and passing:** `001` content · `002` sim-rules ·
  `003` sim-resolver · `004` defense-ai · `005` auth · `006` roster-and-squads.

## Next — the spec pass (dependency order)

- **Layer 3:** `007` battle · `008` replays · `009` matchmaking
- **Layer 4:** `010` progression · `011` payments
- **Layer 5:** `012` profiles · `013` guilds · `014` chat · `015` moderation
- **Layer 6:** `016` ops-admin
- **Then `speckit-plan` across all sixteen**, gated on Part II.
- **Then implementation**, in the settled build order: `packages/content` +
  `packages/sim` first, headless, with tests.

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
