# Tasks: Matchmaking, Leagues & Bots

**Input**: Design documents from `/specs/009-matchmaking/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[contracts/matchmaking-api.md](contracts/matchmaking-api.md) · [quickstart.md](quickstart.md) ·
shared [specs/data-model.md](../data-model.md) § 6 · **features 004, 006, 007 and 008 complete**

**Tests**: **Included.** The 1.67× bound is written as a **property test over the
whole score range**, not as a spot check — it is the promise the entire league
system exists to keep.

**Organization**: Grouped by user story, in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5
- Exact file paths in every task

## Path Conventions

`apps/api/src/matchmaking/`, `apps/api/src/db/schema/`, `content/bots/*.json`.

> **Two axes, and only one of them filters.** **Gear** restricts, via leagues.
> **Rating** orders the pool and can never remove anybody. The **starter league is
> the single carve-out** from *the pool is every defender*, and it is a carve-out
> rather than an exception to the principle.

## Three decisions taken before the first line — 2026-07-29

**1. `gearScore()` is a seam, not a query, until 010 lands.** `spec.md`'s
*Dependencies* names **10 (progression) for rune placement** as upstream, and 009
is built first — there is **no runes table**, so a real query would return `0` for
every account and put the entire population below the Bronze floor. So T005 reads
through one boundary that answers with the **1,500 starter grant** (12 heroes × one
complete rune × 125) until progression can answer it from actually-placed runes.
**Everything else in 009 is real**: leagues, position-in-league, bleed, candidate
selection, bots, the starter league and its four exits.

This costs the feature almost nothing, because **its tests never wanted rune rows
anyway** — T004 and T020 specify a 20,000-account *simulated* population precisely
because league shares and bleed are population questions. The seam is what those
tests already assume. **The one thing 009 cannot prove is that a real placement
moves a real league**; that assertion belongs to 010 and must be written there, not
skipped.

**2. Bots: all 20 of T045, none of the league pools.** `spec.md` US4 wants ~130
across the bands, and a bot's strength is `2.5 × stat points` over hero values that
are **still a Role-shaped template** — the hero-numbers pass has not run, and under
the no-nerf rule it is the one pass that moves numbers freely. Authoring 130 now
means authoring them twice.

So: **the full bot machinery** — storage, league placement, the spread of fixed
ratings, thin-league padding, inactivity eviction — plus **the 20 starter bots T045
already specifies in detail**, because they are a *ramp* whose shape is a teaching
decision rather than a tuning number. The ~110 league bots are a separate authoring
pass after the numbers. **Note honestly in T046 what is deferred**: with 20 starter
bots against ~140 battles in a starter week, the *"same six opponents repeating"*
edge case in `spec.md` is **not yet answered** — the plumbing is proven, the depth
is not.

**3. Straight to `main`, no feature branch**, as with 001–008.

---

## Phase 1: Setup

- [ ] T001 Create `apps/api/src/matchmaking/` and register `/v1/matchmaking` and `/v1/me/standing` in `apps/api/src/index.ts`
- [x] T002 Define `player_ratings` in `apps/api/src/db/schema/ratings.ts` — `rating` starting at 1000, `rated_battles` driving the K band (≤30 → 40, ≤200 → 20, else 10), `attack_streak`, `gear_score`, `last_activity_at`
- [x] T003 [P] Add a `matchmaking` test project to `apps/api/vitest.config.ts`
- [x] T004 **Build the simulated-population harness** in `apps/api/tests/matchmaking/population.ts` — league shares, bleed behaviour and bot sufficiency are all population questions, and reasoning will not settle them

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gear score and its **placement trigger**. Everything else reads it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement `gearScore(accountId)` in `apps/api/src/matchmaking/gearScore.ts` as `2.5 × effective stat points` over every rune **currently placed** (FR-001)
- [x] T006 Implement `recordPlacement(accountId)` in `apps/api/src/matchmaking/gearScore.ts` triggering the recompute **on placement, immediately** — not on request, and never accumulated
- [x] T007 Exclude banked shards from gear score in `apps/api/src/matchmaking/gearScore.ts` (FR-002)

> **Read runes currently on heroes, never lifetime spend.** Ten rebuilds of one
> slot is 6,500 shards for 125 of power, and a cumulative score would rate that
> player **eight leagues** above their strength. The *on placement* timing is what
> makes *hoarding is not a sandbag* true rather than merely asserted.

- [x] T008 Implement `leagueOf(gearScore)` in `apps/api/src/matchmaking/league.ts` on the **fixed thresholds** from the shared model — bronze 1500–2500 · silver 2500–4000 · gold 4000–6200 · platinum 6200–8700 · diamond 8700–10125 (FR-003)
- [x] T009 Implement `positionInLeague(gearScore)` in `apps/api/src/matchmaking/league.ts` as `(score − floor) / (ceiling − floor)`, **against the league's own range and never against the population** (FR-007)
- [x] T010 Generate and apply the ratings migration from `apps/api/drizzle/`

**Checkpoint**: A player's league is derived from their own placements and nothing else

---

## Phase 3: User Story 1 - A player is offered a fair fight (Priority: P1) 🎯 MVP

**Goal**: Opponents whose investment is comparable, ordered so the most interesting surface first.

**Independent Test**: For any player at any score, confirm every offered opponent falls inside the permitted gear bound.

### Tests for User Story 1 ⚠️

- [ ] T011 [US1] Write `apps/api/tests/matchmaking/gearBound.test.ts` as a **property test over the whole score range** — no player is ever offered an opponent above **1.67×** their gear, with zero exceptions (SC-001)
- [ ] T012 [P] [US1] Write `apps/api/tests/matchmaking/candidates.test.ts` — **read the signature**: there is no `excludeIds`, no `minRating`, no `maxAttempts`, no parameter that could exclude anybody (SC-004)
- [ ] T013 [P] [US1] Add the behavioural half to `apps/api/tests/matchmaking/candidates.test.ts` — attack the same defender 20 times in a row and confirm they appear in `candidates` all 20 times. **No slate, no rotation, no cooldown**

> **T012 is the enforcement of *the pool is every defender*.** A rule restricting
> *who* you may attack restricts the playing itself, and the daily income curve
> already bounds what volume pays.

### Implementation for User Story 1

- [ ] T014 [US1] Implement `candidates(accountId)` in `apps/api/src/matchmaking/candidates.ts` — pool assembly, then rating **ORDER**. The signature takes no filter parameter (FR-011)
- [ ] T015 [US1] Implement `GET /v1/matchmaking/candidates` in `apps/api/src/matchmaking/routes.ts` with `league`, `positionInLeague`, `gearScore`, `widened`, the candidate list, `ambushChance` and `consecutiveWins`
- [ ] T016 [US1] Implement `GET /v1/me/standing` in `apps/api/src/matchmaking/routes.ts` — a player sees their own league and score. **An opponent's league is not named** unless the match was widened, because knowing your own already tells you every opponent's band (FR-006)
- [ ] T017 [US1] Implement `ambushChance(accountId)` in `apps/api/src/matchmaking/candidates.ts` — `+2%` per consecutive attack win, capped at **90%**, **always displayed**, reset on a loss
- [ ] T018 [US1] Implement `rollZone(seed, accountId)` in `apps/api/src/matchmaking/candidates.ts` — **the zone is the server's decision** and the field does not exist in any request body (Constitution XII)
- [ ] T019 [US1] Serve every threshold, bleed constant and bot count from the server in `apps/api/src/matchmaking/config.ts` — **tunable without a client release**

**Checkpoint**: The loop that feeds every other loop works, inside its bound.

---

## Phase 4: User Story 2 - Gearing up never takes a league away (Priority: P1)

**Goal**: A player's league changes only when *they* place runes.

**Independent Test**: Hold one player constant, advance the whole population, and confirm their league and matching mix are unchanged.

### Tests for User Story 2 ⚠️

- [ ] T020 [P] [US2] Write `apps/api/tests/matchmaking/fixedThresholds.test.ts` against the population harness — advance 20,000 accounts through gearing and confirm a player who places no runes **never** changes league (SC-002)
- [ ] T021 [P] [US2] Write `apps/api/tests/matchmaking/hoarding.test.ts` — banking 6,500 shards produces **no** matchmaking movement; placing them does, immediately (SC-009)

### Implementation for User Story 2

- [ ] T022 [US2] Confirm no code path in `apps/api/src/matchmaking/league.ts` reads a population quantile — thresholds are fixed values, so score only rises and **a league is never taken away** (FR-003, FR-004)
- [ ] T023 [US2] Verify with the population harness in `apps/api/tests/matchmaking/population.ts` that the simulated league shares match the recorded distribution, with **Diamond at ~31% expected and correct** — roughly a quarter of a mature population sits at the gear cap and those players are genuinely identical

**Checkpoint**: Demotion for a *gear* rating is structurally impossible.

---

## Phase 5: User Story 5 - A new player's first week is survivable (Priority: P1)

**Goal**: Bot-only opponents, dormant defense, ×1.5 income, and all four exits.

**Independent Test**: Create an account and confirm bot-only opponents, dormant defense, boosted income, and all four exits.

> **Sequenced ahead of the P2 stories** because it is P1 and because it is the
> single largest lever on whether a new player reaches their second week.

### Tests for User Story 5 ⚠️

- [ ] T024 [US5] Write `apps/api/tests/matchmaking/starter.test.ts` — every opponent is a bot; the defense is **dormant**; attack income is **×1.5**; and all four exits fire: 7 days, 3,250 shards, voluntary, guild (SC-005, SC-006)
- [ ] T025 [P] [US5] Add the negative case to `apps/api/tests/matchmaking/starter.test.ts` — `POST /v1/me/starter/exit` acknowledging only **one** loss returns `409`. **Both** must be acknowledged
- [ ] T026 [US5] Write `apps/api/tests/matchmaking/starterWarning.test.ts` — **assert on the confirm's constructed payload, not on rendered copy.** Test that the type **forbids** building either confirm without `StarterExitWarning`; a test against a string is a test that a string can be dropped, which is what happened three times
- [ ] T027 [P] [US5] Add the timing case to `apps/api/tests/matchmaking/starterWarning.test.ts` — a player applies and is admitted a day later; confirm the warning appeared **at application time**, because that is when the player was actually present and deciding

### Implementation for User Story 5

- [ ] T028 [US5] Implement `starterStatus(accountId)` in `apps/api/src/matchmaking/starterLeague.ts` returning `{ active, endsAt }` or `{ active: false, reason }` (FR-019)
- [ ] T029 [US5] Offer **bot opponents only** to a starter player in `apps/api/src/matchmaking/candidates.ts`, and make their defense **dormant** so nobody attacks them (FR-020)
- [ ] T030 [US5] Apply the **×1.5** attack-income multiplier in `apps/api/src/matchmaking/starterLeague.ts` (FR-021)
- [ ] T031 [US5] Implement exits 1 and 3 in `apps/api/src/matchmaking/starterLeague.ts` — **7 days** from account creation, and `POST /v1/me/starter/exit` requiring **both** acknowledgements and being **permanent** (FR-022)
- [ ] T032 [US5] Accept the shards signal from feature 010 for exit 2 in `apps/api/src/matchmaking/starterLeague.ts` — **3,250 shards earned**, five full runes
- [ ] T033 [US5] Define `StarterExitWarning` in `apps/api/src/matchmaking/starterLeague.ts` as a **required field of the confirm's type**, carrying `endsBotOpponents`, `endsIncomeMultiplier` and `permanent` — so feature 013 **cannot construct either confirm without it** (FR-023)
- [ ] T034 [US5] Expose `starterExitWarning(accountId)` from `apps/api/src/matchmaking/starterLeague.ts` for feature 013 to call **before rendering either door**, refusing to render an un-warned confirm
- [ ] T035 [US5] Enforce *no member of a guild is ever in the starter league* in `apps/api/src/matchmaking/starterLeague.ts` — **one rule, two doors**, and leaving the guild later does **not** send them back (FR-024)

> **The two failure modes the warning has already suffered:** naming only one loss
> (beginner *status* and the beginner *bonus* are two different things and both
> end), and warning on **acceptance** rather than on the **application** — a player
> who applies and is admitted a day later is graduated by someone else's click.

> **Do not oversell the ×1.5 in the copy.** The multiplier mostly replaces dormant
> hold income, which is 26% of a typical day. **Only ~11% is actual help.** A
> warning reading as "you're losing a 50% head start" misprices it.

**Checkpoint**: A new account's first week is survivable and every graduation is deliberate.

---

## Phase 6: User Story 3 - League boundaries are a ramp, not a wall (Priority: P2)

**Goal**: Promotion is a gradient, not a step change.

**Independent Test**: Sweep a player's score across a league and confirm the opponent mix changes continuously.

### Tests for User Story 3 ⚠️

- [ ] T036 [US3] Write `apps/api/tests/matchmaking/bleed.test.ts` — the continuity sweep from the quickstart: 2400 → ~50% Silver, 2500 → 50% Silver, **2501 → 50% Bronze**, 2600 → ~50% Bronze, 3000 → 100% Silver. **The crossing is the assertion** (SC-003)
- [ ] T037 [P] [US3] Add the end cases to `apps/api/tests/matchmaking/bleed.test.ts` — **Bronze bleeds up only and Diamond bleeds down only**

> **Leagues bleed at *both* edges precisely because the upward ramp alone left a
> sawtooth**: a player at the top of Bronze faced 52.5% win odds, crossed the line,
> and faced 52.5% again as the *bottom* of Silver.

### Implementation for User Story 3

- [ ] T038 [US3] Implement the two ramps in `apps/api/src/matchmaking/bleed.ts` — above 90% position the chance of drawing from above ramps to **50%** at the ceiling; below 10% the chance of drawing from below ramps to **50%** at the floor; **10%–90% is pure league** (FR-008, FR-009)
- [ ] T039 [US3] Keep `bleed.ts` separate from `candidates.ts` — the ramp is a pure function of position and is **the piece most likely to need retuning**, so isolating it keeps the tuning surface small
- [ ] T040 [US3] Implement one-directional bleed for the end leagues in `apps/api/src/matchmaking/bleed.ts` (FR-010)

**Checkpoint**: The difficulty curve is continuous at every boundary.

---

## Phase 7: User Story 4 - A thin league still gives a real fight (Priority: P2)

**Goal**: Bots keep thin leagues viable without breaking the gear bound.

**Independent Test**: Reduce a league's live population to near zero and confirm matching still works within the bound.

### Tests for User Story 4 ⚠️

- [ ] T041 [P] [US4] Write `apps/api/tests/matchmaking/bots.test.ts` — the starter pool is **100% bots with ≥20 distinct**; Bronze holds ~20% of the bot population; **Diamond has no generated bots**, only hand-seeded ones
- [ ] T042 [P] [US4] Add the shape check to `apps/api/tests/matchmaking/bots.test.ts` — **starter bots carry a spread of ratings, not one value**. Fight all 20 as a provisional player and confirm you can lose to a strong one and beat a weak one **inside the same league**
- [ ] T043 [P] [US4] Write `apps/api/tests/matchmaking/inactivity.test.ts` — idle 29 days is in the pool, idle 31 days is not, one battle or one squad edit re-enters **immediately with no job run**, and a **bare login does not**

### Implementation for User Story 4

- [ ] T044 [US4] Implement bot distribution in `apps/api/src/matchmaking/bots.ts` — **30%** starter and **20/20/20/10** across Bronze, Silver, Gold and Platinum, with Diamond **hand-seeded and counted separately** (FR-015, FR-016)
- [ ] T045 [US4] Author the **Visible** squads of **20 starter bot defenders** in `content/bots/starter/*.json`, structured as a ramp — bots 1–5 with one glaring exploitable Bane, a mono-type squad and no rune fill; 6–12 with two types and partial fill; **13–20 with mixed types, full fill and no free answer**, setting the graduation standard
- [ ] T046 [US4] Author the **Hidden** squad of each starter bot **one band up its own ramp** — bot 3's Hidden is built to the 6–12 standard, bot 10's to the 13–20 standard, and 13–20's Hidden squads answer the very type their own Visible squad invites you to bring. A farmer who solved the Visible squad walks into the squad built to punish that solution, which is the ambush tax doing its designed job
- [ ] T047 [US4] Author the padding bots for Bronze, Silver, Gold and Platinum in `content/bots/` at the derived floor — 13 · 13 · 13 · 7 — **each carrying both squads**, a full defense record using **the same configuration model as players**, which is 12 heroes across two zones (FR-018)
- [ ] T048 [US4] Spread bot ratings across a band in `apps/api/src/matchmaking/bots.ts` rather than pegging to a midpoint — one anchor calibrates a single point; a spread calibrates the band (FR-017)
- [ ] T049 [US4] Implement the inactivity test as `AND last_activity_at >= now() - interval '30 days'` **in the candidate query**, never in a nightly job — a job would leave a returning player invisible until it next ran (FR-012)
- [ ] T050 [US4] Define activity as **an attack battle or a defense-squad edit**, never a bare login, in `apps/api/src/matchmaking/candidates.ts` — otherwise an absent account keeps collecting hold income by opening the game and doing nothing
- [ ] T051 [US4] **Add no rule zeroing an idle account's hold income.** Leaving the pool is its own enforcement: nobody can attack a defense nobody is offered, and a second mechanism is a second thing to keep in step
- [ ] T052 [US4] **Pad with bots first; widen only if that is not enough**, in `apps/api/src/matchmaking/candidates.ts` — a bot inside the band keeps matching in-band, while widening reaches outside it and breaks the guarantee, up to **2.67×** for a player at a league floor. Widening is **per request and never persists**
- [ ] T053 [US4] Surface `widened: true` to the player in `apps/api/src/matchmaking/routes.ts`, because **the 1.67× guarantee does not hold on a widened match**

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T054 **Instrument `widenRate` from day one** in `apps/api/src/matchmaking/candidates.ts` — widened requests over total, **by league**. Bronze is where inactive accounts thin hardest and where widening breaks the bound; **a Bronze widen rate above a few percent means the bot allocation was too small**
- [ ] T055 Confirm every battle record carries `defender_is_bot`, `attacker_league`, `defender_league` and both ratings — feature 008 owns the columns; this task asserts this feature populates them (FR-013, SC-008)
- [ ] T056 [P] Write `apps/api/src/matchmaking/README.md` — the two axes, the carve-out, and the standing note that the bot total is a launch-tuning number with a derived floor
- [ ] T057 Run the full quickstart manual pass, including the `rg` check that no `zeroHoldIncome`-style rule exists

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: needs features 006, 007, 008
- **Foundational (Phase 2)**: depends on Setup — **blocks all five stories**
- **US1 (Phase 3)**: Foundational only
- **US2 (Phase 4)**: needs the population harness (T004)
- **US5 (Phase 5)**: needs `candidates` (T014) and coordinates with feature 013
- **US3 (Phase 6)**: needs `positionInLeague` (T009)
- **US4 (Phase 7)**: needs `candidates` (T014) and feature 004's configuration model
- **Polish (Phase 8)**: depends on US1 and US4

### User Story Dependencies

- **US1 (P1)**: none
- **US2 (P1)**: none — it is a *property* of US1's league code, verified separately
- **US5 (P1)**: US1, plus a **cross-feature integration point with 013**
- **US3 (P2)**: none beyond Phase 2
- **US4 (P2)**: US1

### Within Each User Story

- Tests written and **failing** before implementation
- **Gear score and its placement trigger first** — everything reads it
- The population harness before any share, bleed or sufficiency claim

### Parallel Opportunities

- **US3's bleed work is fully parallel with US4's bot authoring** — different files, and the bot authoring is a content task
- T012, T013 in parallel · T020, T021 in parallel
- T041, T042, T043 in parallel
- T045, T046 and T047 are content authoring and can run alongside all of Phase 6

---

## Parallel Example: User Story 4

```bash
# Three independent test files, all red first:
Task: "bots.test.ts — distribution, and Diamond hand-seeded only"
Task: "bots.test.ts shape — a spread of ratings, not a midpoint"
Task: "inactivity.test.ts — 30 days in the query, bare login is not activity"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US5)

All three are P1. Together they are: **a fair fight, a league that cannot be taken
away, and a survivable first week.** Stop after Phase 5 and validate — the 1.67×
property test passes across the whole score range, and all four starter exits fire
with both warnings intact.

1. Phase 1–2: gear score, **recomputed on placement**
2. Phase 3: US1 — **STOP and VALIDATE** the 1.67× property test
3. Phase 4: US2 — the population harness
4. Phase 5: US5 — **coordinate the warning with feature 013 explicitly**
5. Phase 6–7: bleed, then bots

### Incremental Delivery

**The bot authoring (T045, T046, T047) is the long pole and it is content, not
code.** Sixty-odd defense *records* is **~130 squads**, because a bot carries a
Visible and a Hidden one exactly as a player does — six heroes, seats, two
targeting rules and a six-power ranking per champion, plus rune fill, each. Start
it early and run it alongside everything else. **This is the single largest
authoring job in the project.**

---

## Notes

- **The absolute bot count is a launch-tuning number with a derived floor.**
  ~20 starter bots implies ~65–70 in total; the real number wants a real population.
  **Bronze at 13 is thin and is the known weak point** — T054's widen rate is what
  says whether it was enough.
- **Bots carry Hidden squads — settled 2026-07-28, and `09-matchmaking.md` had
  already said so.** Its *Curated bot defenders* section defines a bot as *"a gear
  score, a Visible squad, a Hidden squad, and a `07-defense-ai.md` configuration —
  precisely what a player's defense record is, minus the account."* The Phase 0 pass
  raised it as open because it read `07-defense-ai.md`, which covers defenders only.
  **The half that was genuinely undecided is which squad is harder**, and T046
  settles it: **Hidden is**. The ambush counter is the recorded answer to opponent
  farming and equal squads would redirect a farm rather than tax it.
- **Convergent rating makes honest play worth exactly zero in expectation**, so any
  reliable win source strictly dominates it. `defender_is_bot`, `attacker_rating`
  and `zone` together answer *"how much rating is being gained against bots, by
  whom, in which zone"* in one query — **all three already mandatory, no new field
  needed.**
- **Curated bots are the additive balance lever the rest of the design lacks** —
  they move the meta without touching a number, which matters most under the no-nerf
  rule.
- Commit after each task or logical group; work goes straight to `main`.
