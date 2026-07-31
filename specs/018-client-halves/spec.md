# Feature Specification: The Client Halves — Forge, Store and Replays

**Feature Branch**: `018-client-halves` *(no branch — straight to `main`)*

**Created**: 2026-07-30

**Status**: Draft

**Input**: The three screens named in [`specs/GAPS.md`](../GAPS.md) §"What is unowned". Each is a player-facing surface over a backend that is already built, tested and deployed.

---

## TL;DR

Three things the game can already do that no player can reach: **place a rune**,
**buy a pass**, and **watch a replay**. The servers for all three are finished and
live. Nobody ever wrote the screens.

This is not new product scope. Features 008, 010 and 011 each describe these
actions in their own specs, in player language — *"a player wins battles,
accumulates shards, and commits them to runes"*, *"complete a purchase end to
end"*, *"a player opens their battle list, picks a fight from yesterday, and
watches it play out"*. **The specs were right. Their task lists decomposed only the
server half**, so each was closed honestly while its own user story stayed
undelivered.

## Why these three are here and the rest of the audit is not

`GAPS.md` found 16 unreachable routes. Most are **wiring** — a control that calls a
route from a screen that already exists — and those go back to the features that
own them (013's officer half, 009's starter exit). These three are different: each
needs **a surface that does not exist at all**.

| | Backend | Design | Task before now |
|---|---|---|---|
| **Rune Forge** | ✅ 010, complete | ✅ `LMNTLZ Rune Forge.dc.html` | **none, anywhere** |
| **Store & checkout** | ✅ 011 routes; ⛔ **no provider adapter** | ⛔ **none — never designed** | 011 T026 edits a screen no task creates |
| **Replay viewer** | ✅ 008, complete | ⚠️ partial — reuses Battle + Turn Sequence | **none** |

> ### ⚠️ The store has no design, and it is the only screen that takes money
>
> Twenty design exports exist. **None of them is a store, a shop, a checkout or a
> pricing screen.** Every other surface in this feature can be ported; this one has
> to be designed first. It is the same category as `THE COURT` in 017 — a thing the
> product needs that was never drawn — except this one stands between the game and
> its revenue.
>
> **This does not block the feature.** US2 below specifies the store's *behaviour*
> completely, and behaviour is what a spec owes. What it cannot do is specify a look
> that does not exist, so US2's visual treatment is built from 017's component layer
> and the Brand Book rather than from an export.

> ### ⚠️ And there is still no payment provider
>
> `PaymentRail` is defined, `setRail()` exists and is **called by tests only**, and
> `apps/api/src/payments/vendor/` contains nothing but a mailer. `POST /checkout`
> in production raises `NoRailError`. **That adapter is 011 T031 and stays there** —
> US2 depends on it and does not contain it. A store screen shipped before the
> adapter is a checkout button that always fails.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A player places a rune (Priority: P1)

A player opens the Forge, chooses a hero and a slot, sees exactly what a stage
costs and grants, and commits shards to it — having been told plainly and *before*
acting that replacing a rune destroys the one already there.

**Why this priority**: It is the game's entire permanent-progression system and the
thing shards exist for. It also gates the ladder: gear score reads placed runes, so
until this exists **every player stays in Bronze forever** — the exact symptom
`progression/install.ts` was written to prevent, arriving through a different door.

**Independent Test**: Place a rune end to end, confirm the shard balance falls by
the stage cost, the hero's stat rises by the stage boost, and gear score moves.

**Acceptance Scenarios**:

1. **Given** a hero with an empty slot, **When** the player opens it, **Then** each
   stage shows its cost and its boost, taken from the generated source and never
   transcribed.
2. **Given** a player with fewer shards than the stage costs, **When** they try to
   commit, **Then** the control refuses before any charge and says what is short.
3. **Given** a slot that already holds a rune, **When** the player selects a
   different element for it, **Then** they are told **before confirming** that the
   existing rune is destroyed and rebuilding starts at stage one, and the
   confirmation is explicit rather than a default.
4. **Given** an allocation the player is considering, **When** they explore it,
   **Then** nothing is charged and nothing is stored — planning is free.
5. **Given** a commit that would exceed the stat cap, **When** it is attempted,
   **Then** it is refused with the cap named, and no shards move.
6. **Given** a successful placement, **When** it settles, **Then** the ledger shows
   one row per stage and the balance shown to the player matches the ledger sum.

---

### User Story 2 — A player buys a pass (Priority: P1)

A player sees the seven durations with their prices, picks one, completes payment,
and can afterwards see what they hold and when it ends.

**Why this priority**: It is the only revenue the product has, and every part of it
except the screen is built. It is P1 alongside US1 rather than above it because it
**cannot ship without 011 T031**, which is not in this feature.

**Independent Test**: With a provider adapter installed in sandbox, complete a
purchase end to end and confirm the entitlement appears on the account.

**Acceptance Scenarios**:

1. **Given** the store, **When** it renders, **Then** all seven durations are shown
   with prices **read from the catalog**, never transcribed into the view.
2. **Given** a chosen duration, **When** the player proceeds, **Then** the exact
   statement descriptor is shown **adjacent to the pay control and not in a
   footer**, so the charge is recognisable on a card statement (011 T026, T042).
3. **Given** a completed purchase, **When** it settles, **Then** the player can see
   what they hold and when it expires.
4. **Given** a player who already holds a pass, **When** they buy another, **Then**
   the days add and the display reflects the combined end date.
5. **Given** a purchase that would breach the spend ceiling, **When** it is
   attempted, **Then** it is refused **before** the provider is reached.
6. **Given** no provider adapter is installed, **When** the store is opened, **Then**
   it states plainly that purchasing is unavailable rather than offering a control
   that fails on click.

---

### User Story 3 — A player watches a replay (Priority: P2)

A player opens their battle list, picks a fight from the last seven days, and
watches it play out exactly as it happened.

**Why this priority**: Real value and the smallest of the three, but nothing else
depends on it and no economy or ladder behaviour is blocked by its absence.

**Independent Test**: Watch a battle recorded before a balance change and confirm it
plays identically afterwards.

**Acceptance Scenarios**:

1. **Given** the battle list, **When** it renders, **Then** each entry shows whether
   it is still watchable, using the flag the server supplies rather than a date the
   client computes.
2. **Given** a watchable battle, **When** the player opens it, **Then** it replays
   from the stored event log.
3. **Given** a battle whose replay has expired, **When** the player opens it,
   **Then** the outcome and record remain and only *watching* is gone — the entry
   must not read as though the battle were deleted.
4. **Given** a replay of a battle fought before a balance patch, **When** it is
   watched after the patch, **Then** the outcome is identical.
5. **Given** a battle the player did not take part in, **When** its replay is
   requested, **Then** it is not found — existence is not confirmed.

---

### Edge Cases

- **A rune placement is interrupted mid-commit.** Stages are individually charged
  and individually recorded; a partial sequence leaves a valid lower stage, never a
  half-stage.
- **The player's balance changes in another tab.** The balance is derived on read,
  so the screen must re-derive rather than trust what it rendered with.
- **A purchase settles while the store is open.** The entitlement view must reflect
  it without requiring a reload.
- **A replay blob is missing** because the upload failed. The record still exists;
  only watching is unavailable, and it must say which.
- **A replay is watched at the moment it expires.** Expiry is not a race the player
  can lose mid-view.
- **Every screen here must be leavable.** A finished replay, a completed purchase
  and a committed rune each need a way back — a fallback that requires a page reload
  is not navigation.

## Requirements *(mandatory)*

### Functional Requirements

**The Forge (US1)**

- **FR-001**: Every stage cost, boost and cap MUST be read from the generated
  progression source at render time, never transcribed into the view.
- **FR-002**: Planning an allocation MUST charge nothing and store nothing.
- **FR-003**: Destroying an existing rune MUST require an explicit confirmation that
  names the consequence, and MUST NOT be the default action.
- **FR-004**: A commit that would breach the stat cap or the player's balance MUST
  be refused before any shard moves.
- **FR-005**: The Forge MUST be reachable from the shell, and MUST show the player's
  current balance beside every price.

**The store (US2)**

- **FR-006**: Prices and durations MUST come from the catalog route, never hardcoded
  in the client.
- **FR-007**: The exact statement descriptor MUST appear adjacent to the pay control.
- **FR-008**: A player MUST be able to see current entitlements and their end dates.
- **FR-009**: With no provider installed, the store MUST say purchasing is
  unavailable rather than present a failing control.
- **FR-010**: The client MUST NOT be trusted for price, entitlement or eligibility —
  every one is decided server-side.

**Replays (US3)**

- **FR-011**: Watchability MUST come from the server's flag, not a client-side date
  calculation.
- **FR-012**: An expired replay MUST present as *"no longer watchable"*, never as a
  missing or deleted battle.
- **FR-013**: A non-participant's request MUST NOT confirm the battle exists.
- **FR-014**: Replays MUST be played from the stored log. **No re-simulation path may
  be built** (Constitution XVI).

**Across all three**

- **FR-015**: Every screen MUST be built from 017's component layer, and MUST NOT
  introduce colour literals or a private button.
- **FR-016**: Every screen MUST have a way out that does not require a page reload.
- **FR-017**: Each screen MUST have a **wiring task naming its caller** — the rail
  entry that renders it and the route it requests — per
  `.specify/templates/tasks-template.md`.

### Key Entities

- **Rune placement**: a hero, a slot, an element, a stage, an allocation.
- **Pass**: one of seven durations granting the boost pair for a number of days.
- **Entitlement**: what an account holds and until when. Belongs to the account,
  never to a storefront.
- **Replay**: a stored event log for a battle, watchable for seven days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can place a rune end to end, and gear score moves as a result.
- **SC-002**: Zero progression numbers are transcribed into the client — changing the
  generated source changes the screen with no edit to the screen.
- **SC-003**: No rune is ever destroyed without an explicit confirmation naming the
  consequence.
- **SC-004**: A player can buy each of the seven durations in sandbox and see the
  resulting entitlement.
- **SC-005**: The statement descriptor is visible at the moment of payment.
- **SC-006**: A player can watch any battle from the last seven days, and a battle
  older than that reads as unwatchable rather than missing.
- **SC-007**: A replay recorded before a balance change plays identically after it.
- **SC-008**: `py tools/gap-audit.py` reports these routes as reached:
  `/heroes/:id/runes/:slot`, `/catalog`, `/checkout`, `/me/entitlements`,
  `/replays/:id` — **the audit that found them is the test that closes them**.
- **SC-009**: Every screen is reachable from the rail and leavable without a reload.

## Assumptions

- **017 lands first.** All three screens are built on its component layer; building
  them before it means building them twice, which is the debt 017 exists to stop.
- **011 T031 stays in 011.** US2 depends on the provider adapter and does not contain
  it. The store can be built and demonstrated against a test rail before the real one
  exists.
- **The store's visual design does not exist and will not block it.** Behaviour is
  fully specified here; appearance comes from the component layer and the Brand Book.
  If a store screen is designed later, adopting it is a port, not a rebuild.
- **The replay viewer reuses the battle presentation** rather than inventing a second
  one. A replay is the same board and the same turn queue driven from a stored log
  instead of a live one.
- **This adds no product scope.** Every behaviour here is already specified in 008,
  010 and 011. This feature supplies the decomposition those three never got.

## Dependencies

| Depends on | For |
|---|---|
| **017 design port** | the component layer every screen is built from |
| **011 T031** | the payment provider adapter — US2 cannot complete without it |
| 010, 011, 008 backends | all complete, tested and deployed |

**Nothing depends on this feature.** 014, 015 and 016 are independent of it.

## Explicitly not in this feature

| | Where it belongs |
|---|---|
| Guild officer half — inbound applications, accept, dismiss, invitations, pitch | **013**, as a wiring phase |
| Starter-league exit, matchmaking config readout | **009**, as a wiring phase |
| The payment provider adapter | **011 T031** |
| Cron for replay cleanup | **016 T034 / T037** |
| Deleting the three dead routes (`/me`, `/invites`, `/me/battles`) | their owning features |
| Designing a store screen, and designing `THE COURT` | design work, not a build |
