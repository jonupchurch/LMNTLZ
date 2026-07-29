# Changelog

Dated log of **decisions that change the game or the build**, newest first.

**`packages/sim` now exists**, so this is a log of code and feature changes as
well as design ones — the things a future contributor would be surprised by and
could not reconstruct from the diff. Routine process and setup work stays out of
it (see `STATUS.md` and the commit history).

Versioned release notes start when Steam builds do.

---

## 2026-07-28 — The defense AI is built, and `legalTargets` does not apply a taunt

### Fixed

- **`decideAction` was silently dropping every taunt in the game.** It read
  `legalTargets(...).candidates` and ignored `compelled`. Feature 002's
  `legalTargets` **reports** a compulsion rather than applying it — it returns
  `compelled` alongside the *full* candidate set — so the targeting preference
  was sorting everybody and the taunt had nothing to point at.

  Caught by `taunt.test.ts`, which drives the whole decision rather than only the
  sorter. Narrowing to `[compelled]` before the sort is also what makes *"a taunt
  beats a priority"* structural rather than a rule anybody wrote: by the time any
  preference runs, there is one champion left to prefer.

  **The API is not wrong** — separating the report from the application is what
  lets the cancel-against-a-filter case fall out instead of being special-cased.
  What was missing was a caller that used both halves, and the resolver's
  documented pipeline order now names the caller's obligation explicitly.

### Corrected

- **The 12 safe orderings are *not* "the intersection of safe at both horizons" —
  it is 11.** `4·3·2·1·5·0`, the published Tank default, is 60-turn safe and loses
  tier 5 at nine turns on the fast `0·1·2·3·4·6` ladder. **This is not a fault**:
  that ladder belongs to Cirrolan, Lucen, Umbriel and Silka Pinquick, and none of
  them is a Tank. But it means *universally safe at 9 turns* is the wrong
  tripwire, so the sweep now **reports** it rather than failing on it, and the
  check that gates the defaults is the scoped one — each default against its own
  role's heroes. All four pass.
- **The Striker default silences tier 0 on 7 of 12 heroes, not 8.** The five with
  the slower ladders fire it once each. The row's actual claim is unaffected.

Both were in `specs/004-defense-ai/research.md`, and both are the **same shape**
as the two defects already logged this week: a consequence reasoned out correctly
for the common case and then written one step wider than it holds. That is now
four instances. The habit that catches them is to find the domain a claim holds
over, assert *that*, and write the domain into the test.

### The horizon, which changes what a player is told

**`firingProfile` defaults to 9 turns, not 60.** A hero takes about 8.5 turns in a
real 6v6; the 60-turn figure in `07-defense-ai.md` is a measurement artifact and
roughly seven times a battle. A 60-turn profile tells a player their auto-attack
fires 5% of the time when in their actual battles it never fires at all — a
warning that is wrong in the direction of false reassurance.

At 9 turns **no** ordering keeps all six powers live, because tier 0 is
structurally last and a battle is too short for the top five to be simultaneously
on cooldown. Excluding the auto-attack, **32 of 720** keep tiers 1–5 live on all
27. The 12 remain the right default *pool*; the "3% of orderings keep a whole kit
working" figure is a 60-turn statement and should not be quoted about a battle.

### Deviations from the written contract

- **`chooseTarget` takes a `powerId` the contract omits**, and it cannot not:
  tiebreak 3 is *best type matchup* and `least-mitigation` asks which wall
  answers — both are questions about the power, and the contract's own text says
  power preference resolves first precisely so the answer is available.
- **`firingProfile` lives in `rules`, not `ai`** — as the contract intends, but
  worth restating: it is arithmetic, and the squad builder needs it on every drag
  of a ranking widget. It uses the engine's own `isPowerAvailable` and
  `tickCooldowns`, both lifted out of `phases.ts`, so SC-003's agreement holds by
  construction rather than by two implementations staying in step.

### Still true, and it is the standing instruction

**Re-run `pnpm sweep:orderings` before the hero-numbers pass locks.** A one-point
*reduction* in the tier-4/5 cooldown ladder takes the safe set from 12 to **zero**.
Re-pick every default from whatever it returns; do not assume these four survived.

Recorded in `packages/sim/ai/README.md`.

---

## 2026-07-28 — "No tier-4 or tier-5 power is ever resisted" is false

### Fixed

- **The claim is wrong, and the roster proves it.** `CLAUDE.md` and
  `03-powers.md` both state it as a settled consequence. Measured across all 54
  tier-4/5 powers against all 27 heroes, there are **24 resisted cases**.
- **The true claim, now locked by a test:** a tier-4/5 power is never *strongly*
  resisted. It never resolves to ×0.50.

### The part worth explaining

A tier-4/5 power is dual-typed with the attacker's **own** two types, and a
dual-typed power takes the better of them. So it is resisted only when the
defender resists *both* — which requires the defender to carry the same two
types as the attacker.

**Six hero pairs carry exactly swapped types**: Bramwen `earth/fire` against
Cindara `fire/earth`, Ossic `earth/dark` against Corvane `dark/earth`, Zephyrine
`air/light` against Lucen `light/air`, and three more. Six unordered pairs is
twelve ordered ones, and each costs both of the attacker's top powers a ×0.80 —
`6 × 2 × 2 = 24`.

The ×0.50 half survives for a reason that is provable rather than measured: that
branch needs *both* of the power's types to be the defender's primary, and a
type cannot be its own pair.

**This is the same shape as the Phase 0 sweep's finding** that *"every safe
ordering ends `1·0`"* was wrong by one. Both are consequences that were reasoned
out correctly for the common case and then written down as universal. The test
now records the count, so a roster change that alters it is visible rather than
silently making the doc true or falser.

Recorded in `packages/content/README.md` and `tests/effectiveness.test.ts`.
**`CLAUDE.md` and `03-powers.md` are left unedited** — the canon is Jon's to
change, and this is a note, not an edit.

---

## 2026-07-28 — Bots carry Hidden squads, and the harder squad is the Hidden one

### Decided

- **Every bot carries both a Visible and a Hidden squad**, and is ambushable on the
  same terms as any player. Recorded as **FR-018a** in `009-matchmaking/spec.md`.
- **A bot's Hidden squad is the harder of its two.** For the starter 20 it is
  authored **one band up that bot's own rung** — bot 3's Hidden built to the 6–12
  standard, bot 10's to the 13–20 standard, and 13–20's Hidden squads answering the
  very type their own Visible squad invites you to bring.

### The part worth explaining

**The first half was already canon and the planning pass missed it.**
`09-matchmaking.md`'s *Curated bot defenders* section defines a bot as *"a gear
score, a Visible squad, a Hidden squad, and a `07-defense-ai.md` configuration —
precisely what a player's defense record is, minus the account."* Phase 0 raised the
question after reading `07-defense-ai.md`, which covers defenders only and is silent
on zones. **FR-018 carried it too, by implication** — *the same configuration model
as players* is 12 heroes across two zones, so a one-squad bot was never compatible
with it. An implication is not a statement, which is why FR-018a now says it outright.

**The second half was genuinely open, and it is the half that matters.** The ambush
counter — +2% per consecutive attack win, capped at 90% — is the recorded answer to
opponent farming. It only taxes a farmer if being ambushed *costs* something. Two
equally-hard squads would redirect a farm rather than stop it, and the whole
mechanism would be content spent on nothing.

Making Hidden harder also gives the starter week a lesson it was missing: win ten in
a row against a bot you have solved, and the 20% roll drops you into something a tier
above it. **A solved opponent is not a solved account** — taught by the ramp rather
than by a tutorial.

### Cost

**The bot pool is ~130 squads, not ~65** — the single largest authoring job in the
project. `009-matchmaking/tasks.md` splits the starter authoring into T045 (Visible)
and T046 (Hidden) so the second half cannot be quietly dropped, and the feature grew
from 56 tasks to 57.

---

## 2026-07-28 — A guild emblem is composed, not uploaded, so it is never reviewed

### Fixed

- **The emblem needs no moderation review**, and eight places said otherwise.
  Feature 013's `research.md`, `quickstart.md` and `contracts/`; feature 015's report
  target enum; and four references in feature 016 to *"the avatar / emblem review
  queue"*. All corrected.
- **`guild-emblem` is no longer a report target.** Replaced with **`guild-name`**,
  which is text, *is* moderatable, and is what makes feature 013's free forced rename
  reachable — it previously had no report path while `username` did.

### The part worth explaining

**Composition is what removes the review, not a relaxed policy** — and that
distinction is why the correction is worth more than a typo fix.

An emblem is **36 icons × 12 inks × 12 grounds**, every asset vetted at authoring
time, so a saved emblem is a **triple of indices into a curated palette**. There are
5,184 combinations and **none of them is player-supplied content**. There is no
upload to hold, nothing to store privately, and nothing to approve.

An **avatar is an upload**, so feature 012 still pre-moderates it — a genuine harm
gate, because a bad image seen by every opponent cannot be undone by a later removal.
**The two are not the same shape**, and treating them as one would have built a
review queue for a dropdown.

**This is the same argument feature 014 already makes about embeds**: nothing in them
is authored by a human, so they carry no moderation surface at all. Three features
now share one rule — **a surface exists only where a player can put something into
it** — and each of the three would otherwise have paid for a pipeline it does not
need.

The **contrast rule is unchanged and still warns rather than blocks**. A solid block
of colour remains a permitted choice.

---

## 2026-07-28 — Spec-Kit finished: 766 tasks across all sixteen

### Added

- **`tasks.md` for every one of the sixteen features** — **766 tasks**, organized by
  user story so each phase is an independently testable increment. Every task carries
  a checkbox, a sequential id, a story label where it belongs to one, and an exact
  file path. **Zero malformed, zero duplicate ids, zero gaps.**
- **A `STOP and VALIDATE` point in each feature's implementation strategy** — the
  smallest slice worth demonstrating, rather than "when the phase is done".
- **Three cross-feature seam tests named explicitly**, because each passes when
  tested inside one feature and fails in production: the 015 → 008 retention hold,
  the 009 → 013 starter-league warning, and the 004 → 006 firing profile.

### The part worth explaining

**Four features sequence a later-listed user story first, and every one of them is
following an instruction its own plan already wrote down.**

Spec-Kit's default is to phase user stories in priority order. That is right most of
the time and wrong in a specific, recurring case: **when the first thing to build is
the test that constrains everything after it.**

- **002** — the purity test must be red-then-green *before any rule exists*, or it
  gets written to fit whatever got built.
- **007** — idempotency is a schema constraint. Cheap now; a migration later.
- **011** — a grant path that trusts the client is a free storefront, so it is built
  before anything can be bought.
- **013** and **014** — first-acceptance-wins and the blocklist/classifier ordering,
  both **before the happy path**, because *a test written afterwards is written
  against an implementation that already has a shape, and the shape is the thing
  being tested.*

**The tasks carry the reasoning, not just the instruction.** A task that says
*"select 20 Visible, however far back that reaches"* is followed by the two SQL
queries and the sentence explaining that they differ only in where `LIMIT` sits.
That is deliberate: the plans and research files hold the *why*, and the diff holds
the *what*, and **the gap between them is where a correct decision gets rebuilt
incorrectly six weeks later**.

**One internal contradiction surfaced and was raised rather than resolved** — feature
013's guild emblem, which `research.md` and `quickstart.md` sent through image review
and `spec.md` composed from a fixed palette. **Resolved the same day in favour of the
spec**; see the entry above.

---

## 2026-07-28 — Phase 0/1 complete across all sixteen; four recorded figures corrected

### Added

- **`research.md`, `contracts/` and `quickstart.md` for every one of the sixteen
  features.** All **49 Phase 0 research questions answered** — 41 decided, 5 computed,
  and 3 specified-but-not-run because they need the live model or production data.
  Where a question could only be settled by measurement, the file **names the
  measurement** instead of inventing a result.
- **Two read-only analysis scripts** — `tools/characterize-orderings.py` (the
  19,440-pair power-ordering sweep) and `tools/verify-accuracy.py` (the closed-form
  hit probability against all 729 pairings). Every computed figure in the research
  files is reproducible in seconds.

### Fixed

- **`07-defense-ai.md`'s *"every safe ordering ends `1·0`"* is wrong by one** —
  logged in `resources/README.md`, docs left for deliberate editing.
- **A fifth instance of the stale-155 cascade**, in `07-defense-ai.md`: *"roughly 13
  turns per hero"* is `155 / 12`. The current figure is **8.5**.
- **`01-stats.md`'s accuracy table mixes two die-rounding conventions**, and its
  `+20 max` cell is a transcription of the symmetric median from the cell diagonally
  above it (45.2% where every convention gives 46.2%).
- **`docs/tech-stack.md` names presence as the realtime cost lever.** It is the cheap
  half — $9/month at 10k DAU against ~$270 for Global fan-out.

### The part worth explaining

**Two recorded claims were re-derived and one of them was a tripwire pointing the
wrong way.**

The sweep reproduced `07-defense-ai.md` *exactly* — greedy's tier distribution to the
decimal, the 19,440-pair histogram, the count of 12 safe orderings, the median of 13
per hero. Then it produced a twelfth ordering ending `5·0` rather than `1·0`, which
the document says is impossible. **The twelfth is the published Tank default**, which
the same document describes three paragraphs later.

That matters because feature 004's plan had turned the claim into an alarm: *"if a
re-derivation produces one that does not, the ladder changed and the defaults need
revisiting."* **The ladder has not changed** — everything else reproduced to the
decimal — so following the tripwire literally sends someone to re-tune a correct
ladder. The replacement rule is *tier 0 last*, which is **provable** rather than
measured: a power fires only when everything above it is on cooldown, and the tier-0
auto-attack never is.

**The larger finding is that the safe set is a measurement artifact.** It is defined
over 60 turns per hero; a hero takes **~8.5** in a real 6v6. At battle length **no
ordering keeps all six powers live**, because tier 0 is structurally last and a battle
is too short for the top five to be down at once. The four role defaults survive
scrutiny anyway — scoped to their own heroes, the only power that ever fails to fire
is the auto-attack, and **every hero fires its ultimate at least once** — but the
squad builder must display a **9-turn** profile. A 60-turn one tells a player their
auto-attack fires 5% of the time when in their actual battles it never fires at all.

**Two proposals are raised and deliberately not taken**, because both are canon
changes rather than Phase 0 calls. **Global chat fan-out is quadratic in players** —
billed on delivery, so `published × subscribers` — reaching ~$27,000/month at 100k
DAU against $90 for the connections everyone assumed were the problem; a capped room
size makes it linear, and the language split is already sharding on a key that does
not bound room size. And **the Hidden 2× rating bonus makes rating non-zero-sum**,
injecting roughly 2,700 points a year into an active account: both stated jobs of the
rating are ordinal and survive it, but *"everyone starts at 1000"* stops meaning
*"starts at average"*.

**Two Phase 0 questions turned out to be already answered in canon** — the inactivity
threshold and the daily income brackets — which is worth recording as a reminder that
the mechanics docs run ahead of the specs in places.

---

## 2026-07-28 — All sixteen features specified and planned

### Added

- **Sixteen feature specifications**, each with a quality checklist. **Zero
  unchecked items and zero outstanding clarifications** across the set.
- **The shared data model** (`specs/data-model.md`), settled once rather than
  negotiated in eight plans. Six models cross feature boundaries; the battle
  record is written by two features and read by four.
- **Sixteen implementation plans**, each carrying the nine Part II constraints as
  explicit verdicts. **No plan recorded a violation** — every Complexity Tracking
  table is empty.
- **`STATUS.md` and `CHANGELOG.md`**, following the convention used in Tidepool
  and playm8z.

### Changed

- **The firing profile moved from `sim/ai` to `sim/rules`.** See below.

### The part worth explaining

**The planning pass paid for itself once, concretely, which is the whole argument
for Principle VII.**

Feature 004 placed the **firing profile** — the computation telling a player which
of their powers will actually fire under a chosen ranking — in `packages/sim/ai`,
alongside the rest of the defense AI. That is where it belongs conceptually.

Feature 006's plan then needed it **client-side**, because the squad builder must
display it while a player drags a ranking widget. But `sim/ai` is **server-only**,
like `sim/resolver`, because it makes choices.

**A firing profile is not a choice.** *A power fires only when everything above it
is on cooldown* is arithmetic over the cooldown ladder — a pure function of
`(hero, ranking)` with no randomness and no server state. It meets every condition
for `rules/` and none of the ones that put anything in `ai/`, so it moved.

Found during implementation instead, the natural fix would have been an endpoint —
a network round trip on every drag, to compute something the client can derive
locally from a package it already imports. **Cheap to fix on paper; a performance
bug and an API surface to deprecate otherwise.**

---

## 2026-07-28 — The stack closed, the constitution became LMNTLZ's, and the spec pass began

### Added

- **Five tech-stack gaps closed, leaving no TBD rows.** Vercel Blob for replay
  logs · Resend for transactional email · Sentry for error monitoring · **Ably**
  for realtime · **Claude Haiku 4.5** for chat moderation.
- **Constitution v3.0.0 — LMNTLZ-specific.** Part I keeps the eleven process
  principles; **Part II adds nine product constraints (XII–XX)**, each written as
  a rule plus the one question a reviewer asks. Wired into `plan-template.md` so
  every plan is gated on them before Phase 0 and again after Phase 1.
- **The 1.0 feature set — 16 features in 6 dependency layers** (`specs/README.md`),
  with the six models that cross feature boundaries named up front.
- **Specs `001`–`006`**: content · sim-rules · sim-resolver · defense-ai · auth ·
  roster-and-squads. All pass their quality checklists.
- **An architecture diagram prompt** (`docs/architecture-diagram-prompt.md`),
  carrying a `MUST SHOW` block for the simulation seam.

### Changed

- **No analytics vendor.** Game telemetry is SQL against the battle metadata row.
  Every question the design promises to answer is a battle question, and battles
  already write permanent rows we own at full fidelity — a vendor would sell back
  a sampled copy.
- **One repository for design and code.** Client and server were never separable.
- **`resources/characters/hero-stats.xlsx` becomes the source of truth** for hero
  data, read by a build step rather than generated by one.

### Fixed

- **A stale battle-length median propagated into five derived numbers.** The
  300-turn cap was justified against **155** hero-turns, from before the `+20`
  accuracy edge cut a 6v6 to **~102**. `06-progression.md`'s rune-density math
  carried the same figure into once-firing cadence, re-arm counts, per-battle proc
  counts, total effect events, and the bar a single proc must clear.
- **The advantage cap read `$260` in two places** in `11-social.md` after it fell
  to **$160** with the pass conversion.
- **Two `30-day` replay-retention figures** survived in `docs/tech-stack.md` after
  the universal **7-day** expiry landed.
- **A wrong path** — hero data is at `resources/characters/`, not `characters/`.

### The part worth explaining

Two decisions this session look like vendor choices and are actually architecture.

**The realtime broker only fans out.** Every chat message must pass through our own
API first — to authorize scope, charge shards, persist and queue moderation — so
clients hold **subscribe-only** tokens and never publish. That is a *correctness*
requirement rather than hardening: some postings cost shards, so a client able to
publish directly would bypass the charge. It also settles why Discord could not
substitute — **Guild Ads** postings cost currency and embed live game state, which
is unenforceable anywhere we don't control rendering.

**Declining an analytics vendor makes the battle metadata row the analytics
product.** That is only safe because the row is permanent and ours at full
fidelity — but it means the row must carry **turn count, squad composition for both
sides, whether the defender was a bot, and league and rating at the time** from the
first battle ever recorded. Like `engineVersion`, it cannot be backfilled, and
under the no-nerf rule the first balance pass is the one that matters most. That
became **Constitution XVI**, and it is the only constraint in Part II that is
impossible rather than merely expensive to retrofit.

A third thing is worth recording because it was nearly lost twice. The **moderation
classifier is asynchronous and off the send path**: a slur blocklist gates a
message synchronously, the classifier reads every message in batches of 100 and
only *flags*. Drawn as a gate — as two generated diagrams did, because the prompt
told them to — it would stall a quiet guild channel for hours behind a batch that
answers in minutes.
