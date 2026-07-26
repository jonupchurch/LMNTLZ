# 08 · Guilds

**TL;DR** — Players can band together in groups of up to 24. When the game runs
an event, a guild splits its members into three teams of up to eight; each team
scores on its own against every other team in the game, and the guild's reward
comes from how all three placed. Because every player owns the same 27 heroes, a
guild can never win by having *better* heroes than another — only by deciding
better who fights whom. Two dials remain, and between them they decide whether
guilds recruit people or get rid of them: whether a team's score is a **total**
or an **average**, and how steeply the reward tiers climb.

---

## Settled

- A guild holds **up to 24 members**.
- For an event, the guild's members are grouped into **three teams of up to
  eight**. Those teams are the competing unit.
- **Rewards are earned by the teams and paid at guild scale.**
- **Every Banner scores independently on one global board.** A Banner is not
  matched against a specific rival Banner or a specific rival Court; it posts a
  score and is ranked against every other Banner in the game. The Court's reward
  is a function of how its three Banners placed.

Everything below is either forced by those four facts or is still open.

---

## The naming collision

**"Squad" is already taken.** Throughout `02-squads.md` a squad means *exactly
six heroes in a fixed 2/3/1 formation* — it is the fundamental unit of the whole
game, and the word appears in the lore (*the Standing Six*), in the rank ladder,
and on every generated screen. A guild grouping of eight *players* is a
different kind of object at a different scale, and calling both a "squad" makes
sentences like "each squad in the squad fields a squad" not merely awkward but
genuinely ambiguous in a rules document.

The numbers make it worse rather than better: **eight members each fielding six
heroes** means 8 and 6 sit next to each other constantly, and a reader who loses
track of which noun a number belongs to cannot recover it from context.

Provisional vocabulary used in this document, so it can be written at all:

| Scale | Term | Size |
|---|---|---|
| The whole social group | **Court** | up to 24 players |
| An event team within it | **Banner** | up to 8 players |
| What one player fields | **squad** | exactly 6 heroes |

**Court** comes straight from the lore — `LORE-and-flavor.md` already opens on
*"the age of the **Warden Courts**"*, where houses "send champions" rather than
armies, which is precisely what a guild does. **Banner** is unused anywhere in
the project and is the standard fantasy word for a company fighting under one
sign.

> One snag with **Court**: `Court-Champion` is already the fourth rank on the
> progression ladder, and the News screen uses *The Court* as a standings
> destination. A player could be a Court-Champion of a Court. That is survivable
> — one is a rank, one is an organisation — but it is a real cost and worth
> naming before the word is locked in.

---

## What the numbers force

### 24 splits perfectly, and only 24 does

`3 × 8 = 24` exactly. At full membership every single member is placed and no
one sits out — which is a deliberate-feeling property and probably why the two
numbers were chosen together.

The consequence is that **a full Court is the only size with no slack.** Below
24, some Banner is short, and the split stops being obvious:

| Members | Even split | Note |
|---|---|---|
| 24 | 8 / 8 / 8 | The only perfectly full configuration |
| 23 | 8 / 8 / 7 | One Banner is a member down |
| 18 | 6 / 6 / 6 | Even, but every Banner is 25% under strength |
| 12 | 4 / 4 / 4 | Even; or 8 / 4 / 0 if concentration is allowed |
| < 3 | — | Cannot field three Banners at all |

This raises a question the rules have to answer rather than leave to the UI:
**is a short Banner allowed to compete, or must all three be filled?** A Court of
12 choosing between three even Banners of 4 and two strong Banners of 6 is
making a real strategic decision, and whether that decision exists is a design
choice, not an implementation detail.

### Recruiting has a hard ceiling with a visible cliff

Because the split is into thirds, membership matters in steps of three, not one.
The 24th member completes a Banner; the 25th cannot join at all. Expect Courts to
sit at exactly 24 and to treat an inactive member as a blocked slot rather than a
minor loss — the pressure to remove them is structural, not social.

---

## How this meets the roster economy

This is where guilds get interesting, and it follows entirely from rules already
settled in `02-squads.md`.

### A Banner cannot out-roster another Banner

Every player owns all 27 heroes, identical for everyone. Eight players therefore
bring **eight copies of every hero in the game**. There is no rare unit a rival
Banner lacks, no depth advantage, and no way to buy one.

What a Banner has instead is **assignment**: deciding which of its eight members
takes which of the opposing targets. That is the same counter-building skill the
whole game runs on, lifted one level up — read the enemy's weaknesses, and point
the right player at them. A Court's advantage is coordination, and coordination
only, which is exactly consistent with the game's central promise that nobody can
out-collect anyone.

### The defense lock is what creates scarcity

Each member has 12 heroes locked to their two defense zones, leaving **15 to
attack with** across up to 3 saved squads. Those 15 are the member's real
contribution to a Banner.

This produces a consequence worth stating plainly, because it is the first time
the game asks a player to change their own setup for someone else's benefit:

> If a Banner needs a specific counter that a member has locked on defense, the
> only way to free it is for that member to **edit their defense** — which by
> the existing rule evicts the hero from any attack squad it appears in and
> **invalidates those squads**, and by the streak rule **resets that defense
> zone's hold streak to zero**.

So a Court asking a member to free a hero is asking them to give up a public
streak they have been building. That is a genuine cost, it is already fully
specified by existing rules, and it means guild coordination has teeth without
needing any new mechanic to enforce it. Whether that cost is *too* high — enough
that members simply refuse — is a tuning question, not a rules question.

### Guild play does not need its own roster rules

Nothing above requires guilds to touch the 12/15 split, and they should not.
The defense lock is what makes defense meaningful; suspending it for events would
make event offense strictly stronger than ladder offense and would quietly
delete the game's main allocation decision. **Assumption: event offense draws
from the same 15, under the same rules.** Flagged rather than settled — it is
the kind of thing that gets asked for later as a convenience.

---

## What the leaderboard format buys, and what it costs

**It buys the thing that makes events actually runnable.** No Banner has to wait
for a comparable opponent to exist, so events run on a fixed schedule regardless
of how many Courts are online, how big they are, or how lopsided the population
is. It also removes a whole class of exploit: with no assigned opponent, there is
nobody to collude with and nothing to sandbag against.

It fits the architecture cleanly too. A Banner's score is an aggregate over
battle results the server already resolved and logged, so scoring introduces no
new trust boundary — the client never reports a score, it is derived server-side
from records that already exist.

**What it costs is interaction.** The three Banners of one Court never meet, and
nothing about Banner I's result changes what Banner II should do. That is the one
real weakness of this format, and it puts unusual weight on the reward function,
because *that* is now the only thing tying the three together.

### The reward curve is the dial that makes the split matter

If a Court's reward were simply the **sum** of its three Banners' scores, the
split into thirds would be pure bookkeeping — 24 players scoring, arbitrarily
partitioned, with no decision anywhere. The three-way structure would carry no
strategy at all.

It stops being bookkeeping the moment leaderboard rewards are **tiered**, which
they normally are — top 10, top 100, top 1000. Tiers are step functions, so the
payout is *not* linear in score, and the Court gets a genuine allocation
decision back:

| Strategy | Result | Wins when |
|---|---|---|
| **Spread** — three even Banners | Three mid-tier placements | Tiers climb gently; three mid payouts beat one high one |
| **Stack** — one loaded Banner, two thin | One top-tier placement, two low | Tiers climb steeply; the top bracket is worth more than the rest combined |

So **the steepness of the tier curve decides whether Courts stack or spread**,
and it is a single tunable number rather than a structural rewrite. That is the
lever to reach for if guild play feels decisionless — flatten it to encourage
balance, steepen it to make a hero Banner worth building. Setting it needs
`06-progression.md` first.

---

## Still open

### 0. Is a Banner's score a total or an average? — *decides whether guilds recruit or purge*

Under a global board this is no longer a detail, because Banners of different
sizes are ranked against each other directly. The two obvious answers both fail,
in opposite directions:

- **Total contribution.** A Banner of 8 out-scores a Banner of 4 roughly
  two-to-one before anyone plays a single battle, so small and mid-size Courts are
  structurally excluded rather than merely disadvantaged. Combined with the
  recruiting cliff below, this makes 24/24 not a goal but a prerequisite.
- **Per-member average.** Fixes the size problem and immediately creates a worse
  one: a Banner raises its average by **removing its weakest members**. Cutting a
  struggling player becomes the mathematically correct play, which inverts the
  entire reason the feature exists.

Neither is shippable as-is. Two mitigations worth evaluating, both of which keep
adding a member from ever being negative:

- **Score the top K contributors** (say the best 5 of 8). A short Banner can
  still compete; a full Banner gets depth and insurance rather than raw
  multiplication; and a weak member dilutes nothing because they are simply not
  counted.
- **Cap the score per Banner**, reached faster with more members. Size becomes
  a convenience rather than an advantage, and the ceiling is common to everyone.

This is the first thing to settle after progression exists.

### 1. Who assigns members to Banners, and when can it change?

Leader-assigned, self-selected, or automatic. And whether the split is locked for
an event's duration or can be rearranged partway — on a live leaderboard a Court
can see all three of its Banners' standings mid-event, so a Court that can
reshuffle is able to abandon a lost placement and pile onto a reachable tier,
while one that commits up front is betting before the board exists. Given that
the reward curve is the main strategic dial, allowing mid-event reshuffles
substantially weakens it.

### 2. Must all three Banners be filled?

See the table above. There is no opponent to be outnumbered by here, so the
question is narrower than it looks: it is really about whether a Court of 12 may
concentrate into `8 / 4 / 0` and post two scores instead of three. Downstream of
question 0 — under a top-K or capped score, concentrating is a real option worth
allowing; under a raw total it is close to mandatory.

### 3. What does a Banner actually *do* to generate a score?

With no assigned opponent, the source of score is fully open. Three shapes:

- **A shared PvE target** — every Banner in the game attacks the same authored
  defense set, and scores on damage, clear time or depth. Perfectly comparable
  across Banners, which is exactly what a leaderboard needs, and it lets the
  event author the counter-building puzzle deliberately rather than leaving it to
  whoever a Banner happened to draw.
- **Ordinary ladder play, aggregated** — a Banner's score is its members' normal
  attack results over the event window. Cheapest to build, since it needs no new
  battle content, but it makes the event a participation contest and rewards
  playtime over skill.
- **Attacks against other Courts' defenses** — closest to the core loop and the
  most alive, but comparability suffers: two Banners drawing different opponents
  are not scored on the same problem.

The shared PvE target fits the leaderboard best, because ranking Banners against
each other is only meaningful if they all faced the same thing.

### 3a. Do Banner attacks share the ambush and hold-streak systems?

Whatever the target is, event battles either feed the personal attack streak or
they do not, and either answer has a cost: feeding it means a heavy event week
inflates everyone's ambush chance on the normal ladder, while not feeding it
means the streak silently stops counting some of a player's wins. Related to
question 4.

### 4. Does the Hidden zone participate?

Guild events are the natural place for the ambush mechanic to feel different —
but ambush is currently driven by the *attacker's personal* win streak, which
does not obviously translate to a team. Whether a Banner has a collective streak
is a real question and would be the first streak in the game that isn't personal.

### 5. What are the rewards, and are they individual or shared?

Blocked on `06-progression.md`, which does not exist yet. Guild rewards are the
first thing in the design that pays out to more than one player at once, and the
currency they pay in has not been defined.

---

## Dependencies

- **Blocked by `06-progression.md`** for rewards and currency — nothing here can
  be tuned until there is an economy to tune against.
- **Depends on `02-squads.md`** for the roster economy, the defense lock, the
  invalidation rule and hold streaks. All four already do real work above.
- **Gates nothing.** No existing mechanic needs guilds to be finished. This can
  be designed in parallel with powers and turns without blocking either.
