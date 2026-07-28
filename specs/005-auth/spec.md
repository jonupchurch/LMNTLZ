# Feature Specification: Identity & Authentication

**Feature Branch**: `005-auth` *(no branch — straight to `main`)*

**Created**: 2026-07-28

**Status**: Draft

**Input**: Feature 05 of the LMNTLZ 1.0 set (`specs/README.md`). Accounts, sign-in, and the identity every other feature hangs off. Google at 1.0; the Steam seam built and dormant.

---

## The shape

> **The username is the identity. Google and Steam are both just ways to reach
> it.**

**There are no passwords.** Both providers hand over a verified identity, so
hashing, reset flows and email verification — most of what makes authentication
dangerous to build — are simply absent. What is genuinely owned is token issuance,
rotation, revocation and account linking.

**Nothing else in the game reads a provider.** Leagues, rating, guilds, hold
streaks and the rune ledger all hang off the account, so where a session came from
is an authentication detail and never a gameplay one.

### The one decision that touches every table

> **"Username is the primary key" means the *user-facing identity*, not the
> database key.**

| | Column | Property |
|---|---|---|
| **Internal** | immutable identifier | what every reference points at |
| **User-facing** | username, uniquely indexed | what players see, type and search |

A mutable string as the real key means every reference in the system — battles,
replays, runes, guild membership, chat messages — carries a value that changes
when someone renames. **Moderation makes this required rather than merely wise:**
forced rename is a moderation action, so renames are not hypothetical. With an
internal identifier a forced rename is one column; without one it rewrites the
whole schema.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A player signs in and is themselves (Priority: P1)

A player signs in with Google and reaches their account — their heroes, their
rating, their guild, their runes.

**Why this priority**: Nothing else in the game is reachable without it.

**Independent Test**: Sign in, confirm the account resolves, sign out, sign in
again, confirm the same account.

**Acceptance Scenarios**:

1. **Given** a valid Google identity token, **When** presented, **Then** it is verified against Google's published keys and the matching account is resolved.
2. **Given** a first-time sign-in, **When** verified, **Then** an account is created and the player chooses a username.
3. **Given** a successful sign-in, **When** it completes, **Then** the player receives a token issued **by us**, not the provider's.
4. **Given** an invalid, expired or tampered provider token, **When** presented, **Then** sign-in is refused and no account is created or modified.
5. **Given** a signed-in player, **When** their session token expires, **Then** it can be renewed without signing in again.

---

### User Story 2 - One player, two doors, one account (Priority: P1)

A player who bought the game in a browser later signs in through Steam and finds
everything exactly where they left it — same rating, same runes, same guild, same
purchases.

**Why this priority**: Equal-first *as a seam*, even though Steam does not ship at
1.0. Retrofitting account linking after accounts exist means migrating live
players; building the seam now costs almost nothing.

**Independent Test**: Link a second provider to an existing account and confirm
one account results, not two.

**Acceptance Scenarios**:

1. **Given** an account with one provider linked, **When** a second is linked, **Then** both reach the same account.
2. **Given** a player signed in through either provider, **When** any part of the game reads their identity, **Then** it sees the account and **cannot tell which provider was used**.
3. **Given** a provider identity already linked to a different account, **When** linking is attempted, **Then** it is refused with a clear reason rather than merging or duplicating.
4. **Given** the browser build, **When** it is packaged, **Then** it contains no Steam integration code at all.

---

### User Story 3 - A renamed player breaks nothing (Priority: P2)

A player is renamed — by choice or by moderation — and every battle, replay, rune,
guild membership and chat message they are attached to remains intact.

**Why this priority**: Cheap now, extremely expensive later, and forced rename is
a moderation action that *will* be used.

**Independent Test**: Rename an account with history attached and confirm nothing
is orphaned.

**Acceptance Scenarios**:

1. **Given** an account, **When** it is renamed, **Then** every reference to it survives unchanged.
2. **Given** a renamed account, **When** searched by its new username, **Then** it is found; by its old one, it is not.
3. **Given** a forced rename, **When** applied, **Then** it costs the player nothing.
4. **Given** a voluntary rename, **When** requested, **Then** it costs **325 shards**.
5. **Given** a username already taken, **When** requested, **Then** it is refused.

---

### User Story 4 - A stolen client learns nothing useful (Priority: P2)

Someone extracts everything from the game's files and finds no key that lets them
act as another player or reach anything they were not issued.

**Why this priority**: A packaged client is not a secret. This is a standing
property rather than a feature, and it is cheapest to hold from the start.

**Independent Test**: Inspect a full client build for credentials. There are none.

**Acceptance Scenarios**:

1. **Given** a client build, **When** fully extracted, **Then** it contains no key, credential or shared secret.
2. **Given** a signed-in player, **When** the client makes a request, **Then** it authenticates with a **per-user token issued at sign-in**.
3. **Given** a token belonging to another player, **When** presented, **Then** it grants only that player's access, never elevated access.
4. **Given** an account that has been suspended, **When** it presents a previously valid token, **Then** access is refused.

---

### Edge Cases

- **Two accounts, and the player wants them merged.** Not supported at 1.0; linking joins a provider to an account, it never merges two accounts with separate histories.
- **A provider identity is reused by the provider** for a different person. Refused — a provider identity maps to at most one account.
- **A player unlinks their only provider.** Refused; an account must retain at least one way in.
- **A username that is offensive.** Handled by moderation as a forced rename (feature 15), which is why FR-003 exists.
- **A renewal token that has been stolen.** Renewal tokens must be revocable, and revoking one must end the session.
- **Sign-in during maintenance.** Governed by the maintenance flag (feature 16).
- **A Steam session ticket at 1.0.** Nothing accepts one; the seam exists but no path is live.

## Requirements *(mandatory)*

**Identity model**

- **FR-001**: Every account MUST carry an **immutable internal identifier**, and every reference elsewhere in the system MUST point at that identifier rather than at the username.
- **FR-002**: Every account MUST carry a **unique username** that players see, type and search.
- **FR-003**: Renaming an account MUST NOT require updating any reference to it.
- **FR-004**: A voluntary rename MUST cost **325 shards**; a forced rename MUST be free.
- **FR-005**: No part of the game outside authentication MAY read which provider a session came from.

**Providers**

- **FR-006**: Google identity tokens MUST be verified against Google's published keys using a vetted verification library — never hand-written cryptography.
- **FR-007**: One account MUST be able to carry **both** provider identities.
- **FR-008**: A provider identity MUST map to at most one account; a conflicting link MUST be refused with a clear reason.
- **FR-009**: An account MUST always retain at least one linked provider.
- **FR-010**: The Steam verification path MUST be designed and left unimplemented at 1.0, and Steam integration code MUST NOT be present in the browser build.

**Sessions**

- **FR-011**: The system MUST issue **its own** session tokens; a provider's token MUST NOT be used as a session credential.
- **FR-012**: A session MUST be renewable without re-presenting a provider identity.
- **FR-013**: Renewal credentials MUST be stored server-side and MUST be individually revocable.
- **FR-014**: Revoking a session MUST take effect for subsequent requests.
- **FR-015**: A suspended account MUST be refused even when presenting a previously valid token.

**Client secrecy**

- **FR-016**: No key, credential or shared secret MAY appear in any client build.
- **FR-017**: A client MUST authenticate solely with a per-user token issued at sign-in.
- **FR-018**: Authorization MUST be decided server-side; client-supplied claims about identity or permission MUST NOT be trusted.

### Key Entities

- **Account** — a player. Carries an immutable identifier, a username, linked provider identities, and status such as suspension. Everything else in the game references it.
- **Provider link** — the association between an external identity and an account. At most one account per provider identity.
- **Session** — a player's authenticated presence, represented by a token we issue.
- **Renewal credential** — the server-side record permitting a session to be extended, revocable individually.

## Success Criteria *(mandatory)*

- **SC-001**: A player can sign in and reach their account with **no password anywhere in the system**.
- **SC-002**: A player using both providers arrives at **one account, 100% of the time**.
- **SC-003**: **Zero** features outside authentication can determine which provider a session used.
- **SC-004**: Renaming an account leaves **zero** orphaned references.
- **SC-005**: A full client build contains **zero** credentials or shared secrets.
- **SC-006**: A revoked session is refused on its next request.
- **SC-007**: The browser build contains **no** Steam integration code.
- **SC-008**: Adding the Steam provider later requires **no change to any feature outside this one**.

## Assumptions

- **Steam is a fast-follow.** 1.0 ships Google only. What 1.0 must get right is the **seam**, not the integration — Steam auth has never been prototyped end to end and is a spike to schedule.
- **Steam is not an OAuth flow.** The desktop client obtains a session ticket locally and posts it for verification; no authentication vendor has a slot for that, which is one of three reasons authentication is owned rather than bought.
- **Per-user pricing scales badly for games** — vendors price for high-value SaaS users, so the bill grows with exactly the success we want. Recorded so the decision is not revisited on convenience grounds.
- **No hand-written cryptography.** Provider tokens are verified with vetted libraries; our own tokens are issued with a standard one. What is owned is rotation, revocation and linking.
- **Account merging is out of scope**, distinct from account linking.
- **Suspension and forced rename are moderation actions** owned by feature 15; this feature provides the account state and rename mechanism they act on.
- **Entitlements are account-level**, but purchasing belongs to feature 11.

## Dependencies

**Upstream**: none within the feature set.

**Downstream**: every feature that has a player. Features 10 (`progression`),
11 (`payments`), 12 (`profiles`), 13 (`guilds`) and 15 (`moderation`) all depend
on the identity model, and FR-001 in particular.

## Constitution Notes

| # | Constraint | Bearing |
|---|---|---|
| **XII** | Server authority | FR-016 – FR-018: nothing in the client is secret; authorization is server-side |
| **XIX** | Vendors behind interfaces | FR-005, FR-010, SC-008 — provider-agnostic identity is what keeps Steam cheap |
| **XVI** | Cannot be backfilled | FR-001 is the archetype: it touches every table at once and is very expensive to retrofit |
| **XVII** | Storing is not exposing | A provider identity is stored; it is never exposed to another player |
