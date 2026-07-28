<!--
Sync Impact Report
==================
Version: 3.0.0 (was 2.1.0)
Status: Adopted as the LMNTLZ project constitution. Versions 1.x–2.x were a
  portable, product-neutral engineering reference that travelled between
  repositories. This amendment binds it to one codebase.

Bump rationale — MAJOR. Two backward-incompatible governance redefinitions:
  (1) v2.1.0 stated "this is a reference starting point, not inherited
      authority — the actual codebase's own conventions win whenever they
      conflict". That is now false: this IS the codebase, and Part II is
      binding rather than advisory.
  (2) v2.1.0 declared "no ratification ceremony required". Part II carries
      product constraints that a change can violate, so compliance review
      becomes real and the amendment procedure is now specified.
  No principle was removed and none was renamed.

Modified:
  - Title: "Reference Constitution — Working in a Codebase, Fast and Well"
    → "LMNTLZ Constitution"
  - Preamble: reframed from portable reference to project constitution
  - Governance: rewritten (amendment procedure, versioning policy,
    compliance review, the design-output rule)
  - Workflow: Principle IX's feature-branch step reconciled with the
    project's actual straight-to-main practice

Added:
  - Part II — Product Constraints, Principles XII–XX:
    XII   Server Authority and the Seed Boundary (NON-NEGOTIABLE)
    XIII  One Rules Engine, in One Language (NON-NEGOTIABLE)
    XIV   Balance Upward
    XV    Derived Data Is Generated, Never Authored
    XVI   The Past Is Immutable; Some Records Cannot Be Backfilled
    XVII  Storing Is Not Exposing
    XVIII Harm Is a Gate; Taste Is a Note
    XIX   Every Outbound Dependency Sits Behind an Interface
    XX    The Written Docs Are Canon

Removed: nothing.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check filled with
     the nine Part II gates, replacing the "[Gates determined based on
     constitution file]" placeholder
  ✅ CLAUDE.md / AGENTS.md — already carry every Part II constraint; this
     document now cites them as the operative source rather than restating
  ⚠ .specify/templates/spec-template.md — no change needed; Part II
     constrains design and implementation, not specification structure
  ⚠ .specify/templates/tasks-template.md — no change needed; the
     principle-driven task types it categorises are unchanged

Deferred TODOs: none.
-->

# LMNTLZ Constitution

This governs every change to LMNTLZ, a competitive asynchronous fantasy squad
battler. It has two parts.

**Part I — Process** is how to build: eleven principles carried unchanged from
the portable engineering reference this document grew out of. They are about
working well and would apply to any codebase.

**Part II — Product Constraints** is what LMNTLZ specifically may not do. These
are consequences of decisions already made and recorded in `CLAUDE.md`,
`AGENTS.md`, `docs/tech-stack.md` and `resources/mechanics/`. They appear here
because each one is **cheap to honour and expensive to retrofit**, and because
a reviewer needs a short list to check a change against.

> **Part II is binding, not advisory.** Where Part I says the codebase's own
> conventions win, Part II *is* the codebase's conventions.

## Part I — Process

### I. Clarify Before Building (NON-NEGOTIABLE)

Before writing code, capture — even in a few bullet points, even just
said out loud — what's actually being asked: the user story, the
acceptance criteria, and what's explicitly OUT of scope. If a
requirement is ambiguous, ask whoever owns it (client, teammate, PM, or
your own product judgment made explicit) rather than silently picking an
assumption; if asking isn't possible in the moment, state the assumption
out loud before proceeding so it can be corrected early rather than
discovered at the end.

Rationale: the single most common way a technically-correct solution
still fails is solving the wrong problem confidently. A five-second
clarifying question is always cheaper than a wrong solution.

### II. Validated Trust Boundaries

Anything crossing a trust boundary — form input, API request bodies,
query params, anything a user or another system controls — gets
validated before use, following whatever validation convention the
codebase already has (Zod, a schema library, manual checks — match
what's there; on a greenfield project, pick one and apply it
consistently). Never trust client-side state for authorization; check
it server-side.

Rationale: this is universal, not project-specific — the existing
pattern is usually right there to follow, so this principle is about
finding and matching it, not inventing a new one each time.

### III. Match Existing Conventions

Whether it's someone else's codebase or your own established project, its
design system, code style, file layout, and UX patterns are the source
of truth — not momentary preference. Before writing new code in an
unfamiliar area, find the nearest existing analog (a similar component, a
similar route, a similar test) and follow its shape. On a brand-new
project with no conventions yet, establish them deliberately and then
hold to them. Deviating is sometimes right, but say why out loud when it
happens.

Rationale: consistency with what's already there reads as competence and
keeps a codebase legible; a stylistically-foreign addition reads as not
having actually understood the surrounding code, even when the logic is
correct.

### IV. Scope Discipline (NON-NEGOTIABLE)

Ship the smallest complete slice that actually satisfies what was
asked. Resist gold-plating or solving adjacent problems nobody raised.
If a good idea surfaces mid-build that's outside the current ask,
name it out loud ("worth doing, but separate from this") rather than
silently expanding scope.

Rationale: scope creep is the fastest way to end up with a lot in
flight and nothing finished; a narrow, complete change is easier to
review, verify, and trust than a broad, half-built one.

### V. Verify Before Calling It Done

Before saying "done," actually check it: run the test suite, manually
exercise the golden path (and the one most obvious edge case), and read
back your own diff once. If the codebase has a build/typecheck step, run
it. "I believe this works" and "I checked this works" are different
claims — say which one you're making.

Rationale: a change that breaks the moment someone else touches it is
worse than admitting a rough edge honestly; verification is cheap
insurance against exactly that.

### VI. Narrate the Reasoning

Make the reasoning visible: say what you're about to do and why before
doing it, especially for a non-obvious call (why this approach over an
alternative, why this scope boundary, what you're explicitly deferring).
Keep a short running list of decisions/assumptions. In a live setting
with no commit history to reconstruct intent from later, this narration
IS the record; in normal work it complements the commit history
(Principle IX) rather than replacing it.

Rationale: the reasoning is often more valuable than the diff itself and
is frequently what's actually being evaluated — make it visible as you
go, don't save it for a retrospective explanation.

### VII. Plan the Whole Feature Set Before Building

For a project's initial set of features, plan ALL of them to completion —
specifications and implementation plans — before writing implementation
code for any single one. Use the Spec-Kit chain across the full set
(`speckit-specify` then `speckit-plan` for every feature) so shared data
models, cross-feature dependencies, and the right build order surface on
paper. Implementation of the set begins only once the set is planned.

Rationale: planning features one at a time is how you discover in week
three that feature A's data model can't support feature C. Surfacing those
collisions up front, while they're still cheap to fix, is the entire point.
(Time-boxed single-task work is the exception — see Governance.)

### VIII. Test at the Right Level

Write appropriate **unit tests** for any code where they carry real signal
— logic, edge cases, data transformations, anything with branching a later
change could silently break — using the language/framework's standard
tooling and matching the repo's existing test conventions (location,
naming, runner). Include **end-to-end tests** wherever they're feasible and
appropriate, covering the critical user paths a unit test can't reach, with
the stack's standard E2E tool (e.g. Playwright for web). Not every line
needs a test; skip the ones where a test adds no signal (trivial glue,
generated code) — but skip them deliberately, not silently.

Rationale: tests are the executable, durable form of "I checked this works"
(Principle V) — they're what lets the next change be made safely. Choosing
the level (unit vs. e2e) is about putting the check where the risk lives.

### IX. Commit Often, Atomically

Commit often in small, **atomic** commits — each a single coherent change
that builds and passes tests, with a message in the repo's convention.
Feature branches are the default for collaborative work; **LMNTLZ currently
works straight to `main`**, which is a deliberate exception documented under
Governance and is reviewed if a second contributor ever joins.

Rationale: atomic commits are a reviewable, revertible history and the
durable record of intent — the counterpart to Principle VI's live narration
whenever there IS a repo to commit to. The branch discipline exists to keep a
shared default branch releasable; with a single contributor and no consumers,
it protects nothing that atomicity does not already protect.

### X. One Question at a Time (NON-NEGOTIABLE)

When you need something from the person you're working with, ask **one
question at a time** and wait for the answer before asking the next. Where the
tooling supports an interactive prompt with selectable options, use it rather
than burying the question in prose. Do not batch several decisions into a
single multi-part prompt, and do not ask a question whose answer you could
determine yourself from the code, the docs, or a sensible default.

This does not license asking *more* questions — Principle I's bar for what
merits asking is unchanged. It governs the shape of the asking, not the volume.

Rationale: a batched prompt forces someone to hold several unrelated decisions
in their head at once, and the answer to the first question very often changes
what the second one should even be. Asking serially means each answer can
inform the next question — and a question with real options attached is far
cheaper to answer than one buried in a paragraph.

### XI. Layman's TL;DR on Long Summaries

Any long summary — a review write-up, a design rationale, a plan readback, a
report of completed work — leads with a short **plain-language TL;DR** before
the detailed version. Write it for someone who doesn't have the surrounding
context loaded: no unexplained jargon, no acronyms, no assumed familiarity with
the codebase. State what it means and why it matters, not the mechanics. The
detail still follows in full; the TL;DR is an addition, never a replacement.

Rationale: a long technical summary is often read by someone deciding whether
they need to read it at all. Front-loading the plain-language version means the
answer arrives in ten seconds instead of ten minutes, and it catches the case
where the author understood the detail but not the point.

## Part II — Product Constraints

Nine constraints specific to LMNTLZ. Each states the rule, then the test a
reviewer applies. The full reasoning lives in the cited documents and is not
restated here.

### XII. Server Authority and the Seed Boundary (NON-NEGOTIABLE)

The client sends an **intent**; the server resolves it and returns what
happened. The client renders what it is told and MUST NOT decide an outcome.
`packages/sim` splits into **rules** (pure, no randomness, both sides) and
**resolver** (consumes randomness, server only). **The RNG seed MUST NOT leave
the server.** In-progress battle state MUST NOT be stored — it is re-derived
from the append-only action log on every request. Nothing shipped in a client
bundle is secret; the client authenticates with a per-user token issued at
sign-in, never a shared secret baked into the build.

**The test:** can a modified client change an outcome, learn a future roll, or
read a value it was not issued? If yes, the change is rejected.

Rationale: a client holding the seed can read every future roll — which attacks
crit, which miss, what the AI will do — and that is unpatchable while the seed is
client-side. Server authority means the exploit does not exist rather than being
caught afterwards. See `docs/tech-stack.md` → *Gameplay is server-authoritative*.

### XIII. One Rules Engine, in One Language (NON-NEGOTIABLE)

The **rules** half of `packages/sim` is the single implementation of combat
math — targeting legality, reach, type effectiveness, cooldowns, turn order,
the damage formula. It MUST NOT be duplicated in a second language, a second
package, or a second copy. Client and server MUST live in one repository, so
neither can pin a different version of it.

**The test:** does this change compute a rule outcome anywhere other than
`packages/sim`'s rules half? If yes, the change is rejected.

Rationale: two implementations that must agree exactly, forever, in a game whose
whole loop is reading numbers off a screen. This disqualified MAUI, and separate
client/server repositories reintroduce it as version skew rather than language
difference — harder to notice, equally wrong. See `docs/tech-stack.md` →
*Why one repo* and *Why not MAUI*.

### XIV. Balance Upward

To correct an outlier, **raise the other twenty-six rather than lower the one.**
Prefer the additive levers first — curated bot defenders and new content move
the meta without touching a number. Levelling has a measured budget of **+10** on
`Might` and `Speed` before a +20 rune overflows the 75 cap. When a nerf is
genuinely the answer, **grant shards to everybody**. Fixing a bug is not a nerf.

**The test:** does this lower a number a player has already spent on? If yes, it
needs the compensating grant and an explicit decision, not a patch note.

Rationale: runes are permanent and destroyed on replacement, so a nerf writes off
a player's spend; and replays are stored rather than re-simulated, so a patch
cannot reach backwards to make a past battle consistent. See
`resources/mechanics/README.md`.

### XV. Derived Data Is Generated, Never Authored

A hero's whole relationship profile derives from two authored fields, `primary`
and `secondary`: `bane = counter(primary)`, `fault = counter(secondary)`.
Weaknesses MUST NOT be hand-authored, and the 9×9 matrix MUST NOT be
hand-authored — both are generated. The three distinctness rules
(`secondary ≠ primary`, `counter(primary) ≠ secondary`,
`counter(secondary) ≠ primary`) are validated in the content schema.

**The test:** does any file contain a written-out bane, fault, or matrix cell?
If yes, it is generated output checked in by mistake or a rule violation.

Rationale: derived data authored by hand drifts from its own derivation the first
time either side is edited, and nothing catches it. See `CLAUDE.md`.

### XVI. The Past Is Immutable; Some Records Cannot Be Backfilled

Replays are **stored JSON event logs, played back as recorded, never
re-simulated** — so a balance patch can never change a past battle's outcome.
Every battle record carries **two version stamps**, `engineVersion` and
`contentVersion`, never merged into one. Because LMNTLZ deliberately runs **no
analytics vendor**, the battle metadata row *is* the analytics product: turn
count, squad composition for both sides, whether the defender was a bot, and
league and rating at the time MUST ship with the first battle ever recorded.

**The test:** could this field be added later and still answer the question it
exists for? If no, it ships now.

Rationale: every testable commitment in the design — zone balance, hold rates,
battle length, league thresholds — is a battle question answered by SQL against
rows we already own. A field missing from the first battle is missing from the
history that the first balance pass reads. See `docs/tech-stack.md` →
*Observability*.

### XVII. Storing Is Not Exposing

What the system **records about itself** and what **leaves the system** are
separate decisions with separate answers. A change to one MUST NOT be assumed to
license the other. Standing exposure rules: **no embed may ever show a Hidden
defense, including via a replay**; CSV export carries **no squad composition, on
either side**; the public profile shows the **last 20 Visible battles**, selected
that way rather than filtered from a longer list.

**The test:** does this change what is recorded, what is exposed, or both? Answer
for each separately, out loud.

Rationale: aggregation is a privacy change even when every row is individually
public, and an absence that can be measured is not an absence — a Visible-only
list produced by filtering leaks the Hidden count through its own length. See
`resources/mechanics/11-social.md`.

### XVIII. Harm Is a Gate; Taste Is a Note

Every restriction on a player MUST be answerable with *"because it could harm
someone."* A restriction justified by *"because it would look bad"* is a note,
not a gate — surface it and let the player proceed. Moderation **flags; humans
decide**: automation may issue a temporary mute, never a ban, and the classifier
MUST NOT gate delivery. Prefer making bad output **impossible** over validating
against it.

**The test:** name the harm. If you cannot, it is a warning rather than a block.

Rationale: taste-based gates read as contempt for the player, are trivially
defeated, and accumulate into a system nobody can explain. Disjoint palettes make
illegibility unreachable without a check; a check would merely refuse it. See
`resources/mechanics/11-social.md`.

### XIX. Every Outbound Dependency Sits Behind an Interface

The **payment rail**, **realtime transport**, **transactional email sender** and
**moderation classifier** are each reached through an interface, never called
directly from feature code. Entitlements are **account-level, never
per-storefront** — a purchase belongs to the account regardless of where it was
made. `steamworks.js` stays isolated in `apps/desktop/` behind a capability
check, so the browser build never imports it.

**The test:** does feature code name a vendor? If yes, it belongs behind the
interface.

Rationale: the interface is where the cross-cutting rules live — *AI drafts, a
human sends*; *the classifier never gates*; *the entitlement belongs to the
account*. A vendor SDK called from three places has nowhere to put them. It also
keeps Steam a fast-follow that costs nothing now. See `docs/tech-stack.md`.

### XX. The Written Docs Are Canon

The rules live in `CLAUDE.md`, `AGENTS.md`, `docs/tech-stack.md`,
`resources/mechanics/` and `resources/LORE-and-flavor.md`. A generated screen in
`resources/designsystem/` is **look and feel only and is never a source of
rules** — when a screen and a decision disagree, **the discussion wins and the
screen is wrong**, however finished it looks. A generated screen MUST NOT be
rewritten to match the rules unless explicitly asked; record the discrepancy in
`resources/README.md` and let it be regenerated. Anything a screen appears to
settle is a **proposal to confirm**, not a decision. No rules or canon go in a
wiki.

**The test:** is this rule written in a document under `docs/` or
`resources/mechanics/`? If it exists only in a `.dc.html`, it is not a rule yet.

Rationale: generated output is confident and complete-looking, which is exactly
what makes it dangerous as a source of truth. Canon in two places is canon in
neither. See `CLAUDE.md` → *Where the rules actually live*.

## Workflow

**Starting the initial feature set:** plan the whole set first (Principle VII) —
`speckit-specify` + `speckit-plan` across every feature — before implementing
any. **Build order is settled:** `packages/content` + `packages/sim` first,
headless, with tests. Everything depends on them and they depend on nothing, and
the design is server-authoritative — the sim *is* the game.

**Per feature or change:**

1. **Fast orientation pass** (minutes, not hours) — stack, entry
   points, directory conventions, how a request flows, and the handful
   of existing patterns you'll need to match. Delegate this to a
   background investigation agent (see `.claude/agents/codebase-scout.md`
   in this repo) so it runs while you keep talking through requirements —
   don't block the conversation on your own manual exploration.
2. **Clarify scope** — the actual ask, acceptance criteria, explicit
   non-goals (Principle I). A 3-bullet mini-spec is enough; don't
   over-invest in ceremony the moment doesn't warrant.
3. **Plan** — the full-set plan (Principle VII) at project inception, or a
   lightweight per-change plan (approach, files touched, the one or two
   real tradeoffs) for a single change. Skip the lightweight plan only for
   genuinely trivial changes.
4. **Check the change against Part II** before writing it, not after. Eight of
   the nine constraints are cheap to honour up front and expensive to retrofit;
   Principle XVI is the one that becomes *impossible* to retrofit.
5. **Implement, matching existing conventions** (Principle III),
   **writing unit/e2e tests alongside the code** (Principle VIII) and
   **committing often in atomic commits** (Principle IX).
6. **Verify** (Principle V) before presenting it as finished — including
   the tests you wrote.
7. **Narrate throughout** (Principle VI) — don't save the explanation
   for the end.

## Governance

**This constitution is binding on LMNTLZ.** Part I is process and admits
judgment; **Part II is not negotiable in passing** — a change that violates a
Part II constraint is rejected, or the constraint is amended first, deliberately
and on the record.

**Amendment procedure.** An amendment updates this file, states its rationale in
the Sync Impact Report at the top, and lands in its own commit. A Part II
amendment MUST also update the document it derives from — `CLAUDE.md`,
`docs/tech-stack.md` or the relevant `resources/mechanics/` file — in the same
commit, so the constraint and its reasoning never disagree.

**Versioning policy.** MAJOR for a removed or redefined principle or a
governance change; MINOR for a new principle or materially expanded guidance;
PATCH for clarification and wording.

**Compliance review.** Part II is the review checklist. The
`Constitution Check` gate in `.specify/templates/plan-template.md` carries the
nine constraints so every plan is checked against them before Phase 0 research
and again after Phase 1 design.

**Straight to `main` is a deliberate exception to Principle IX's branch
discipline**, valid while LMNTLZ has one contributor and no consumers of its
default branch. Atomic commits still hold without exception. **Revisit the moment
a second contributor joins** — that is the condition under which the exception
stops being correct.

**Time-boxed / live mode:** under a genuinely time-boxed, single-task engagement
(see `docs/interview-cheat-sheet.md`), Principles VII and IX may be relaxed —
plan lighter, commit as the setting allows. The verification and testing bar
(Principles V and VIII), the non-negotiables (I, IV, X, XII, XIII) and all of
Part II still hold.

**Version**: 3.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-28
