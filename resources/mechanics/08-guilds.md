# 08 · Guilds

**TL;DR** — Players can band together in guilds of up to 24. For an event a guild
splits into three **Wings** of eight players each, and those assignments are
**frozen once the event starts** so nobody can watch the scoreboard and shuffle
people around to chase a prize. Wings don't fight each other — members just play
normally, and the event counts something they do (attack wins, say), tallied per
Wing and then per guild. The best Wings get paid directly and their guild picks
up a smaller reward on top. A Wing is a group of *people* and exists only for
events; a **squad is still 6 heroes**, as it always was. The main thing left to
decide is how a short-handed Wing is scored, since counting raw totals quietly
shuts smaller guilds out.

---

## Settled

- A guild holds **up to 24 members**.
- Members are grouped into **three Wings of 8**. A Wing is the competing unit in
  an event, and exists for no other purpose.
- **Every Wing scores independently on one global board.** A Wing is not matched
  against a specific rival Wing or a specific rival guild; it posts a score and is
  ranked against every other Wing in the game.
- **Rewards are paid at two levels.** The **top Wings take a reward** directly,
  and **the guild receives a lesser reward** on top of it. So a strong Wing is
  paid twice over — once to its eight members, once to the guild they belong to —
  and a guild benefits from its best Wing even if the other two place nowhere.

- **Wings compete; they never battle.** There is no Wing-versus-Wing fight and no
  Wing-shaped formation. Members play the game normally for the duration of an
  event, and the event **tallies a metric** from what they do — a PvP event might
  count attack victories. Those tallies are **counted by Wing first, then rolled
  up by guild.**
- **Wing assignment is set by officers and locks when an event starts.** The GM
  and Officers move members between Wings from the guild admin screen; when the
  target Wing is already at 8 the move becomes a **swap** rather than being
  refused, so filling one Wing never leaves another short. **Once an event
  begins, the assignment is frozen for its duration.**

Everything below is either forced by those five facts or is still open.

### Why the lock matters more than it looks

Without it, a live leaderboard is an exploit surface rather than a scoreboard.
Because standings are visible while the event runs, an unlocked guild could:

- **Chase tier boundaries.** See that Wing I is comfortably inside its bracket
  and Wing II sits three places below the next one, then move the strongest
  members across to convert one safe placement into two paid ones. The reward
  curve is the main strategic dial, and this reduces it to arithmetic performed
  with full information.
- **Consolidate late.** Spread wide early to see where the field lands, then
  collapse the best players into one Wing for the closing hours — turning a
  commitment into a hedge.

Locking makes the assignment a genuine bet placed **before** the board exists,
which is what makes it a decision at all.

> **The lock has to cover membership, not just assignment.** Freezing which Wing
> a member sits in while still allowing kicks leaves the same exploit intact
> through a different door — under per-member average scoring, removing a
> low-contributing member raises their Wing's score directly, so "kick the
> laggards at hour 40" replaces "reshuffle at hour 40". Whatever the lock
> ultimately freezes, **a member cannot be removed from a competing Wing
> mid-event in a way that improves that Wing's score.** This interacts with
> question 0 and should be settled alongside it.

### What the lock costs, and the edge cases it creates

The cost is real and worth accepting knowingly: **an inactive member is dead
weight for the whole event**, with no recourse until it ends. A guild that loses
someone to a holiday on day one carries a seven-person Wing for the duration.
That is the price of the commitment being meaningful.

Four cases the rules have to answer explicitly, since the UI cannot invent them:

| Case | Question |
|---|---|
| A player **joins the guild** mid-event | Unassigned and ineligible until the next event, presumably — but they need a visible state saying so |
| A player **leaves voluntarily** mid-event | Does their Wing drop to 7, and does the score they already contributed stay? |
| A player is **kicked** mid-event | Should be blocked outright for competing Wings, per the note above |
| A **new event starts** while a guild has empty seats | Does the lock capture the roster as-is, or does it force a fill first? |

**One scheduling consequence, easy to miss:** if assignments lock at event start,
then whatever makes an event distinctive — a type restriction, a formation rule,
a scoring change — has to be **published before the lock**, or guilds are
assigning blind. The News screen's event calendar already advertises modifiers
like *"Fire-only attack squads"* and *"No shared Banes permitted"*, so this is
not hypothetical. Events need an announced pre-lock window.

> **The two-level payout resolves what the leaderboard format left dangling.**
> The worry with independent scoring was that the three Wings never interact, so
> the split into thirds carried no decision. Paying the top Wings *directly*
> restores the stakes at Wing scale — the eight people in a Wing are playing for
> their own reward, not merely contributing to a guild pot — while the lesser
> guild-wide reward keeps them from being three unrelated teams sharing a name.
> It also means a guild is never punished for carrying a weak third Wing, only
> for failing to build a strong first one.

---

> **Screen status.** `designsystem/LMNTLZ Guild Roster.dc.html` matches these
> rules — 23/24 wardens, three Wings at a cap of 8 apiece, named FIRST / SECOND /
> THIRD WING. `designsystem/LMNTLZ Chat.dc.html` does not: it shows the cap as
> **20** (`14 / 20 WARDENS`) and has no notion of the three-way split, tracking a
> single flat weekly goal instead. The numbers here win; Chat needs regenerating.

---

## The vocabulary

A **Wing** is a guild grouping of **8 players**, and a guild holds **3 of them**.
Wings exist *only* inside a guild and *only* for events — they are not a combat
formation, they never appear on a battlefield, and nothing outside guild events
refers to them.

| Scale | Term | Size | Made of |
|---|---|---|---|
| The whole social group | **guild** | up to 24 players | 3 Wings |
| An event team within it | **Wing** | exactly 8 players | players |
| What one player builds | **squad** | exactly 6 heroes | heroes |

**A squad is always 6 heroes**, on attack and on defense alike, in the fixed
2/3/1 formation. That is unchanged and unaffected by anything in this document.

> **The two words never describe the same kind of thing**, which is what keeps
> them apart: a Wing is a roster of *people* and only exists during an event; a
> squad is a formation of *heroes* and exists all the time. Where a sentence
> risks confusion, the fix is to say "8 wardens" or "6 heroes" rather than to
> reach for a third noun.

---

## What the numbers force

### 24 splits perfectly, and only 24 does

`3 × 8 = 24` exactly. At full membership every single member is placed and no
one sits out — which is a deliberate-feeling property and probably why the two
numbers were chosen together.

The consequence is that **a full guild is the only size with no slack.** Below
24, some Wing is short, and the split stops being obvious:

| Members | Even split | Note |
|---|---|---|
| 24 | 8 / 8 / 8 | The only perfectly full configuration |
| 23 | 8 / 8 / 7 | One Wing is a member down |
| 18 | 6 / 6 / 6 | Even, but every Wing is 25% under strength |
| 12 | 4 / 4 / 4 | Even; or 8 / 4 / 0 if concentration is allowed |
| < 3 | — | Cannot field three Wings at all |

This raises a question the rules have to answer rather than leave to the UI:
**is a short Wing allowed to compete, or must all three be filled?** A guild of
12 choosing between three even Wings of 4 and two strong Wings of 6 is
making a real strategic decision, and whether that decision exists is a design
choice, not an implementation detail.

### Recruiting has a hard ceiling with a visible cliff

Because the split is into thirds, membership matters in steps of three, not one.
The 24th member completes a Wing; the 25th cannot join at all. Expect guilds to
sit at exactly 24 and to treat an inactive member as a blocked slot rather than a
minor loss — the pressure to remove them is structural, not social.

---

## How this meets the roster economy

This is where guilds get interesting, and it follows entirely from rules already
settled in `02-squads.md`.

### A Wing cannot out-roster another Wing

Every player owns all 27 heroes, identical for everyone. Eight players therefore
bring **eight copies of every hero in the game**. There is no rare unit a rival
Wing lacks, no depth advantage, and no way to buy one.

What a Wing has instead is **assignment**: deciding which of its eight members
takes which of the opposing targets. That is the same counter-building skill the
whole game runs on, lifted one level up — read the enemy's weaknesses, and point
the right player at them. A guild's advantage is coordination, and coordination
only, which is exactly consistent with the game's central promise that nobody can
out-collect anyone.

### The defense lock is what creates scarcity

Each member has 12 heroes locked to their two defense zones, leaving **15 to
attack with** across up to 3 saved squads. Those 15 are the member's real
contribution to a Wing.

This produces a consequence worth stating plainly, because it is the first time
the game asks a player to change their own setup for someone else's benefit:

> If a Wing needs a specific counter that a member has locked on defense, the
> only way to free it is for that member to **edit their defense** — which by
> the existing rule evicts the hero from any attack squad it appears in and
> **invalidates those squads**, and by the streak rule **resets that defense
> zone's hold streak to zero**.

So a guild asking a member to free a hero is asking them to give up a public
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

**It buys the thing that makes events actually runnable.** No Wing has to wait
for a comparable opponent to exist, so events run on a fixed schedule regardless
of how many guilds are online, how big they are, or how lopsided the population
is. It also removes a whole class of exploit: with no assigned opponent, there is
nobody to collude with and nothing to sandbag against.

It fits the architecture cleanly too. A Wing's score is an aggregate over
battle results the server already resolved and logged, so scoring introduces no
new trust boundary — the client never reports a score, it is derived server-side
from records that already exist.

**What it costs is interaction.** The three Wings of one guild never meet, and
nothing about Wing I's result changes what Wing II should do. That is the one
real weakness of this format, and it puts unusual weight on the reward function,
because *that* is now the only thing tying the three together.

### The reward curve is the dial that makes the split matter

If a guild's reward were simply the **sum** of its three Wings' scores, the
split into thirds would be pure bookkeeping — 24 players scoring, arbitrarily
partitioned, with no decision anywhere. The three-way structure would carry no
strategy at all.

It stops being bookkeeping the moment leaderboard rewards are **tiered**, which
they normally are — top 10, top 100, top 1000. Tiers are step functions, so the
payout is *not* linear in score, and the guild gets a genuine allocation
decision back:

| Strategy | Result | Wins when |
|---|---|---|
| **Spread** — three even Wings | Three mid-tier placements | Tiers climb gently; three mid payouts beat one high one |
| **Stack** — one loaded Wing, two thin | One top-tier placement, two low | Tiers climb steeply; the top bracket is worth more than the rest combined |

So **the steepness of the tier curve decides whether guilds stack or spread**,
and it is a single tunable number rather than a structural rewrite. That is the
lever to reach for if guild play feels decisionless — flatten it to encourage
balance, steepen it to make a hero Wing worth building. Setting it needs
`06-progression.md` first.

---

## Still open

### 0. Is a Wing's score a total or an average? — *less severe than it first looked*

**A tally is a total by nature.** "Count attack victories per Wing" is a sum, and
the natural reading of the settled rules is that scores are totals. Two facts
make that far safer here than it would normally be:

- **Wings are a fixed size.** Every Wing is 8, so any two full Wings are compared
  on equal footing. The size problem only exists for *under-filled guilds*, not
  as a general property of the format.
- **Guild size is capped at 24.** Nobody can field a bigger Wing than anyone
  else, so a total cannot be inflated by out-recruiting.

What survives is narrower but still real: **a guild below 24 is structurally
disadvantaged**, roughly in proportion to how short it is. A guild of 12 running
`4 / 4 / 4` posts three half-strength tallies and places nowhere with any of
them. Combined with the recruiting cliff below, a raw total makes 24/24 less a
goal than a prerequisite for competing at all.

The alternative fails worse. **Per-member average** fixes the size problem and
immediately creates a nastier one: a Wing raises its average by **removing its
weakest members**, so cutting a struggling player becomes the mathematically
correct play — which inverts the entire reason the feature exists, and reopens
the kick loophole the assignment lock was meant to close.

So: **default to totals**, and treat under-filled guilds as the thing to
mitigate. Two options, both of which keep adding a member from ever being
negative:

- **Score the top K contributors** (say the best 5 of 8). A short Wing can
  still compete; a full Wing gets depth and insurance rather than raw
  multiplication; and a weak member dilutes nothing because they are simply not
  counted.
- **Cap the score per Wing**, reached faster with more members. Size becomes
  a convenience rather than an advantage, and the ceiling is common to everyone.

**Top-K is the better fit**, because it is the only one of the two that also
survives the inactive-member problem the assignment lock creates: if a Wing is
scored on its best 5 of 8, one member disappearing on holiday mid-event costs the
Wing very little, and the guild has no incentive to kick them. It solves the
size problem and the lock's main cost with one rule.

This is the first thing to settle after progression exists.

### 2. Must all three Wings be filled?

See the table above. There is no opponent to be outnumbered by here, so the
question is narrower than it looks: it is really about whether a guild of 12 may
concentrate into `8 / 4 / 0` and post two scores instead of three. Downstream of
question 0 — under a top-K or capped score, concentrating is a real option worth
allowing; under a raw total it is close to mandatory.

### 3. Which metrics do events tally? — *the shape is settled, the menu is not*

Settled above: an event tallies a metric from members' ordinary play, counted by
Wing and then rolled up by guild. A PvP event counting attack victories is the
worked example.

**This is a very cheap feature to build**, and that is worth saying plainly. It
needs no new battle content, no bracket, no matchmaking and no Wing-shaped
formation — the metric is an aggregate over battle results the server already
resolved and logged. A new event type is a new query and a new leaderboard, not
new gameplay.

The open part is which metrics are worth tallying, because **the metric is the
event's entire design.** Counting raw attack victories rewards playtime almost
purely. Metrics that reward *skill* rather than hours are the ones worth
authoring:

| Metric | What it actually rewards | Watch for |
|---|---|---|
| Attack victories | Volume, hours played | Pure participation contest; the default, and the least interesting |
| Victories **against higher-rated defenses** | Punching up | Needs a rating floor or people farm the boundary |
| **Hold** count across both defense zones | Good defensive building, which nothing else rewards | Defenders don't control when they're attacked |
| Super-effective hits landed | Counter-building — the game's actual thesis | Easiest to game by farming a known-weak defense |
| Victories under an event restriction (Fire-only, no shared Banes) | Constrained building | Needs the restriction announced before the assignment lock |

A defense-flavoured event is the notable gap: **hold streaks are already tracked,
public and per-zone**, and nothing else in the design rewards being good at
defense. Tallying holds would make the Standing Six matter competitively without
inventing a single new mechanic.

### 3a. Do event battles feed the personal attack streak?

Event battles are ordinary battles, so by default they do — which means a heavy
event week inflates everyone's ambush chance on the normal ladder, and near the
90% cap a PvP-victory event quietly becomes a Hidden-squad event. Excluding them
instead means the streak silently stops counting some of a player's real wins,
which is worse. Probably: **let them count, and expect events to drive ambush
rates up as a designed side effect.** Related to question 4.

### 4. Does the Hidden zone participate?

Guild events are the natural place for the ambush mechanic to feel different —
but ambush is currently driven by the *attacker's personal* win streak, which
does not obviously translate to a team. Whether a Wing has a collective streak
is a real question and would be the first streak in the game that isn't personal.

### 5. How deep does "top Wings" go, and what is the split inside one?

The *shape* is settled — top Wings are paid directly, the guild gets a lesser
reward on top. Two things inside that are not:

- **How many Wings count as "top".** A hard cut (top 10) makes placement brutal
  and most events unrewarding for most players; graded brackets (top 10 / 100 /
  1000) keep a long tail of guilds playing. This is the tier curve from the
  section above, and it is the same dial that decides whether guilds stack one
  Wing or spread across three.
- **Whether all eight members of a paid Wing are paid equally.** An even split is
  simple and rewards being *in* a good Wing. Splitting by contribution rewards
  playing well but stacks on top of question 0 — if score is a total *and* the
  payout is proportional to contribution, a low-activity member is punished twice
  for the same thing.

Both are blocked on `06-progression.md`, which does not exist yet: guild rewards
are the first thing in the design that pays out to more than one player at once,
and the currency they pay in has not been defined.

---

## Dependencies

- **Blocked by `06-progression.md`** for rewards and currency — nothing here can
  be tuned until there is an economy to tune against.
- **Depends on `02-squads.md`** for the roster economy, the defense lock, the
  invalidation rule and hold streaks. All four already do real work above.
- **Gates nothing.** No existing mechanic needs guilds to be finished. This can
  be designed in parallel with powers and turns without blocking either.
