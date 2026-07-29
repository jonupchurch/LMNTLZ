# CLAUDE.md

Always-on operating context for LMNTLZ. The shared, tool-neutral rules live in
`@AGENTS.md` — read them; they govern how to work here.

@AGENTS.md

## What LMNTLZ is

A competitive fantasy squad battler. Nine damage types (6 magic: Earth, Air,
Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each
for a 27-hero roster. **All 27 are unlocked from the start and identical for
every player** — nothing to collect, so no one can out-roster anyone. Each
player defends **two engine-run zones** with fixed roles — a *Visible* squad,
scoutable and the only one anyone can choose to attack, and a *Hidden* squad
that is never shown and never selectable. The sole way into a Hidden battle is
to be **ambushed**: +2% per consecutive attack win, capped at 90%, always
displayed, and Hidden battles pay more. Every defense squad also tracks its own
public **hold streak**, reset when the squad is edited. Defense totals 12
heroes, which then *cannot* attack,
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

## Where the rules actually live

**Conversation beats design output, always.** The generated screens in
`resources/designsystem/` exist for **look and feel** — layout, colour, hierarchy,
voice. They are not a source of rules. When a screen and a decision made in
discussion disagree, **the discussion wins and the screen is wrong**, no matter
how confident or complete the screen looks.

In practice:

- The rules live in `CLAUDE.md`, `resources/mechanics/`, and
  `resources/LORE-and-flavor.md`. A `.dc.html` export is never authoritative.
- A screen may still *surface* something useful — the Codex derives Banes and
  Faults correctly, the Guild Admin models the event lock well. Treat those as
  **proposals to confirm**, not decisions already made. Say "the screen suggests
  X — adopt it?" rather than writing X into the rules and moving on.
- Contradictions in **copy and flavor text** are worth *noting* so nobody builds
  from them, but they are not defects to fix. Data and logic errors — a wrong
  cap, an uncapped percentage, a broken derivation — are worth flagging properly.
- Never rewrite a generated screen to match the rules unless asked. Record the
  discrepancy in `resources/README.md` and let it be regenerated.

## Settled design decisions

These are project truth. Don't re-derive or contradict them:

- **Combat is discrete turn-based.** Each power recharges over N *turns*.
  Cooldowns are integer turn counts, never milliseconds; a cooldown ring is a
  fill fraction over turns remaining, not a clock.
- **Balance upward; a nerf is a last resort.** To correct an outlier, raise the
  other twenty-six rather than lower the one — runes are permanent and destroyed
  on replacement, so a nerf writes off a player's spend, and stored replays mean
  a patch cannot reach backwards anyway. Better still are the *additive* levers:
  **curated bot defenders** and new content move the meta without touching a
  number. **Levelling up has a measured budget of +10** on `Might` and `Speed`
  before a +20 rune boost overflows the 75 cap. When a nerf is genuinely the
  answer, **grant shards to everybody** — one full rune costs 1.7 days of typical
  income. Fixing a bug is not a nerf. Reasoning in
  `resources/mechanics/README.md`.
- **Reach gates all targeting.** Every hero has a reach of 1 or 2, measured in
  rows on one shared 1–6 axis (attacker 1–3, defender 4–6). A hero's *own* rows
  count against its reach, and fully empty rows are skipped, so range opens up
  as a battle wears on. One rule for enemies and allies alike — a heal is
  range-limited exactly as an attack is. Details in
  `resources/mechanics/02-squads.md`.
- **Guilds hold up to 24 players, split into three *Wings* of 8.** A **Wing is a
  grouping of 8 players**, not heroes — it exists only inside a guild and only
  for events, and never appears in a battle. **Wings compete, they never fight** —
  an event tallies a metric from members' ordinary play (e.g. attack victories),
  counted per Wing and then rolled up per guild. Every Wing is ranked
  independently on one global board; the top Wings are paid directly and their
  guild takes a lesser reward on top. Every member sits in Wing I, II, III or
  **Grounded** — an uncapped bench, freely assignable in both directions while
  unlocked. **Assignments lock when an event starts**; the only change permitted
  mid-event is removing a member from the guild, the vacated seat cannot be
  refilled, and anyone joining mid-event is Grounded automatically. That
  forecloses per-member *average* scoring, which would make cutting a laggard
  profitable.
  **A squad is always 6 heroes** — do not conflate the two. Details in
  `resources/mechanics/08-guilds.md`.
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

`resources/LORE-and-flavor.md` now carries the same rule — *The doors are not
chosen* derives both weaknesses, and the Design Canon block states the two
authored fields explicitly. **The two agree; no reconciliation is outstanding.**

## Tech stack — settled

Full decision record with reasoning in `docs/tech-stack.md`. Read it before
proposing anything structural; the *why* is recorded there precisely so it isn't
re-litigated.

- **Desktop only.** Electron on Steam + standalone, plus the same static build
  in a desktop browser. Mouse and keyboard, min window 1280×720, target
  1600×900. No mobile, no touch, no gamepad.
- **Two channels only — browser at 1.0, Steam as a fast-follow.** **No standalone
  installer**: it is the sole artifact needing a code-signing certificate
  (~$120–600/yr) and the one with the smallest audience, while Steam needs none.
  So **there is no Electron at 1.0 at all** — a static Vite bundle plus the Hono
  API. The Steam launch window is a one-shot marketing asset, spent on a finished
  game. **Build every Steam seam anyway:** provider-agnostic identity,
  **account-level entitlements** (a purchase belongs to the account, never to the
  storefront), payment behind a rail interface, and `steamworks.js` isolated so
  the browser build never imports it.
- **The client stays TypeScript.** MAUI and friends were rejected — no web target,
  no signing relief, and they would **duplicate `packages/sim`'s rules in a second
  language**, which is the one thing the architecture cannot afford.
- TypeScript throughout · pnpm + Turborepo · Vite + React + Tailwind client ·
  Electron + `steamworks.js` · Hono on Vercel (versioned JSON REST) ·
  Neon Postgres + Drizzle · Vercel Edge Config for the maintenance flag ·
  auth owned in-house (Google ID tokens + Steam session tickets → own JWTs) ·
  Paddle · Vercel Blob · Ably · Resend · Sentry · Vitest + Playwright.
- **The stack is complete as of 2026-07-28 — no TBD rows.** Two decisions there
  carry beyond the vendor choice. **The realtime broker only fans out: clients
  subscribe and never publish**, because some chat postings cost shards and a
  client that could publish directly would bypass the charge. And **no vendor
  measures the game** — every question the design promises to answer is a battle
  question, so the **battle metadata row is the analytics product**. It must carry
  turn count, squad composition, a bot flag and league-at-battle-time from the
  first battle ever recorded; like `engineVersion`, it cannot be backfilled.
  *Storing composition is not exposing it* — the CSV and embed rules govern what
  leaves the system. **Vercel Web Analytics is live on both projects and does not
  contradict this**: it counts anonymous page views to answer the one question SQL
  cannot see — the visitor who never signed up — and it never touches gameplay.
  Page views only, no custom events, no cookies.
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

## Combat is specified; don't re-derive it

`resources/mechanics/01`, `03`, `04` and `05` together resolve a battle end to
end. The formulas below are decided — read them there rather than reasoning them
out again:

```
packet  = Might × power.multiplier          # Luck is NOT in this
HP      = Toughness × 50
attack  = Perception + 20 + rand(1 .. Luck × 1.5) # +20 is the attacker's edge
defense = Agility    +      rand(1 .. Luck × 1.5) # ties to the defender
P(hit)  clamped to 65% .. 95%                    # one draw, not two
crit    = Luck × 0.5 percent, for packet × 2
E       = (Armor or Magic Resist) − Penetration ; K = 75
final   = max(packet × 0.25, mitigated × typeMultiplier)
```

- **Accuracy has a base edge and a clamp, and both are load-bearing.** The
  symmetric contest was a coin flip — median miss **45.2%** across all 729 pairs.
  `+20` takes that to 9.4% and shortens battles from ~155 to ~102 hero-turns.
  The clamp is what survives runes: `Agility` + `Luck` maxed on a defender is a
  **98.2% miss rate** unclamped, a literal invincibility build. **Reducing
  `Luck`'s die multiplier is the wrong lever** — it compresses rather than shifts,
  and at `× 0.5` it creates 158 pairs that can never hit each other at all.

- **Turn order is a bounded accumulator.** Every hero gains `50 + Speed` per
  tick and acts at 100, so Speed 45 acts 1.46× as often as Speed 15 and the
  geared ceiling is 1.92×. Drain the accumulator in a loop, never test it once.
  A **tick is internal** — the player sees a projected turn queue.
- **Type effectiveness** is ×1.50 Bane · ×1.25 Fault · ×1.00 · ×0.80 secondary ·
  ×0.50 primary. A **dual-typed power takes the better of its two types**, and a
  mixed martial/arcane one answers the defender's *lower* mitigation stat. The
  consequence is deliberate: **no tier-4 or tier-5 power is ever resisted.**
- **`Magic Resist` is worth ~2× `Armor` and is deliberately left unpriced.**
- **Stat buffs are flat points, including `Speed`** — the accumulator's base
  constant already normalizes them, so a percentage would favour the fastest.

## Deliberately undecided

- **`06-progression.md` is the one real blocker.** Guild rewards and equipment
  costs both wait on it, and it has to answer something the design made hard on
  purpose: all 27 heroes are unlocked from the start, so progression cannot be
  roster power.
- **`07-defense-ai.md`** — unblocked now that the action space is complete. The
  engine plays *every* defense squad, so this is the defensive half of the game.
- **The hero-numbers pass** — every formula is specified; the values are still a
  Role-shaped template. See `resources/mechanics/README.md` for the index, the
  dependency read, and what each remaining document is waiting on.

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

`.specify/memory/constitution.md` is **LMNTLZ-specific as of v3.0.0** and binding.
Part I is the eleven process principles; **Part II is nine product constraints
(XII–XX)** a change is checked against — server authority and the seed boundary ·
one rules engine · balance upward · derived data is generated · *the past is
immutable and some records cannot be backfilled* · storing is not exposing · harm
is a gate and taste is a note · vendors behind interfaces · the written docs are
canon. The `Constitution Check` gate in `.specify/templates/plan-template.md`
carries all nine as a table. **XVI is the only one that cannot be retrofitted.**
