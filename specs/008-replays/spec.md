# Feature Specification: Replays & the Battle Record

**Feature Branch**: `008-replays` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 08 of the LMNTLZ 1.0 set (`specs/README.md`). What a finished battle leaves behind — a permanent record, and a watchable replay that expires.

---

## Two objects, deliberately separated

> **The battle *record* is permanent. The battle *replay* expires after 7 days.**

They have different lifetimes, different sizes and different jobs, and merging
them costs roughly 23× more storage while making the database slower.

| | What it is | Size | Kept |
|---|---|---|---|
| **Record** | who fought, when, which zone, outcome, rating change, shards — **and the fields the balance pass needs** | ~200 B | **forever** |
| **Replay** | the event log you watch | ~5 KB | **7 days** |

**Nothing breaks when a replay expires.** The outcome, the rating change and the
streak all live in the permanent record. *"Replays are never re-simulated"* is a
guarantee about **never recomputing a past result** — and the result is exactly the
part kept forever. Only *watching* has a shelf life.

### This feature carries the constraint that cannot be retrofitted

LMNTLZ runs **no analytics vendor**. Every testable commitment in the design —
zone balance, hold rates, battle length, league thresholds, hero pick rates — is a
question about battles, answered by querying these records.

> **So the record *is* the analytics product**, and a field missing from the first
> battle ever written is missing from the history the first balance pass reads.
> Under the no-nerf rule, that pass is the one that matters most.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The record carries what balance will need (Priority: P1)

Months later, someone asks whether Hidden squads really hold better than Visible
ones, how long a battle actually runs, and which heroes are over-picked. Every
answer is a query.

**Why this priority**: Constitution XVI. This is the only requirement in the whole
feature set that is *impossible* rather than merely expensive to add later.

**Independent Test**: Write a battle record and confirm every field below is
present. Then answer each design commitment from records alone.

**Acceptance Scenarios**:

1. **Given** a concluded battle, **When** its record is written, **Then** it carries participants, date, **zone**, outcome, rating change and shards awarded.
2. **Given** the same record, **When** examined, **Then** it also carries **turn count**, **squad composition for both sides**, **whether the defender was a bot**, and **league and rating at the time**.
3. **Given** the same record, **When** examined, **Then** it carries **`engineVersion` and `contentVersion` as two separate stamps**, never merged.
4. **Given** a body of records, **When** queried, **Then** Visible and Hidden hold rates are directly comparable.
5. **Given** a body of records, **When** queried, **Then** bot defenders can be **excluded** — otherwise every aggregate is polluted by our own authored loadouts, which are not player choices.

---

### User Story 2 - A player watches a recent battle (Priority: P1)

A player opens their battle list, picks a fight from yesterday, and watches it
play out exactly as it happened.

**Why this priority**: The player-facing half. It is also where the immutability
guarantee is either kept or quietly broken.

**Independent Test**: Watch a battle recorded before a balance change and confirm
it plays identically afterwards.

**Acceptance Scenarios**:

1. **Given** a concluded battle, **When** its replay is stored, **Then** it is the **recorded packets**, not a seed to re-run.
2. **Given** a replay recorded before a balance patch, **When** watched afterwards, **Then** it plays **exactly as it originally played**.
3. **Given** a player's battle list, **When** shown, **Then** it holds their most recent **50** battles.
4. **Given** an entry whose replay has expired, **When** the player opens it, **Then** they are **told it has expired** rather than seeing a failure.
5. **Given** any replay, **When** it is played, **Then** no simulation runs.

---

### User Story 3 - Storage stops growing with time (Priority: P2)

The bill tracks how many people play, not how long the game has been running.

**Why this priority**: Without expiry this is an unbounded cost — 3.65 TB a year
at 100k daily players, and nothing in the design ever deletes one.

**Independent Test**: Run past the retention window and confirm steady-state
storage is 7× the daily rate rather than an accumulating pile.

**Acceptance Scenarios**:

1. **Given** a replay older than **7 days**, **When** cleanup runs, **Then** it is deleted.
2. **Given** cleanup, **When** it selects what to delete, **Then** it is driven by a **query over the permanent records**, never by listing stored files.
3. **Given** a deleted replay, **When** its record is read, **Then** the record is intact and complete.
4. **Given** cleanup that has silently stopped, **When** monitoring runs, **Then** the alarm is on **expired-but-undeleted records**, not on the job reporting success.

---

### User Story 4 - A reported battle outlives the window (Priority: P2)

A cheating report arrives on day 3 and is still under appeal on day 12. The
evidence is still there.

**Why this priority**: Seven days is shorter than a dispute. This single rule is
what removes the only real objection to a short window — without it, retention
would be set by the slowest appeal rather than by what players actually watch.

**Independent Test**: Attach a report to a battle, pass the window, confirm the
replay survives; close the report, confirm it is released.

**Acceptance Scenarios**:

1. **Given** a battle attached to an open report, **When** the window passes, **Then** its replay is **retained**.
2. **Given** a report that is closed, **When** the stated grace period passes, **Then** the replay becomes eligible for deletion.
3. **Given** a report filed after a replay has already expired, **When** it is reviewed, **Then** the permanent record is still available even though the replay is not.

---

### Edge Cases

- **A record and its replay disagreeing.** Impossible by construction — the record is written from the same conclusion, and the replay is never re-derived.
- **A replay for a battle that was discarded during maintenance.** A discarded battle is a complete no-op, so it produces neither a record nor a replay.
- **A player's list showing 50 entries when only a few are watchable.** At ~20 battles a day the 50-entry list is ~2.5 days deep, inside the 7-day window — so in normal play nearly every visible entry is watchable and expiry is the exception.
- **Squad composition stored but not exported.** Recording it and exposing it are separate decisions: the record carries both squads; **CSV export carries neither** (feature 12).
- **A Hidden squad appearing in a replay.** A fought Hidden squad is visible inside that battle and its replay, and nowhere else — never in an embed, never on a profile.
- **Cleanup interrupted partway.** Must be resumable and re-runnable without side effects, which is why it is driven by a query rather than a file listing.

## Requirements *(mandatory)*

**The permanent record**

- **FR-001**: Every concluded battle MUST write a record that is retained indefinitely.
- **FR-002**: The record MUST carry participants, date, zone, outcome, rating change and shards awarded.
- **FR-003**: The record MUST carry **turn count**.
- **FR-004**: The record MUST carry **squad composition for both sides**.
- **FR-005**: The record MUST carry **whether the defender was a bot**.
- **FR-006**: The record MUST carry **league and rating at the time of the battle**.
- **FR-007**: The record MUST carry **`engineVersion` and `contentVersion` as two distinct stamps**, plus the build identifier.
- **FR-008**: FR-003 through FR-007 MUST be present from the **first battle ever recorded**. They cannot be backfilled.

**The replay**

- **FR-009**: A replay MUST be stored as the **recorded event packets**, never as a seed to be re-simulated.
- **FR-010**: A replay MUST play back exactly as originally produced, regardless of subsequent balance changes.
- **FR-011**: Replays MUST expire **7 days** after the battle.
- **FR-012**: A player's battle list MUST show their most recent **50** battles.
- **FR-013**: An entry whose replay has expired MUST say so rather than failing to open.

**Retention and cleanup**

- **FR-014**: Cleanup MUST be driven by a query over permanent records — battles past the window, not attached to an open report, replay not yet deleted — and MUST NOT be driven by listing stored files.
- **FR-015**: Cleanup MUST be resumable after partial failure and safe to re-run.
- **FR-016**: A battle attached to an open report MUST be retained past the window, and for a stated period after the report closes.
- **FR-017**: Monitoring MUST alarm on the **count of expired-but-undeleted records**, not on the cleanup job reporting success.
- **FR-018**: Deleting a replay MUST NOT alter its record.

### Key Entities

- **Battle record** — the permanent row. Participants, date, zone, outcome, rating change, shards, turn count, both squads, bot flag, league and rating at the time, and two version stamps.
- **Replay** — the stored event packets for one battle. Written once, read rarely, never queried. Expires.
- **Retention hold** — the association between a battle and an open report that keeps its replay alive past the window.

## Success Criteria *(mandatory)*

- **SC-001**: Every design commitment — zone balance, hold rates, battle length, league thresholds, hero pick rates — is answerable **from records alone**, with no vendor and no instrumentation beyond the record.
- **SC-002**: Bot-defended battles can be **excluded from every aggregate**.
- **SC-003**: A replay recorded before a balance change plays **identically** after it.
- **SC-004**: **Zero** replays are produced by simulation.
- **SC-005**: Steady-state replay storage is **7× the daily rate**, not an accumulating total — roughly 7 GB at 10k daily players and 70 GB at 100k.
- **SC-006**: A replay's expiry changes **nothing** a player can see about the battle's result.
- **SC-007**: A battle under an open report is **never** deleted.
- **SC-008**: A silently failing cleanup job is detected by the expired-but-undeleted count.
- **SC-009**: Cleanup interrupted at any point can be re-run with **no side effects**.

## Assumptions

- **Volume is roughly daily-players × 20 battles**, at ~5 KB compressed per replay. Unbounded retention would be 365 GB a year at 10k daily players and 3.65 TB at 100k.
- **Retention dominates the storage tier.** At 7 days the volume is small enough that the split between permanent records and expiring replays is about **keeping the database small and fast**, not about saving money.
- **The record is the analytics product**, because no analytics vendor exists. The four fields in FR-003 – FR-006 are what make the design's own commitments testable.
- **Storing is not exposing.** The record carries both squads; CSV export carries neither, and no embed may ever show a Hidden defense. Those are feature 12 and 14's rules, and they are not weakened by what is recorded here.
- **A fought Hidden squad is visible in that battle and its replay only.** It does not become visible anywhere else.
- **The cleanup schedule is owned by feature 16**; this feature defines what it selects and how it is verified.
- **If the storage provider offers lifecycle expiry, the cleanup job disappears** and FR-014's query becomes the verification rather than the mechanism. Worth checking before building.

## Dependencies

**Upstream**: 07 (`battle`) produces everything here; 09 (`matchmaking`) supplies
league and rating; 06 (`roster-and-squads`) supplies zone and composition.

**Downstream**: 12 (`profiles`) reads records; 15 (`moderation`) places retention
holds; 16 (`ops-admin`) schedules cleanup. **The balance pass depends on this
feature entirely.**

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XVI** | Cannot be backfilled | **The whole feature.** FR-003 – FR-008 are the canonical instance in the set |
| **XVII** | Storing is not exposing | Both squads are recorded; neither is exported. The two rules coexist deliberately |
| **XIV** | Balance upward | FR-010 — a patch cannot reach backwards, which is why replays are recorded rather than re-simulated |
| **XII** | Server authority | A replay is a record of what the server decided, never a client's account of it |
