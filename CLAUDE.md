# CLAUDE.md

Always-on operating context for LMNTLZ. The shared, tool-neutral rules live in
`@AGENTS.md` — read them; they govern how to work here.

@AGENTS.md

## What LMNTLZ is

A competitive fantasy squad battler. Nine damage types (6 magic: Earth, Air,
Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each
for a 27-hero roster. Players field 5 heroes to attack and leave 5 to defend;
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

## Deliberately undecided

- **Stack, framework, and hosting are open.** An earlier stack decision was
  explicitly discarded and should not be treated as precedent. `stacks/nextjs.md`
  ships with the toolkit as a reference pack, **not** as a choice that's been
  made — don't infer Next.js from its presence.
- **Whether magic heroes may take melee secondaries.** Allowing it makes every
  one of the 9 types Bane to 3 heroes and Fault to 3 heroes (reaching 6 of 27),
  which is perfectly symmetric. Disallowing it is coherent but leaves melee
  attackers at roughly a third the counter-building reach of magic ones.

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
