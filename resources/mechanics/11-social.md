# LMNTLZ · Mechanics 11 — Identity, reports and chat

Everything player-to-player that happens **outside a battle**: who you are, what
you learn about battles you did not play, and how you talk to anyone.

---

## Identity — **settled 2026-07-27**

> **The username is the identity. Steam and Google are both just ways to reach
> it.**

`../../docs/tech-stack.md` already establishes that **one account may carry both
identities** — the same player arrives via Steam on the desktop build and via
Google in a browser — and that account linking is a first-class requirement
rather than a later feature. This settles what the two link *to*: a single
username-bearing account, not two.

**Nothing else in the game reads a provider.** Leagues, rating, guilds, hold
streaks and the rune ledger all hang off the account, so where a session came
from is an auth detail and never a gameplay one.

### One caution, and it is a schema decision rather than a design one

> **"Username is the primary key" should mean *the user-facing identity*, not the
> database primary key.**

A mutable string as a real PK means every foreign key in the schema — battles,
replays, runes, guild membership, chat messages — carries a value that changes
when someone renames. The standard shape gives the same guarantee without that:

| | Column | Property |
|---|---|---|
| **Internal** | immutable `id` | what every foreign key references |
| **User-facing** | `username`, unique index | what players see, type and search |

**This costs nothing now and is very expensive to retrofit**, because it is the
one decision that touches every table at once. It also leaves renaming as an open
product question rather than foreclosing it — see *Open* below.

---

## The defender's feedback loop — **settled 2026-07-27**

**A defender never plays their own defense.** The engine does, continuously,
against every attacker, whether or not the player is online. So a report is not a
convenience — it is the *only* channel through which defensive play exists at all.

> **A defender receives the record of every battle fought against them, the
> rating and shards it produced, and notice when a hold streak advances or
> breaks.**

| What arrives | Why it is the right thing to send |
|---|---|
| **The battle record** | full replay per `../../docs/tech-stack.md` — stored event logs, never re-simulated, so an old defense is replayed exactly as it was fought |
| **Points for a hold** | rating and shards both, per `06-progression.md` — including the **2×** on a Hidden hold |
| **Hold-streak notices** | the streak is already public per zone (`02-squads.md`); the defender should not learn about their own from a leaderboard |

**This is where a defensive configuration becomes learnable.** `07-defense-ai.md`
gives a defender two ordered lists per hero and no way to watch them run. The
replay is the feedback that makes tuning them a skill rather than a guess.

**A Hidden battle's replay is the one place a Hidden squad is visible** —
`02-squads.md` question 1 keeps it out of scouting, listings and profiles, but
the defender obviously sees their own, and the attacker keeps the replay of the
fight they were in.

---

## Chat

**Three scopes at 1.0** — guild, global/league, and direct messages. Scope chosen
2026-07-27; the mechanism, the transport and the moderation model are under
discussion and not yet written here.

**Moderation belongs to this section, not a separate one.** Reporting, muting and
what happens to a reported message are chat's own problem and ship with it.

---

## Onboarding — planned now, shipped after 1.0

**Decided 2026-07-27: design it in this pass, implement it as a fast-follower.**

The feature-unlock ramp in `06-progression.md` — gating the Hidden zone, the
second and third attack squads, and guild membership on account progress — is
**progression that gates complexity rather than power**, so it cannot violate the
promise that every player's roster is identical and unlocked.

**Planning it now is what makes deferring it safe.** A ramp bolted on later has to
retrofit gates into systems that assumed everything was available, which is
exactly the kind of change the no-nerf rule makes expensive.

---

## Open

- **Chat** — the whole of it. Under discussion.
- **Whether renaming is allowed**, and at what cost. The schema note above keeps
  the option open; the product decision is separate. Note that a permanent
  username is itself a moderation surface, since an offensive one cannot be
  corrected by its owner.
- **Profiles** — what is public beyond the Visible squad, hold streaks and league,
  all of which are already public by other rules.
- ~~**Store platform reality.**~~ **Decided 2026-07-27** — `06-progression.md`,
  *Steam is the primary storefront*. Steam plus a secondary direct channel from
  the browser build; auth is already owned, so one entitlement service serves
  both. What remains is to **verify against the current Steam Distribution
  Agreement** before a purchase flow is built.
- **Live-ops.** Maintenance flag, patch cadence, and what happens to a battle in
  flight at deploy. Parked until closer to launch by decision, **not** dropped.
