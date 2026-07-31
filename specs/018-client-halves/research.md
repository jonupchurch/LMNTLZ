# Phase 0 — Research: The Client Halves

**Date**: 2026-07-30 · **Spec**: [spec.md](spec.md)

Measured against the repository. Three of these change the plan; the last one
removes work I expected to need.

---

## R1 · ⛔ The Forge needs a route that does not exist

**Finding.** `POST /v1/heroes/:heroId/runes/:slot` **commits** a stage. Nothing
**reads** one back. A search of every route for rune state returns exactly one
result, and it is the wrong one:

| Where runes appear | What it gives | Fit for the Forge |
|---|---|---|
| `squads/scoutSerializer.ts` | **element and stages only** | ❌ deliberately withholds the stat |
| `POST /heroes/:id/runes/:slot` | commits, returns the result | ❌ write path |
| *(anywhere else)* | — | — |

The scout serializer's own comment says it: *"Element and stages only. Which stat a
rune boosts is the thing…"* — that is the **scout disclosure boundary**, and it is
correct. An opponent must not learn a hero's stat allocation.

**But the owner must see exactly that**, and the Forge is unbuildable without it: it
has to show which slot holds what, at what stage, allocating which stats, before a
player can decide anything.

**Decision.** Add `GET /v1/me/runes` — the player's own placements, with
allocations. **It must not share a serialiser with the scout path.** 012 made the
same call for `profile` versus `scout` and wrote it down as a standing instruction;
this is the third surface where the same two audiences want the same table.

> **This is the one API addition in 018.** The spec says the backends are complete,
> and for 008 and 011 they are. For 010 the *write* half is complete and the *read*
> half was never needed, because nothing ever displayed a rune.

---

## R2 · Everything else the Forge needs is already served

**`GET /v1/me/shards` returns `config: progressionConfig()`** — and the client
already calls it from `ProfileScreen` and `GuildScreen`.

```ts
interface ProgressionConfig {
  stageCosts, stageBoosts, fullRuneCost, capInRunes, balanceCap,
  dailyTiers, attackVictory, defenseHold, hiddenMultiplier, holdsAreTiered
}
```

Its own comment says *"the client already renders the taper, the cap and the rune
costs"* — aspirational, since the client renders none of them, but the **shape is
right and no API change is needed**. `STAT_CAP` comes from `@lmntlz/content`, which
the client already imports.

**Consequence for FR-001**: every number the Forge shows — 150 · 150 · 150 · 200,
+20 · +10 · +5, the 650 rebuild, the 75 cap — is **already available from the
server or from generated content**. There is no excuse for a literal, and a task
asserts there is none.

---

## R3 · The daily reset is UTC midnight — implemented, served, and not in canon

The store design tells the player *"THE CAP RESETS AT 00:00 UTC"*. Checked:

```ts
function dayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
// and nextBoundaryAt(now) is already returned by GET /me/shards
```

**The code implements it and serves the next boundary as an absolute instant.** The
screen is right. `06-progression.md` does not state it.

**Decision — two parts.**

1. **Write the rule into `resources/mechanics/06-progression.md`** before a screen
   shows it. Constitution XX: a `.dc.html` is not canon, and *"is this written in
   `docs/` or `resources/mechanics/`?"* is the test. It is almost certainly right;
   it simply is not written down anywhere that counts.
2. **Render `nextBoundaryAt`, not the string "00:00 UTC".** `config.ts` says
   plainly why: *"served as an absolute instant, so if this is ever changed to
   something per-player, the API shape does not have to change with it."* A screen
   that hardcodes the string quietly re-litigates that decision.

---

## R4 · The replay viewer reuses the battle presentation

**Decision.** No second board and no second turn queue. `BattleScreen` and
`TurnQueue` render from a `BattleState`; a replay is the same state driven from a
stored log instead of a live one.

**Rationale.** Constitution XIII and XVI together. A second renderer is a second
place for the game to be described, and **the moment a replay path can re-simulate,
a balance patch can change a past battle** — which is exactly what 008 T023 forbids
(*"Build no re-simulation path"*). Driving the existing components from a stored
event log makes re-simulation not merely banned but absent.

**The server already answers the hard part.** `listBattles()` returns
`watchable` **per entry**, computed server-side, and its comment explains why a
client must not work it out by trying: the failure *"would arrive after a click, on
a screen that had already promised a video, and be indistinguishable from a network
problem."* One flag covers four situations — never written, deleted, past the
window, held for a report — because the player's options are the same in all four.

`getReplay()` distinguishes `not-found` from `expired`/`unavailable`, and returns
**`404` for a non-participant** rather than `403`, so existence is never confirmed
(Constitution XVII).

**`asModerator` stays `false`.** Nothing can set it and 015 owns the operator
identity that would. A held replay past its window is currently readable by nobody,
which the code calls *"the correct direction to be wrong in."* 018 does not touch it.

---

## R5 · The store builds and tests without a payment provider

**Decision.** Build US2 in full against a **test rail**, and do not wait on Paddle.

**Rationale.** `PaymentRail` is injected via `setRail()`, which is how every payments
test in 011 already runs. The screens, the catalog rendering, the ceiling refusal,
the entitlement readout and the descriptor placement are all exercisable with no
vendor. Paddle is deferred to near the end by decision (2026-07-30), and **nothing
here is blocked by that**.

**Two things are genuinely blocking and neither is Paddle.**

1. **⛔ The boost pass does nothing** (011 Phase 8). `awardShards()` computes
   `base × zone × dailyTier × starter` and never reads the entitlement. This must
   land **before** the store ships — selling a pass that pays nothing is worse than
   selling nothing, because unlike the missing adapter it fails silently.
2. **FR-009** — with no rail installed the store must *say* purchasing is
   unavailable rather than present a control that raises `NoRailError` on click.
   That is not a stopgap; it is the correct behaviour whenever a vendor is down.

---

## R6 · All three screens have designs, and the rail is longer than 017 thought

`LMNTLZ Store.dc.html` landed 2026-07-30, so every screen here is a **port**:

| Screen | Export |
|---|---|
| Rune Forge | `LMNTLZ Rune Forge.dc.html` |
| Store & checkout | `LMNTLZ Store.dc.html` |
| Replay viewer | reuses `LMNTLZ Battle` + `Turn Sequence` + `Battle Record` |

The store export's rail reads
`SQUADS · ROSTER 27 · RUNE FORGE · MATCHMAKING · THE COURT · THE STORE · CODEX` —
so **the Forge and the Store are top-level destinations**. 017 builds the rail with
the five entries whose screens exist; **018 registers the other two as it builds
them**, which is FR-015 working rather than a shortfall.

**The Forge export is canon-accurate**, checked line by line: *"PLANNING IS FREE ·
COMMITTING IS PERMANENT"*, *"THREE SLOTS · ONE PRIMARY, ONE SECONDARY, ONE
COMMON"*, *"STAT LINE · CAP 75 PER STAT"*, *"WHOLE RUNE · 650"*, *"MUST BE A
DISTINCT STAT"*, and *"to change what it does, the rune must be destroyed and
rebuilt from stage one"* all match `runes.ts`, `schema.ts` and
`06-progression.md`. **No discrepancy to log** — unlike four other exports.

---

## Resolved

No NEEDS CLARIFICATION. R1 adds one route to the plan; R3 adds one canon edit; R5
records what must land before US2 and what may safely wait.
