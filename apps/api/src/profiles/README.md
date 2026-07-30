# `profiles/` — what leaves the system

**TL;DR for someone with no context.** The game records a lot about every
battle. This module decides what any of it is allowed to say to anyone. There
are two audiences and they get different answers: an **opponent** looking at
your profile, and **you** downloading your own data. The single rule that runs
through all of it is that *an absence you can measure is not an absence* — if a
list comes back short, the shortfall itself has told somebody something.

Constitution **XVII: storing is not exposing.** Everything here is already
recorded; this module is where the exposing decision is made.

---

## The one rule that is easy to get wrong

The profile shows a player's **last 20 Visible battles**. There are two ways to
write that and they differ by where a single `LIMIT` sits:

```sql
-- RIGHT: select 20 Visible, however far back that reaches
SELECT … WHERE zone = 'visible' ORDER BY concluded_at DESC LIMIT 20;

-- WRONG: take the last 20 of anything, then drop the Hidden ones
SELECT * FROM (SELECT … ORDER BY concluded_at DESC LIMIT 20) t WHERE zone='visible';
```

Both read correctly. Both return battles the player fought. **The wrong one
leaks three ways at once**: a short list, a visible gap in the dates, and a
total that does not reconcile with anything else on the page. Count the entries
over a few days and you have the player's ambush rate, their Hidden hold rate,
and roughly when they were ambushed — none of which any screen ever showed you.

`visibleRecord.ts` is a whole module for one query for this reason, and its
signature takes **no zone and no limit**, so a caller cannot express the wrong
question.

`concludedOn` is a **day**, never an instant. Precise times leak the same fact
one step removed: the intervals between entries count the battles in the gaps.

## `profile` and `scout` never share a serialiser

Feature 006's `/scout` shows a Visible squad's composition, because that is what
scouting *is*. This surface shows **no composition at all**, not even the
Visible one that is public elsewhere.

That looks redundant and is not. Publishing the same thing from two places means
two places to get the Hidden squad wrong, and the leak would arrive as somebody
widening one response without noticing the other moved with it.
`boundary.test.ts` enforces it structurally — nothing in this directory may
import from `squads/`.

## The export drops **both** squads

Not the opponent's. Not conditionally. Both, in both directions.

A conditional — *"include your own squad, drop theirs"* — is wrong twice. **A
player can publish their own export**, so including their own composition is a
self-service leak of their own Hidden squad. And it sits one inverted boolean
from full disclosure, producing a file that looks entirely plausible.

The header is a hand-written list of ten columns and the test matches it
**exactly**, never with `toContain`. `battle_records` is the analytics product
and will keep growing; the exact match is what turns a widened export into a CI
failure instead of a quiet disclosure.

> **`ratingAtBattle`, not the contract's `ratingAfter`.** Nothing stores a
> post-battle rating — `player_ratings` has no history and `attacker_rating` is
> written at battle *creation*. The column is named the value that exists. See
> `specs/012-profiles/contracts/profiles-api.md`.

## The profile is fixed

No per-field visibility controls, anywhere. In a game where everyone owns the
same 27 heroes, **absence is information** — every hideable field becomes a
signal, and the design would have spent its scouting mechanic on a privacy
toggle nobody asked for.

`HIDEABLE_FIELDS` names the only two that may ever be hidden, time zone and
languages, and **neither is collected yet** — so today the honest answer to
"what can I hide?" is nothing. The constant exists so adding a third is a
visible edit rather than a consequence of adding a column.

## Avatars: two columns, and why

`accounts.avatar_key` holds a curated choice; `accounts.custom_avatar_url` holds
an **approved** custom image and wins when set. One column holding either kind
would make *"is this approved?"* a question about the format of a string, and
pre-moderation is the one rule here whose failure cannot be undone — a bad image
seen by every opponent stays seen.

With two columns the guarantee is structural: **`custom_avatar_url` is written
by exactly one code path, the approval.** A pending submission lives in
`avatar_submissions`, and no profile query reads that table.

`HARM_REASONS` has **no `low-quality` member**. Constitution XVIII — harm is a
gate, taste is a note. A reviewer who wants to reject on quality has no value to
submit. **A $5 ugly avatar is approved.**

## What is deliberately not built here

| | Waiting on | Why not stubbed |
|---|---|---|
| `GET /guilds/:id/export` | 013, **and guild-event design is deferred** | it exports event data; with no events, every honest version returns an empty file or a 403, and a route that always refuses reads as a permissions bug |
| `POST /me/avatar` (custom upload) | 016's review queue | the charge is on submission and a rejection refunds nothing — that is the throttle, and it only works if somebody is reviewing. Shipping it would charge players for an image that sits pending forever |

`GET /me/avatar` reports `customAvailable: false` **in the payload**, not only in
copy, so a client renders an honest screen rather than guessing.

## ⚠️ One open decision, recorded rather than resolved

**FR-012 and FR-015 cannot both hold.** A custom avatar costs *$5 or 1,350
shards*; FR-015 requires a dual-priced item be worse shards-per-dollar than the
best boost pass; `bestShardsPerDollar()` is **0**, because nothing converts money
into shards. The dual price implies **270 shards per dollar** — paying the money
saves the shards, and saved shards buy runes.

One $5 avatar frees ~3.5 days of income, about two full runes. That is not
cosmetic. `tests/profiles/pricing.test.ts` **asserts the conflict** rather than
faking a pass, and fails the moment either number moves. Three ways out are
written up in `specs/012-profiles/tasks.md` under T026; none has been taken.
