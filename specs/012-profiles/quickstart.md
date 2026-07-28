# Quickstart: Profiles & Export

**Feature**: `012-profiles` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test profiles
```

## Write this before the query it tests

### The alternating-battles leak test

```
Fixture: a player whose last 40 battles alternate strictly
         Visible, Hidden, Visible, Hidden, …

GET /v1/players/:id/profile

  a FILTERED implementation  → ~10 entries
  a SELECTED implementation  → 20 entries
```

**That is the whole test, and it fails loudly on the wrong implementation.** No
amount of code review reliably catches this one — both queries read correctly and
differ only in where `LIMIT` sits.

**Why it is a disclosure and not a cosmetic bug**: under the filtered query a viewer
who counts entries learns how many of the last 20 battles were Hidden. Repeated over
days, that yields the player's ambush rate, their Hidden hold rate, and roughly when
they were ambushed — all withheld deliberately, because a Hidden squad that can be
inferred is not hidden.

### Three more fixtures, because the naive one passes by accident

```
fewer than 20 Visible battles ever   → as many as exist. NEVER padded.
the 20 most recent are ALL Hidden    → 20 Visible entries from further back
a brand-new account, 0 battles       → empty list, profile still renders
```

### The timestamp is part of the leak

```
✓ concludedOn is a DAY  ("2026-07-27")
✗ concludedAt is a timestamp
```

Exact times leak the same information one step removed: the **intervals** between
entries reveal how many battles happened in the gaps. A correct query with precise
timestamps is a correct query that still leaks.

## The export

### Assert the header exactly

```
expect(header).toEqual([
  'battleId','concludedAt','role','opponentUsername','opponentWasBot',
  'zone','outcome','turnCount','leagueAtTime','ratingAfter'
])
```

**An exact-match assertion, not a `toContain`.** The point is that a widened export
fails CI. New columns will be added to `battle_records`, and none of them may appear
here by default.

### Neither squad, in either direction

```bash
# export a player with 200 battles, then:
rg -i "bramwen|ossic|front|middle|back|squad" export.csv
```

**Nothing.** Then read the implementation:

```
✓ a SELECT naming ten columns
✗ SELECT *
✗ an object spread of a battle record
✗ any conditional on whose squad it is
```

**The conditional is the trap.** *"Include your own squad, drop your opponent's"* is
wrong twice: a player can publish their own export, so it self-leaks their Hidden
composition — and it is one inverted boolean from full disclosure, producing a
plausible file nobody notices for months.

### Two routes, not one parameter

```bash
rg -n "scope|includeGuild" apps/api/src/profiles
```

**Nothing.** `GET /v1/me/export` and `GET /v1/guilds/:id/export` run **different
queries**. A scope parameter invites the bug where an officer requests the wider
scope; two routes cannot express it.

Then confirm the guild export is **event data only** — no member battle detail, not
even for the officer's own battles.

## The profile boundary

```bash
curl /v1/players/$OTHER/profile | jq
```

Assert **absent**, by searching the whole serialised response rather than checking
fields you remembered:

```
✗ email, provider identity, entitlements    ✗ shard balance
✗ either zone's composition                  ✗ any Hidden battle
✗ any gap where a Hidden battle would be
```

And assert **present**: both hold streaks. The Hidden zone contributes exactly one
number — its streak — and nothing else, which is the same rule feature 006's `scout`
follows.

**Then the structural check:**

```bash
rg -n "serializ|toProfile|toScout" apps/api/src
```

`profile` and `scout` must not share a serialiser. Two routes, two disclosure rules —
a shared serialiser is precisely how the Hidden squad leaks.

## Avatars

```
1  POST /v1/me/avatar          → charged IMMEDIATELY, state: pending
2  the avatar URL is NOT publicly reachable while pending
3  reviewer rejects            → NO refund, state: rejected
4  POST /v1/me/avatar again    → charged AGAIN
```

Line 1 is the throttle. Charging on *approval* makes rejection free and removes it
entirely. Line 4 confirms one purchase does not buy unlimited attempts.

Line 2 is the private-store check — an unapproved avatar reachable by URL is an
unmoderated image on a public URL, which is the whole thing the queue exists to
prevent.

### Harm is a gate; taste is a note

```
hate imagery      → rejected
sexual content    → rejected
impersonation     → rejected
ugly              → APPROVED
```

Then the structural version:

```bash
rg -n "HarmReason" apps/api/src/profiles
```

The rejection reason enum has **no `low-quality` member**. A reviewer who wants to
reject on taste has no value to submit — Constitution XVIII enforced by the type
rather than by a guideline.
