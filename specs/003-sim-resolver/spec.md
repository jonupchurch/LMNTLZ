# Feature Specification: Simulation — Resolver

**Feature Branch**: `003-sim-resolver` *(no branch — straight to `main`, per Constitution IX and Governance)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 03 of the LMNTLZ 1.0 set (`specs/README.md`). The half of the simulation that consumes randomness. Server only. The RNG seed never leaves it.

---

## The property everything else rests on

> **The resolver consumes randomness but is not unpredictable. It is a pure
> function of `(seed, action log)`.**

This is easy to misread as a subtlety and it is actually the load-bearing fact of
the whole architecture. **In-progress battle state is never stored** — it is
re-derived by replaying the action log on *every single request*. If the resolver
drew from a live entropy source, replaying the same log would produce different
hits and misses, and a battle would change underneath the player between one
action and the next.

So the resolver is **deterministic given its seed**, and randomness is a property
of the *seed's* unpredictability rather than of the draws.

Three consequences follow, and all three are requirements rather than advice:

1. **The order of draws is part of the engine contract.** Adding, removing or
   reordering a draw changes every in-flight battle's future. This is what
   `engineVersion` identifies and why deploys drain before switching.
2. **The seed must be unguessable and uninfluenceable.** A player who can predict
   the seed can read every future roll — the exact exploit Constitution XII exists
   to make unreachable.
3. **The seed is stored server-side and never transmitted.** It is kept so a
   battle can be re-derived while investigating a bug, without replay playback
   depending on that path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A battle does not change underneath the player (Priority: P1)

A player takes an action. The server replays the battle from its log, applies the
new action, and returns what happened. Every earlier turn resolves exactly as it
did the first time — the same hits, the same crits, the same statuses.

**Why this priority**: Without it there is no game. Re-derivation happens on every
request, so non-reproducibility is not a rare bug — it is every turn of every
battle.

**Independent Test**: Replay one battle's action log a thousand times. All
thousand runs produce byte-identical state.

**Acceptance Scenarios**:

1. **Given** a battle's seed and action log, **When** replayed any number of times, **Then** the resulting state is identical every time.
2. **Given** a battle at turn 20, **When** the player submits turn 21, **Then** turns 1–20 resolve exactly as they originally did.
3. **Given** two servers with the same engine and content versions, **When** both replay the same seed and log, **Then** they agree completely.
4. **Given** an action log replayed with a *different* seed, **When** compared, **Then** the outcomes differ — confirming the seed is what drives the draws.

---

### User Story 2 - A hostile client cannot predict a roll (Priority: P1)

A player inspects every byte the server sends, modifies their client freely, and
still cannot determine whether their next attack will land, whether it will crit,
or what the defence will do.

**Why this priority**: Equal-first. This is the exploit the entire
server-authoritative design exists to foreclose, and it is unpatchable if lost.

**Independent Test**: Inspect every payload the server sends a client across a
complete battle. The seed appears in none of them, and no value permits deriving
it.

**Acceptance Scenarios**:

1. **Given** any response sent to a client, **When** examined, **Then** it contains no seed and nothing from which a seed can be derived.
2. **Given** a player who has observed many complete battles, **When** they attempt to predict a future roll, **Then** they cannot do better than the stated probability.
3. **Given** a client that submits crafted input, **When** the server resolves, **Then** the input cannot influence which values are drawn.
4. **Given** a battle in progress, **When** a client requests state, **Then** it learns only what has already happened, never what is coming.

---

### User Story 3 - A player cannot shop for a good seed (Priority: P2)

A player repeatedly starts and abandons battles hoping for a favourable seed, and
gains nothing by doing so.

**Why this priority**: A predictable *or influenceable* seed is the same exploit
arriving by a different door. Abandoning battles is cheap, so anything the player
can retry, they will.

**Independent Test**: Start many battles against the same opponent with identical
squads. The seeds show no pattern and none is derivable from anything the player
supplied.

**Acceptance Scenarios**:

1. **Given** a new battle, **When** its seed is generated, **Then** it comes from a cryptographically unpredictable source on the server.
2. **Given** a player who abandons and restarts a battle, **When** the new battle begins, **Then** its seed is unrelated to the abandoned one.
3. **Given** anything the client supplies — squad, timing, target choice — **When** a seed is generated, **Then** none of it is an input.

---

### User Story 4 - Accuracy behaves as designed (Priority: P2)

Attacks land about as often as the interface said they would, and the attacker's
edge is present.

**Why this priority**: The `+20` edge and the 65–95% clamp are both load-bearing
and were tuned against a specific outcome. This is where that outcome is verified
rather than assumed.

**Independent Test**: Resolve a large sample at a known probability and confirm
the observed rate converges on it.

**Acceptance Scenarios**:

1. **Given** an attack whose computed probability is 82%, **When** resolved many times, **Then** the observed hit rate converges on 82%.
2. **Given** an attack, **When** resolved, **Then** exactly **one draw** decides hit or miss — the two contest terms are folded into a probability by the rules half, not rolled separately.
3. **Given** all 729 hero pairings at base stats, **When** sampled, **Then** the **median miss rate is about 9.4%**.
4. **Given** a hero with `Luck` 40, **When** it attacks many times, **Then** criticals occur about **20%** of the time — `Luck × 0.5` percent.
5. **Given** any pairing whatsoever, **When** resolved, **Then** the hit probability used lies within **65%–95%**.

---

### User Story 5 - A battle can be re-derived when something looks wrong (Priority: P3)

An investigator can reconstruct exactly what happened in a past battle from what
was stored, without that reconstruction being how replays are shown to players.

**Why this priority**: Genuinely useful and genuinely secondary. It must not
become the replay path — replays are recorded packets, and re-simulating them
would let a balance patch change a past result.

**Independent Test**: Take a stored battle, re-derive it from its seed and log,
and confirm it matches the recorded packets.

**Acceptance Scenarios**:

1. **Given** a stored battle's seed, log, engine version and content version, **When** re-derived, **Then** the result matches what was originally recorded.
2. **Given** a stored battle, **When** a player watches its replay, **Then** the replay is **played back as recorded** and no re-derivation occurs.
3. **Given** a battle recorded under an older engine version, **When** re-derivation is attempted under a newer one, **Then** the version mismatch is reported rather than silently producing different numbers.

---

### Edge Cases

- **A duplicate submission of the same action.** The log is append-only; the same log position must yield the same draws, so a duplicate must never resolve twice into two different outcomes.
- **An engine deploy mid-battle.** Draw order is part of the contract, so an in-flight battle resolved by two engine versions could diverge. Deploys drain first, and the version mismatch check exists to catch the case that should never happen.
- **A battle discarded during maintenance.** A complete no-op — no rating change either side, no rewards, and a refund of whatever it cost to start.
- **A power that resolves against several targets.** Each target consumes draws in a fixed, replayable order.
- **A reaction firing on an evaded attack.** Reactions fire even when the triggering attack missed, so a miss is not the end of a turn's draws.
- **The number of draws depending on an outcome** — for example, only rolling a critical after a hit lands. Permitted, because it remains deterministic; the sequence must simply be a stable function of what happened.
- **A status contested against `Resolve`.** A draw, governed by `resources/mechanics/05-status.md`.

## Requirements *(mandatory)*

### Functional Requirements

**Determinism**

- **FR-001**: Given the same seed and the same action log, the resolver MUST produce identical results on every execution.
- **FR-002**: The resolver MUST draw only from its seeded source. It MUST NOT read a clock, an environment value, or any ambient entropy during resolution.
- **FR-003**: The sequence of draws MUST be a stable function of the battle's history, so that replay consumes the same values in the same order.
- **FR-004**: A change to the number or order of draws MUST be treated as an engine change and reflected in the engine version.

**Seed custody**

- **FR-005**: The seed MUST NOT appear in any payload sent to a client, and no client-visible value may permit deriving it.
- **FR-006**: The seed MUST be generated server-side from a cryptographically unpredictable source.
- **FR-007**: No client-supplied value MAY be an input to seed generation.
- **FR-008**: The seed MUST be stored alongside the battle's action log, engine version and content version, for re-derivation during investigation.

**What the resolver decides**

- **FR-009**: The resolver MUST decide hit or miss using **exactly one draw** against the probability supplied by feature 02.
- **FR-010**: The resolver MUST decide critical hits at `Luck × 0.5` percent, doubling the packet when one occurs.
- **FR-011**: The resolver MUST decide whether contested effects take hold, per `05-status.md`.
- **FR-012**: The resolver MUST supply any randomness the defence AI (feature 04) requires, so that the AI's choices are replayable.
- **FR-013**: The resolver MUST NOT recompute anything feature 02 already determines — probabilities, mitigation, reach, turn order, effectiveness. It consumes those answers.

**Boundaries**

- **FR-014**: The resolver MUST run on the server only and MUST NOT be reachable from a client build.
- **FR-015**: Re-derivation MUST NOT be the mechanism by which replays are shown to players. Replays are played back as recorded.
- **FR-016**: Re-deriving a battle under a different engine or content version MUST report the mismatch rather than silently producing different numbers.

### Key Entities

- **Seed** — the value that makes a battle's randomness reproducible. Generated per battle, stored server-side, never transmitted.
- **Draw** — one consumption of the seeded sequence. Its position in the sequence is what makes replay exact.
- **Resolution packet** — what the server returns for one player action: the action's result and everything following it up to the player's next real choice.
- **Battle provenance** — `{seed, action log, engine version, content version}`, stored so a battle can be reconstructed for investigation.

## Success Criteria *(mandatory)*

- **SC-001**: Replaying one battle's log **1,000 times** produces identical state 1,000 times.
- **SC-002**: The seed appears in **zero** client-bound payloads across a complete battle.
- **SC-003**: A player observing any number of completed battles cannot predict a future roll better than its stated probability.
- **SC-004**: Observed hit rates converge on computed probabilities across a large sample.
- **SC-005**: Across all **729** hero pairings at base stats, the **median miss rate is ~9.4%**.
- **SC-006**: Critical hits occur at `Luck × 0.5` percent, within sampling tolerance.
- **SC-007**: **Exactly one draw** decides each hit-or-miss — never two.
- **SC-008**: Restarting a battle **never** yields a seed related to a previous attempt.
- **SC-009**: The resolver is **absent from the client build entirely** — not merely unused.
- **SC-010**: A re-derived battle matches its recorded packets exactly, under matching versions.

## Assumptions

- **Feature 02 supplies every probability.** The resolver draws; it does not decide odds. A probability computed in two places would eventually be two different probabilities (Constitution XIII).
- **Battle length and median miss rate are simulated figures, not measured ones.** The ~9.4% median miss and ~102 hero-turn battle come from simulation. SC-005 is a validation target for the sim, and feature 08 records the real distribution.
- **Values are provisional; the mechanism is not.** The hero-numbers pass has not run.
- **Draw order is an engine-version concern, and the maintenance drain is what protects it.** The three-state maintenance flag is specified in feature 16; this feature only requires the version stamp be honoured.
- **Duplicate-submission handling belongs to feature 07** (`battle`), which owns the action log. This feature requires only that the same log position yields the same draws.
- **Reactive powers exist as a property with no hero carrying one yet.** Their contested resolution is specified; nothing currently triggers it.

## Dependencies

**Upstream**: 01 (`content`), 02 (`sim-rules`).

**Downstream**: 04 (`defense-ai`) needs its randomness; 07 (`battle`) drives it;
08 (`replays`) records its output.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority, the seed boundary | **The whole feature.** FR-005 – FR-008, FR-014, SC-002, SC-009 |
| **XIII** | One rules engine | FR-013 — the resolver consumes feature 02's answers rather than recomputing them |
| **XVI** | The past is immutable | FR-015, FR-016 — re-derivation is for investigation, never for replay playback |
| **XIV** | Balance upward | SC-005 is the figure a balance change must not silently move |
