# Quickstart: Guilds

**Feature**: `013-guilds` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test guilds
```

## The golden path — from the plan

1. Apply to **five** guilds.
2. Have one accept.
3. **Confirm four withdrawals and exactly one membership.**

Then succession end to end with an injected clock, **both outcomes**.

## First-acceptance-wins — write this before the happy path

```
two guilds accept the SAME applicant simultaneously

✓ exactly ONE guild_members row
✓ exactly ONE application in state 'accepted'
✓ every other open application in state 'withdrawn'
✓ the loser received 409 { reason: 'already-joined' }, NOT 500
```

**Run it under real concurrency**, two connections against one database, not two
sequential calls. The bug only exists in the window between them.

The last line is the one that shows the implementation caught `23505` rather than
letting it escape. The officer whose click lost should see *"Reyna joined The Long
Reach a moment ago"*, not a server error.

**Then the case that proves the lock is on the right row:**

```
guild A accepts applicant X   |  guild B accepts applicant Y   (different players)
→ both succeed, concurrently, with no serialisation
```

Locking the guild row would serialise these for no reason. The invariant is *"an
account belongs to at most one guild"*, and it lives on the applicant.

**And the one that proves it is not on the application:**

```
guild A accepts application 1 from X  |  guild B accepts application 2 from X
→ these are DIFFERENT rows. Without the membership constraint, X joins twice.
```

## The clock is injectable — check before writing succession

```bash
rg -n "Date\.now\(\)|new Date\(\)" apps/api/src/guilds
```

**Nothing.** Confirm the lint rule is what enforces it, not discipline:

```
add `const t = Date.now()` to a guilds module → LINT FAILS
```

A convention that says "inject the clock" is broken in a one-line bug fix at the
worst possible moment.

## Succession — all four branches

Nobody will wait 21 days. With an injected clock each is a few lines.

```
master returns at day 13  → succession NEVER becomes available
master returns at day 20  → succession is available and CANCELS
master never returns      → succession COMPLETES at day 21
master returns at day 22  → too late. They are no longer master.
```

**The fourth is the one worth naming.** It is what a real person experiences as
unfair, and it is the one nobody thinks to test. Succession being final is a
*deliberate* decision only if somebody wrote this test.

Then the money branch:

```
officer has 650 at day 14, spends it, has 400 at day 21
→ succession does NOT complete
```

The 650 is checked **at completion**, not only at initiation.

## The starter-league warning — the check that has failed three times

```
✓ POST /v1/guilds                      requires both acknowledgements
✓ POST /v1/guilds/:id/applications     requires both acknowledgements
✓ POST /v1/invites/:id/accept          requires both acknowledgements
```

**Founding is the door most likely to be missed**, because it feels like a creation
flow rather than a joining one. Test it first.

Then the negative:

```
acknowledged: ["bot-opponents-end"]  only   → 409
acknowledged: []                            → 409
a player NOT in the starter league          → no acknowledgement needed
```

**Assert on the constructed payload, not on rendered copy.** The point of making
`StarterExitWarning` a required field is that the confirm cannot be built without it.
A test against a string is a test that a string can be dropped — which is exactly
what happened three times.

**The application, not the acceptance:**

```
1  player applies                    → warning shown HERE
2  a day passes
3  an officer accepts                → the player is graduated
4  assert: the warning was shown at step 1
```

At step 3 the player is not present. Graduating them there without a warning at step
1 means someone else's click changed their game.

## Roles

```
member  invites?     → 403
officer invites?     → 200
officer succession?  → 200
officer sets emblem? → 403
master  disbands?    → 200
officer disbands?    → 403
```

## Capacity and application limits

```
24 members, 25th accepted   → 409
6th concurrent application  → 409
application after 7 days    → 410 (expired)
```

Application expiry is a scheduled job (feature 016) driven from Postgres — resumable
and safe to re-run, the same shape as the replay cleanup. Test it by advancing the
clock and running the job, not by waiting.

## The emblem — composed, so there is nothing to review

```
pick icon 17, ink 4, ground 9   → SAVES IMMEDIATELY, no pending state
a low-contrast combination      → warns, and SAVES ANYWAY
an icon index outside 0-35      → 422
```

**No review queue, no pending state, no private storage.** The emblem is
**36 icons × 12 inks × 12 grounds**, all vetted at authoring time, so a saved emblem
is a triple of indices into a curated palette — 5,184 combinations, **none of them
player-supplied content**.

Then the structural check:

```bash
rg -in "emblem" apps/admin/src apps/api/src/moderation
```

**Nothing.** If an emblem ever reaches a review queue, something is treating a
palette index as an upload.

> **Composition is what removes the review, not a relaxed policy.** An avatar is an
> upload and *is* pre-moderated (feature 012). The contrast rule still **warns and
> never blocks** — harm is a gate, taste is a note, and a solid block of colour is a
> permitted choice.

The guild **name** and **pitch** are text and **do** go through feature 015 — an
unacceptable name is the one case where a permanent name changes.

## What must not be there

```bash
rg -in "wing|event|guildFund|treasury" apps/api/src/guilds
```

**Nothing.** Guild events, Wings and guild funds are deferred **with their design** —
a Wing exists only for an event, so a `wing` column now is a column shaped by a
design that does not exist yet.

Then the profile boundary:

```
GET /v1/guilds/:id
✗ another player's guild applications
✗ any member's shard balance
✗ any squad composition
```
