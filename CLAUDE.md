# CLAUDE.md

Always-on operating context for LMNTLZ. The shared, tool-neutral rules live in
`@AGENTS.md` — read them; they govern how to work here.

@AGENTS.md

## What LMNTLZ is

A competitive fantasy squad battler. Nine damage types (6 magic: Earth, Air,
Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each
for a 27-hero roster. **All 27 are unlocked from the start and identical for
every player** — nothing to collect, so no one can out-roster anyone. Each
player defends **two engine-run zones** — one *surfaced* to attackers at
matchmaking, one *blind*, with the blind attack worth more rating, and a rising
win streak carrying an openly-shown chance of being lured from the seen zone
into the blind one — totalling 12 heroes, which then *cannot* attack,
and keeps up to **3 attack squads** drawn from the remaining 15; those squads
may overlap, and must, since 3 × 6 exceeds 15. Moving a hero to defense evicts
it from any attack squad and invalidates it. Squads are 6 heroes in a fixed
**2 front · 3 middle · 1 back** formation;
**the player commands offense while the engine runs everyone's defense.** PvP is
asynchronous — you attack snapshots of other players' defense squads, so there
is no realtime netcode. The game is counter-building: read the enemy's
weaknesses, don't stack your own.

`resources/` holds the design-prompt library (`00`–`05`, one Claude Design
prompt per screen) and `LORE-and-flavor.md` (world, the Nine Forces, House
voices, and the Design Canon block).

## Settled design decisions

These are project truth. Don't re-derive or contradict them:

- **Combat is discrete turn-based.** Each power recharges over N *turns*.
  Cooldowns are integer turn counts, never milliseconds; a cooldown ring is a
  fill fraction over turns remaining, not a clock.
- **Reach gates all targeting.** Every hero has a reach of 1 or 2, measured in
  rows on one shared 1–6 axis (attacker 1–3, defender 4–6). A hero's *own* rows
  count against its reach, and fully empty rows are skipped, so range opens up
  as a battle wears on. One rule for enemies and allies alike — a heal is
  range-limited exactly as an attack is. Details in
  `resources/mechanics/02-squads.md`.
- **A hero's whole relationship profile derives from two authored fields**,
  `primary` and `secondary`:
  ```
  strengths = { primary, secondary }
  bane      = counter(primary)     // major weakness, super-effective
  fault     = counter(secondary)   // minor weakness
  ```
  `counter` is a bijection over all 9 types and never crosses the magic/melee
  families: Earth↔Air, Fire↔Water, Light↔Dark, Crush→Slash→Pierce→Crush.
- All four slots must stay distinct, so: `secondary ≠ primary`,
  `counter(primary) ≠ secondary`, `counter(secondary) ≠ primary`. A consequence:
  **melee+melee pairings are impossible** (the 3-cycle is too small — every
  option collides), so melee heroes always take a magic secondary.
- Never hand-author a hero's weaknesses, and never hand-author the 9×9 matrix —
  both are generated. Validate the three rules in the content schema.

> **`resources/LORE-and-flavor.md` is stale on this point.** Line 71 still
> describes the Fault as "drawn from a neighboring Force on the ring or
> triangle — left to design tuning," and the Design Canon block still presents
> the profile as four independent slots. The derivation rule above wins. Rewrite
> the codex when the roster settles.

## Tech stack — settled

Full decision record with reasoning in `docs/tech-stack.md`. Read it before
proposing anything structural; the *why* is recorded there precisely so it isn't
re-litigated.

- **Desktop only.** Electron on Steam + standalone, plus the same static build
  in a desktop browser. Mouse and keyboard, min window 1280×720, target
  1600×900. No mobile, no touch, no gamepad.
- TypeScript throughout · pnpm + Turborepo · Vite + React + Tailwind client ·
  Electron + `steamworks.js` · Hono on Vercel (versioned JSON REST) ·
  Neon Postgres + Drizzle · Vercel Edge Config for the maintenance flag ·
  auth owned in-house (Google ID tokens + Steam session tickets → own JWTs).
- **Gameplay is server-authoritative.** The client sends an intent; the server
  resolves it. The RNG seed never leaves the server. `packages/sim` splits into
  *rules* (pure, shared, no RNG) and *resolver* (RNG, server only).
- **In-progress battle state is never stored** — it is re-derived from the
  append-only action log each request. One source of truth, no cache, no TTL.
- **Replays are stored JSON event logs, never re-simulated**, so a balance patch
  can never change a past battle's outcome.

> **`stacks/nextjs.md` does not apply to this repo.** It ships with the
> `ai-tools` toolkit; Next.js was considered and explicitly rejected — Steam
> requires a static bundle, so its server half is unusable. Don't follow it.

## Deliberately undecided

- Powers, damage multipliers beyond the Bane's +50%, turn order, the defense AI,
  and progression. See `resources/mechanics/README.md` for the index and what
  blocks what.

## Toolkit available in this repo

This repo carries the `ai-tools` toolkit (`.claude/` + `.specify/`).
`MANIFEST.md` is the full routable catalog; the highlights:

- **`codebase-scout` subagent** — read-only reconnaissance, delegable to the
  background. **`verifier`** drives a change end-to-end and reports pass/fail.
  **`diff-reviewer`** reads back the current diff before you commit. None edit,
  commit, or install.
- **Slash commands** (`.claude/commands/`): `/orient`, `/mini-spec`, `/verify`,
  `/commit`, `/pr`.
- **Spec-Kit** (`.specify/` + `speckit-*` skills):
  `speckit-specify → speckit-plan → speckit-tasks → speckit-implement`.
  Per rule 7, spec and plan the *whole* initial feature set before implementing
  any of it — the six screens in `resources/` share models heavily.
- **Stack packs** (`stacks/`): read the relevant pack before writing framework
  code — once a stack is actually chosen.

`.specify/memory/constitution.md` is still the generic engineering constitution;
run `speckit-constitution` to make it LMNTLZ-specific.
