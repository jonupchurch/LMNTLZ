# `apps/api/src/squads`

Allocation, the hold streak, ambush odds, and the one endpoint that discloses a
player to an opponent.

## The arithmetic everything else follows from

```
27 champions, all unlocked, identical for every player
12 to defense across two engine-run zones — and those 12 cannot attack
up to 3 attack squads drawn from the remaining 15

  3 × 6 = 18 > 15   →  overlap between attack squads is FORCED
```

**That last line is the one to hold on to.** Overlap is not an edge case to be
tolerated; it is the ordinary state of a full roster. A uniqueness rule across
offense squads makes the game unplayable — and it would pass every test written
with fewer than three squads, which is every test somebody writes by default.

So the only per-champion uniqueness in the schema is **within a single squad**.

## What is a constraint and what is code

Everything expressible in the schema **is** in the schema, because an invariant
enforced only in application code is one migration `INSERT` away from being
violated.

| Rule | Where | Why there |
|---|---|---|
| 2 front / 3 middle / 1 back | `@lmntlz/sim/rules` | the builder runs it on every drag; a copy in the client is the one thing the architecture forbids |
| one seat per position, one champion per squad | unique indexes | expressible, so expressed |
| a defense squad has a zone and no slot | `CHECK` | without it a row can be neither kind |
| one Visible and one Hidden per account | **partial** unique indexes | a plain unique index treats every `NULL` as distinct and would permit a second Visible squad |
| a defender may not attack | `allocation.ts` | spans rows; no `CHECK` can say it |
| eviction | `repository.ts` | needs all three attack squads as they exist *now* |

**The formation rule lives in `packages/sim/rules/formation.ts`, not here.**
`allocation.ts` wraps it in the `422`; the client renders the same fault inline.
One implementation, two presentations.

## The streak resets on a hash, never on a flag

```
canonicalForm = per seat, in row then index order:
                heroId · targeting[0] · targeting[1] · ranking · allyRule
```

Reset iff `sha256(canonicalForm(new)) !== sha256(canonicalForm(old))`.

**A dirty flag is set by the editor, so it is set by the client, so it is wrong
the first time a re-render touches a field** — and wrong in the player's favour,
which is the direction nobody reports.

**A no-op save must cost nothing.** Opening the editor to *read* a configuration
is the normal way to check what a squad is doing before deciding whether to
change it. Charge a 40-day streak for that and players learn not to look, which
is exactly backwards for a builder-first game. Seat order is canonicalised, so
"moved someone, moved them back, saved" is free.

### Inside the hash

Hero identity **and which seat** — row placement decides reach, so swapping two
champions between rows changes what the squad can hit. Targeting primary **and
fallback** — the fallback is the rule that fires 49–80% of the time. The full
power ranking, and the ally rule.

### Outside it, deliberately

**Runes and gear score.** The streak measures how long a *plan* has held, and
gear is not the plan. Include it and "improve a defending champion" and "keep a
streak" become mutually exclusive — under which the correct play is to never
upgrade a defender, a perverse incentive nobody designed. Runes are permanent
and destroyed on replacement, so this is not a small cost either way. Asserted
structurally: `canonical.ts` may not mention rune, gear, stage or level.

Also outside: the squad name, anything cosmetic, and the order seats arrived in.

## Three streaks that must never be conflated

```
attackStreak   ONE per player          consecutive attack wins  → feeds ambush
holdStreak     ONE per Visible squad   days held                → public, cosmetic
holdStreak     ONE per Hidden squad    days held                → public, cosmetic
```

All three are integers called "streak" and **only the first changes what happens
to anybody.** A hold streak feeding ambush would mean editing a defense squad
lowers your own ambush odds — which nothing in the design says and no player
would guess.

`attackStreak` lives on the **account**, and that placement *is* FR-013. On a
squad it would reset when the player switched squads, and switching squads is
the ordinary way to answer a different opponent.

**An ambushed loss does not reset it.** The player did not choose that fight; the
ambush chose them, and it is the harder one. Resetting would make the reward for
a long streak be that the streak ends.

## Ambush constants are served, never compiled in

`+2%` per win, capped at **90%**, reached at 45 wins. The cap is under 100 so the
Visible squad stays live — a guaranteed ambush means nobody ever fights the only
squad anybody can *choose* to attack.

**SC-008 greps `apps/client/src` for either value and requires zero matches.** The
reason is a week of disagreement, not tidiness: ambush rate decides how often
anybody's Hidden squad is ever seen, and if 2% is wrong the fix has to be config
— not a client build, a store submission and a Steam update some players will not
take for a week, during which the web and Steam builds disagree about a
competitive number.

## Warnings never block; eviction does

Constitution XVIII — harm is a gate, taste is a note.

| | |
|---|---|
| `reach-1-back-seat` | **warns, saves.** It is how you protect a fragile attacker, and empty rows are skipped so range opens up as a battle wears on |
| `power-never-fires` | **warns, saves.** A ranking is a lever, and reopening a dropdown undoes it |
| eviction | **confirms.** Destructive and non-obvious — the squads it breaks are not the one on screen |

### `power-never-fires` is measured at 60 turns, not 9, and that is load-bearing

The obvious implementation asks `firingProfile(hero, ranking, BATTLE_TURNS)` —
the same 9-turn horizon the builder *displays*. Measured:

```
5·4·3·2·1·0   a RECOMMENDED ordering   @ 9 turns: 21/27 heroes   @60: 0/27
1·2·3·4·5·0   self-defeating           @ 9 turns: 27/27, 81      @60: 27/27, 81
```

A warning that fires on **21 of 27 champions using the game's own recommended
ranking** is noise, and the first thing a player learns is to ignore it —
including the times it means something.

Two different things, one mistake: fires at 60 but not at 9 means the power is
**slow** (a real cost; the count says so). Fires at neither means the ranking has
**switched it off**, and no battle length recovers it. **The display uses 9
turns and the warning uses 60.**

> Feature 004's twelve `SAFE_ORDERINGS` were measured at 60. Every one of them
> leaves a 9-turn zero somewhere. Worth knowing before the hero-numbers pass
> touches cooldowns.

## Eviction is complete or it is wrong

`evictionImpact` returns **every** attack squad containing the champion, in slot
order, never truncated. Truncation is how a player discovers the third squad
mid-battle.

It also returns the pool: `14 champions left for 3 squads of 6` is *why* this
keeps happening, and no per-squad message conveys it. The confirm is **plural by
default**; singular and zero are the branches.

**No auto-repair.** Nothing substitutes another champion into the gap — the squad
is the player's plan, and filling it replaces the plan with a guess while hiding
that they are now over-committed. An invalidated squad cannot attack until it is
refilled to six, because that squad was most likely broken by *our own* eviction
rule rather than left unfinished, and fighting five-strong would be a loss the
game caused and the player could not see coming.

## `scoutSerializer.ts` is its own file, and imports none

**A shared serialiser is exactly how the Hidden squad leaks** — not because
somebody writes `hidden: fullSquad`, but because a *later* feature adds a field
to a shared function for a good reason, and that field is now disclosed to an
opponent, silently. This module builds its output field by field. More code, on
purpose: adding a field to a player elsewhere cannot reach it.

| Disclosed | Withheld |
|---|---|
| the six Visible champions and both their types, so Bane and Fault | **every stat value**, base or runed |
| the 2/3/1 formation | **which stat** any rune boosts |
| three rune slots: element and stages 0–4 | **which utility effect** a completed slot holds |
| **both** hold streaks | **targeting and ranking, in both zones** |
| | **the entire Hidden composition** |

`hidden` is asserted to have **exactly one key**. An empty `seats` array would
still tell a scout the shape of what is missing.

**Rune fill shows commitment, never power.** At an identical 1,950-shard spend the
best allocation scores ~3.35× the worst, so a full set of pips means a player
committed — not that they committed well. That gap is what makes the disclosure
safe and bluffing a real strategy.

> **Storing is not exposing** (Constitution XVII). The database holds every stat,
> every ranking and the whole Hidden squad. This function is the boundary.

## How the tests are written, and why that way

**Absences are asserted structurally, because behaviour cannot prove one.**

- `scout.test.ts` searches the **entire serialised response** for values that must
  not appear, rather than checking remembered fields. Checking `body.hidden.seats`
  only tests the leaks you already thought of; the one that happens is a debug key
  or a joined object nobody was watching. The Hidden squad is stocked with
  champions who appear nowhere else in the fixture.
- `allocation.test.ts` greps every schema file for `unlocked`, `owned`,
  `acquired`, `recruited` and eight more. Nothing to collect is the competitive
  premise, and it dies as one reasonable-sounding column.
- The client suite greps `src/features/squads` for `streakResets`,
  `canonicalHash` and `evictionImpact`. A local eviction count is right most of
  the time and short by one squad exactly when a third squad exists.
- `firingProfile.test.tsx` stubs `fetch` to reject. **Any call fails the test** —
  if a request appears, `firingProfile` moved back to `sim/ai`.

Each of these was mutation-checked: the mutation was applied, the test failed,
the mutation was reverted.
