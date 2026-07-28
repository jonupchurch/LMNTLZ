# Phase 0 Research: Roster & Squads

**Feature**: `006-roster-and-squads` | **Date**: 2026-07-28 | **Plan**: [plan.md](plan.md)

Three questions. **Q3 was resolved while the plan was being written** and is the
finding that justified planning the whole set before building any of it.

---

## Q1 — What counts as "editing" a defense squad, for the streak reset

**Decision: the hold streak resets when the squad's *canonical form* changes.
A save that produces an identical canonical form is a no-op and costs nothing.**

```
canonicalForm(squad) = for each of the six seats, in row order then seat order:
                         heroId
                         targeting primary, targeting fallback
                         power ranking (all six)
                         ally rule, or null
```

Reset iff `sha256(canonicalForm(new)) !== sha256(canonicalForm(old))`.

**A no-op save must not cost a streak, or the reset becomes a trap.** A player who
opens the editor to *read* their configuration — which is the normal way to check
what a squad is doing before deciding whether to change it — must be able to close
it without penalty. Charging for that teaches players not to look, which is the
opposite of what a builder-first design wants.

**What is deliberately inside the hash, and why each one is a real change:**

| Included | Because |
|---|---|
| hero identity per seat | obviously |
| which **seat** each hero occupies | row placement decides reach, and swapping two heroes between rows changes what the squad can hit |
| targeting primary **and** fallback | the fallback is the rule that usually fires — 49–80% of the time — so changing it changes the defense more than changing the primary does |
| the full power ranking | a ranking change can switch a power off entirely |
| the ally rule | it decides who a Buffer heals, which decides whether the squad survives |

**What is deliberately outside:**

| Excluded | Because |
|---|---|
| **rune placement and gear score** | Runes are permanent and destroyed on replacement (`06-progression.md`); a player who invests in a hero has not changed their *plan*. Resetting a 40-day streak for upgrading a hero would make investment and defense mutually exclusive. |
| squad **name** or any cosmetic | not a plan |
| the order the seats were *saved* in | canonicalisation exists to make this invisible |

> **The rune exclusion is a judgement call and it should be visible.** The
> argument the other way is that a runed squad is a different opponent, so the
> streak is against a different thing. The argument that wins: the streak measures
> **how long a plan has held**, and gear is not the plan. It also removes a
> perverse incentive — under the other rule, the correct play is to never improve a
> defending hero.

**Two consequences to implement:**

- **Reordering to an identical arrangement is free**, which is Q1's stated case.
- **The comparison is on canonical form, not on a dirty flag.** A dirty flag is set
  by the editor, which means it is set by the client, which means it is wrong the
  first time a re-render touches a field.

---

## Q2 — The eviction warning for the three-squad case

**Decision: the warning is written for the *set*, names every affected squad, and
its default shape is plural. It appears *before* the move commits.**

The default case is not the exception: **3 × 6 = 18 heroes drawn from 15**, so
overlap is forced and one hero commonly sits in all three attack squads. A warning
written for one squad and scaled up reads wrong precisely when it fires most.

```
Move Bramwen to Zone I defense?

Bramwen is in 3 of your attack squads. Moving her to defense
removes her from all three, and all three become incomplete:

  Vanguard      5 of 6   ← was ready
  Second Wind   5 of 6   ← was ready
  Long Reach    5 of 6   ← was ready

You have 14 heroes left for 3 squads of 6.

                                      [ Cancel ]  [ Move her ]
```

Three things the copy must do, each from a different failure it prevents:

1. **Count first, then name.** *"3 of your attack squads"* before the list. A
   player scanning past a wall of squad names still reads the number.
2. **Name every squad, never "and 2 others".** Truncation is what makes a player
   discover the third squad mid-battle.
3. **State the remaining pool.** `You have 14 heroes left for 3 squads of 6` is the
   sentence that makes the constraint legible — it is *why* this keeps happening,
   and no per-squad message conveys it.

**Singular and zero are the special cases, not plural.** The template renders
plural by default; one squad and no squads are the branches. That ordering is
deliberate — the common path is the one that gets exercised.

**The warning is confirmation, not information.** FR-019's shape elsewhere in the
design is *surface, do not block* — but eviction is **destructive and non-obvious**,
so it takes a confirm. Contrast with a self-defeating power ranking (feature 004),
which is surfaced and permitted: that one is recoverable by reopening a dropdown.

**No auto-repair.** Do not silently substitute another hero into the gap. The
squad is the player's plan; filling it for them replaces the plan with a guess and
hides the fact that they are now over-committed.

---

## Q3 — Firing profile availability — ~~open~~ **resolved**

**Resolved while writing the plan.** `firingProfile` is needed **client-side**,
because the squad builder must display which powers will fire while the player
drags a ranking widget — but `sim/ai` is **server-only**, like `sim/resolver`,
because it makes choices.

**A firing profile is not a choice.** *A power fires only when everything above it
is on cooldown* is arithmetic over the cooldown ladder — a pure function of
`(hero, ranking)` with no randomness and no server state. It meets every condition
for `rules/` and none of those that put anything in `ai/`.

**It moved to `packages/sim/rules/firingProfile.ts`.** The builder imports it
directly. No endpoint exists.

> **This is what the planning pass is for.** Discovered during implementation
> instead, the natural fix is an endpoint — a network round trip on every drag of a
> ranking widget, to compute something the client can derive locally from a package
> it already imports. Cheap to fix on paper; a performance bug and an API surface
> to deprecate otherwise.

**One thing feature 004's Phase 0 added after the move**, which this feature
consumes directly: `firingProfile` takes a **horizon**, and the builder must pass
**9 turns**, not 60. A hero takes ~8.5 turns in a real 6v6. A 60-turn profile
tells a player their tier-0 auto-attack fires 5% of the time; at battle length it
usually never fires at all. The number on the screen has to describe the game the
player is about to play.

---

## Settled here because the shape forces it

**The two zones are configured identically.** `02-squads.md` question 6 closed to
*the defense squad follows identical combat rules*, and `07-defense-ai.md` confirms
the engine plays both zones the same way. Visible and Hidden differ **only** in
visibility and reward — what an attacker can see, how a battle is entered, and what
a hold pays. So there is one squad editor, one validator, one config shape, and
`zone` is a parameter.

**Hold streaks are per zone and both are public.** `scout` returns **both** streaks
and **only** the Visible composition. One endpoint with two disclosure rules, which
is why it is its own contract rather than a variant of the profile read — a shared
serialiser is how the Hidden squad leaks.

**The reach-1-in-the-back-seat warning is a warning, not a block.** A reach-1
champion in row 1 reaches only its own middle row, so it cannot attack at all and
passes unless it owns a friendly power. `07-defense-ai.md` records this as *"the
seat the squad builder already warns about, behaving as documented rather than as a
bug"* — so the builder must actually carry that warning, and the constraint is
legal.

## What is NOT settled here

- **The exact ally-targeting menu.** `07-defense-ai.md` leaves it open beyond
  "short enough to read on a squad-builder row" and "the default is lowest HP
  percentage". No contract here depends on the final list.
- **Whether reach stays a field separate from Role.** All 12 reach-1 heroes are
  Strikers. Open in `01-stats.md`; changes no signature here.
