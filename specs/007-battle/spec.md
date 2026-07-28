# Feature Specification: Battle

**Feature Branch**: `007-battle` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 07 of the LMNTLZ 1.0 set (`specs/README.md`). The play loop — a player attacks a stored defense squad, one action at a time, against a server that holds no battle state.

---

## The shape of a battle

PvP is **asynchronous**. A player attacks a *snapshot* of another player's defense
squad; the defender is not present and the engine plays their side. There is no
realtime multiplayer and no netcode.

> **In-progress battle state is never stored.** Only an append-only action log is
> written. Every request replays that log to rebuild current state, applies the new
> action, and appends.

That means one source of truth, no cache, no expiry, no cleanup service — and
state cannot drift from the log, because state *is* the log. Discarding a battle
is simply never finishing it.

**One request returns more than one turn.** The server resolves the player's action
**and everything following it** — enemy turns, status ticks — up to the next point
the player actually chooses something, and returns it as a single packet. That
keeps a battle at roughly **20–40 requests rather than hundreds**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player fights a battle (Priority: P1)

A player picks a target, chooses a hero's power and a target each turn, and sees
what happened — including everything the enemy did in response — until the battle
ends.

**Why this priority**: It is the game.

**Independent Test**: Fight a battle start to finish and confirm it resolves with
a winner, correct rewards and a recorded result.

**Acceptance Scenarios**:

1. **Given** a chosen opponent, **When** a battle starts, **Then** it is created against a **snapshot** of that defense squad, unaffected by later edits to it.
2. **Given** a player's turn, **When** they submit an intent, **Then** the server resolves it and returns the result **plus everything following** up to their next real choice.
3. **Given** a returned packet, **When** the client renders it, **Then** it shows what happened without deciding any of it.
4. **Given** a battle in progress, **When** the player reloads or reconnects, **Then** the battle resumes exactly where it was.
5. **Given** all six of one side gone, **When** the battle ends, **Then** the outcome, rating change, streak change and rewards are applied once.

---

### User Story 2 - The same action never resolves twice (Priority: P1)

A player's connection drops mid-action and their client retries. The battle
advances once, not twice.

**Why this priority**: Equal-first. The log is append-only and replayed on every
request, so a duplicated append silently corrupts every subsequent turn — and
flaky connections are normal, not exceptional.

**Independent Test**: Submit the same intent repeatedly, including concurrently,
and confirm the log grows by exactly one entry and the same packet is returned
each time.

**Acceptance Scenarios**:

1. **Given** an intent already applied, **When** it is submitted again, **Then** the log is unchanged and the **original result** is returned.
2. **Given** two identical submissions arriving simultaneously, **When** both are processed, **Then** exactly one entry is appended.
3. **Given** an intent that is illegal in the current state, **When** submitted, **Then** it is refused with a reason and nothing is appended.
4. **Given** an intent naming a hero that is not the acting one, **When** submitted, **Then** it is refused.

---

### User Story 3 - Latency is hidden, never waited on (Priority: P2)

A player clicks a power and the wind-up animation begins instantly. The result
arrives before the impact frame.

**Why this priority**: The architecture is server-authoritative, so every action
costs a round trip. Whether that reads as responsive or sluggish is decided here.

**Independent Test**: Confirm the client begins animating on click rather than on
response, and that no animation blocks on the network.

**Acceptance Scenarios**:

1. **Given** a player commits an action, **When** the click registers, **Then** the request fires **and** the wind-up begins immediately.
2. **Given** a slow response, **When** it has not arrived by the impact frame, **Then** the client waits at a natural point rather than freezing mid-motion.
3. **Given** a response that contradicts the client's optimistic display, **When** it lands, **Then** the server's version is what is shown.

---

### User Story 4 - A maintenance window costs a player nothing (Priority: P2)

A deploy is scheduled. Battles already in flight are allowed to finish. Anything
that cannot finish is refunded completely.

**Why this priority**: This is the first support ticket after every window if it
is wrong, and the rule is cheap to honour and awkward to retrofit.

**Independent Test**: Enter the draining state with battles in flight; confirm no
new battles start, in-flight ones complete, and any discarded battle is a complete
no-op.

**Acceptance Scenarios**:

1. **Given** the `live` state, **When** a battle is requested, **Then** it is accepted and resolves normally.
2. **Given** the `draining` state, **When** a new battle is requested, **Then** it is refused while in-flight battles are allowed to finish.
3. **Given** the `down` state, **When** anything is requested, **Then** it is refused and in-flight battles are discarded.
4. **Given** a discarded battle, **When** it is settled, **Then** it is a **complete no-op** — no rating change either side, no rewards, and a **refund of whatever it cost to start**.
5. **Given** a battle whose engine version no longer matches, **When** an action is submitted, **Then** the mismatch is reported rather than resolved.

---

### User Story 5 - A battle always ends (Priority: P2)

No battle can be left open forever, whether by a stalemate or by a player who
walks away.

**Why this priority**: An unbounded battle is a growing per-request cost, since
the log is replayed each time.

**Independent Test**: Construct a stalemate and confirm the cap resolves it;
abandon a battle and confirm it does not remain open indefinitely.

**Acceptance Scenarios**:

1. **Given** a battle reaching **300 hero-turns**, **When** the cap fires, **Then** it resolves by pooled HP share and records normally.
2. **Given** a player who abandons a battle, **When** enough time passes, **Then** it is settled rather than left open forever.
3. **Given** a battle that never finishes, **When** the player starts another, **Then** the rules about concurrent battles are enforced consistently rather than silently.

---

### Edge Cases

- **The defender edits their squad mid-battle.** The battle runs against the snapshot taken at the start; the edit does not reach it.
- **The defender's hold streak** advances only when the battle actually concludes as a hold.
- **An ambush.** The attacker is routed into the Hidden squad instead of the Visible one, per the displayed chance. The battle is otherwise identical — the engine plays both zones the same way.
- **A player submits an action for a battle that has already ended.** Refused, with the final state returned.
- **Replaying the log takes longer as the battle lengthens.** Cost is roughly linear per action; the 300-turn cap is what bounds it. **This is the one condition under which the no-stored-state decision stops being correct** and is worth watching if battle length grows.
- **A battle discarded while the player had already spent an attempt.** The attempt is refunded — a discard that still consumed it reads as the game stealing.

## Requirements *(mandatory)*

**The loop**

- **FR-001**: A battle MUST be created against a **snapshot** of the defender's squad, unaffected by subsequent edits.
- **FR-002**: The client MUST submit an **intent** identifying the battle, the acting hero, the power and the target — and nothing about the outcome.
- **FR-003**: The server MUST resolve the player's action and **everything following it** up to the player's next real choice, returning one packet.
- **FR-004**: The client MUST render what it is returned and MUST NOT determine any outcome.
- **FR-005**: An intent that is illegal in the current state MUST be refused with a reason, appending nothing.

**The log**

- **FR-006**: Only an **append-only action log** MAY be persisted for an in-progress battle. In-progress state MUST NOT be stored.
- **FR-007**: Current state MUST be re-derived by replaying the log on every request.
- **FR-008**: Submitting an already-applied intent MUST NOT append again and MUST return the original result.
- **FR-009**: Concurrent identical submissions MUST result in exactly one appended entry.
- **FR-010**: Every battle MUST carry its **seed, engine version and content version** alongside its log.

**Ending and settlement**

- **FR-011**: A battle MUST end when one side is eliminated or at the **300 hero-turn** cap.
- **FR-012**: On conclusion the outcome, rating change, streaks and rewards MUST each be applied **exactly once**.
- **FR-013**: An abandoned battle MUST be settled rather than remaining open indefinitely.
- **FR-014**: A concluded battle MUST record its metadata row and its replay event log (feature 08).

**Maintenance**

- **FR-015**: The system MUST honour three states — `live` (accept), `draining` (refuse new, let in-flight finish), `down` (refuse and discard).
- **FR-016**: A discarded battle MUST be a **complete no-op**: no rating change either side, no rewards, and a refund of whatever it cost to start.
- **FR-017**: An engine version mismatch on an in-flight battle MUST be reported rather than resolved.

**Presentation**

- **FR-018**: The client MUST begin its wind-up on the player's click rather than on the server's response.
- **FR-019**: The client MUST NOT block an animation on a network response.
- **FR-020**: Where an optimistic display and the server disagree, the **server's version** MUST be shown.

### Key Entities

- **Battle** — an attacker, a defender snapshot, a zone, a seed, version stamps, and an action log. Concluded battles carry an outcome.
- **Intent** — one player decision: battle, hero, power, target.
- **Action log** — the ordered, append-only record of intents. The only persisted in-progress state, and the sole source of truth.
- **Resolution packet** — one response: the player's action and everything following it up to their next choice.
- **Defender snapshot** — the frozen squad and configuration a battle runs against.

## Success Criteria *(mandatory)*

- **SC-001**: A battle completes in roughly **20–40 requests**, not hundreds.
- **SC-002**: **Zero** in-progress battle state exists outside the action log.
- **SC-003**: Replaying a log always reproduces the same state — **no desynchronization is possible**, because state is the log.
- **SC-004**: A repeated submission **never** advances a battle twice, including under concurrency.
- **SC-005**: A discarded battle leaves rating, rewards and attempt count **exactly as they were**.
- **SC-006**: Every battle terminates.
- **SC-007**: Rewards and rating changes are applied **exactly once** per battle.
- **SC-008**: A player never sees an animation stall waiting for the network on a healthy connection.
- **SC-009**: A defender's mid-battle squad edit **never** affects a battle already in progress.

## Assumptions

- **The player commands offense; the engine runs every defense.** There is nobody on the other side to concede, so there is no surrender or flee.
- **Ambush routing is decided by feature 09**, using the attack streak from feature 06. This feature runs the resulting battle identically either way.
- **Replay cost is roughly linear per action** — a few hundred simulation steps, single-digit milliseconds. **Revisit if battle length grows substantially**; that is the one condition under which no-stored-state stops being correct.
- **Offline play is impossible and accepted.** Asynchronous PvP needs the server regardless. It should be stated on the Steam store page.
- **The maintenance flag itself is owned by feature 16**; this feature honours it.
- **The 300-turn cap constant is provisional**, to be re-derived from measured p99 once feature 08 records turn counts.
- **Concurrent-battle policy** — whether a player may hold several battles open at once — is enforced consistently but its value is a tuning decision, not a structural one.

## Dependencies

**Upstream**: 02 (`sim-rules`), 03 (`sim-resolver`), 04 (`defense-ai`),
06 (`roster-and-squads`), 05 (`auth`).

**Downstream**: 08 (`replays`) records its output; 09 (`matchmaking`) supplies
opponents and consumes rating; 10 (`progression`) consumes rewards; 12
(`profiles`) reads the record.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority, seed boundary | FR-002 – FR-004, FR-006, FR-007. **The client sends intents and renders packets; it decides nothing** |
| **XVI** | Cannot be backfilled | FR-010, FR-014 — version stamps and the metadata row ship with the first battle |
| **XIII** | One rules engine | This feature orchestrates; it computes no rule itself |
| **XIV** | Balance upward | FR-016 — a discard must cost the player nothing, since a patch cannot reach backwards |
