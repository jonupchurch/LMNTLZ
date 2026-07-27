# 08 · Guilds

**TL;DR** — Players can band together in guilds of up to 24. For an event a guild
splits into three **Wings** of eight players each — or benches people as
**Grounded**, a fourth slot with no size limit — and those assignments are
**frozen once the event starts** so nobody can watch the scoreboard and shuffle
people around to chase a prize. The one thing still allowed mid-event is throwing
someone out of the guild — and since the empty seat can't be refilled, that only
ever costs you, which is exactly why it's safe to allow. Wings don't fight each other — members just play
normally, and the event counts something they do (attack wins, say), tallied per
Wing and then per guild. The best Wings get paid directly and their guild picks
up a smaller reward on top. A Wing is a group of *people* and exists only for
events; a **squad is still 6 heroes**, as it always was. **Everyone who takes
part is paid something** — a flat amount per filled slot — with much larger
prizes climbing steeply above that, and everything resetting at the end of each
season once winnings are handed out.

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
- **The single exception is removal from the guild.** During an event, an officer
  may still **remove a member from the guild**, which also removes them from
  their Wing. Nothing else is permitted — no reassignment, no swaps, and no
  backfilling the vacated seat. A Wing that drops to seven stays at seven until
  the event ends.
- **Grounded is a fourth assignment, alongside the three Wings.** Every guild
  member is in Wing I, Wing II, Wing III, or **Grounded**. It is a real slot with
  a name, not an empty field or a missing value, and it has **no capacity limit**
  — it is the bench, and a guild can hold any number of members there.
- **Grounded is set two ways.** An officer may **ground a member manually** while
  Wings are unlocked, and may move a Grounded member **into a Wing** the same way
  — before an event or after one, but never during. Separately, anyone who
  **joins the guild mid-event is Grounded automatically**, because the lock
  forbids any route into a Wing.
- **A Grounded member is a full member in every other respect.** They hold rank,
  appear in the roster, use chat, and play the game normally. What they do simply
  counts toward no Wing's tally, and they share in no Wing's reward.
- **The lock covers Wing composition, nothing else.** Frozen: Wing assignment,
  swaps, and any route by which a member could newly *enter* a Wing. Unaffected:
  promoting or demoting an officer, changing the recruitment mode, editing the
  tagline, and sending invitations — invitations still work, and anyone who
  accepts simply arrives Grounded. None of those can change a Wing's roster or
  its tally, which is the only thing the lock exists to protect.

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

### Why the kick exception is safe — and what it forecloses

Allowing removal is the one hole a lock like this normally cannot afford, because
under **per-member average** scoring an officer could raise a Wing's score simply
by cutting its weakest member. "Kick the laggards at hour 40" would replace
"reshuffle at hour 40" and the lock would achieve nothing.

It is safe here because of how scoring already works. **An event tallies a
total**, and under a total — or under top-K — removal can never help:

| Scoring | Effect of kicking a weak member mid-event | Exploitable? |
|---|---|---|
| **Total tally** | Loses every point they would still have scored; the seat cannot be refilled | No — strictly self-harming |
| **Top K of 8** | Changes nothing if they were outside the top K; costs you if they were inside | No |
| **Per-member average** | Raises the Wing's score for free | **Yes** |

So the rule carries a dependency worth stating outright: **allowing mid-event
removal forecloses average scoring.** That is not a loss — average scoring was
already the weaker option in question 0 for other reasons — but it means the
decision is now made by elimination rather than still open. If anyone later
proposes averaging, this rule has to be revisited in the same breath.

The incentive shape that falls out is exactly right. Because the seat cannot be
refilled, removing someone mid-event is **purely a cleanup action and never an
optimisation** — it always costs the Wing something. An officer will only do it
to be rid of a genuinely disruptive member, which is what the exception is for.

### What the lock costs

**An inactive member is dead weight for the rest of the event**, and the only
remedy is to remove them from the guild entirely — which drops the Wing to seven
for the duration, since nobody can take the seat. That is a real cost, and it is
the price of the commitment being meaningful.

It also argues for **top-K scoring** more strongly than anything else in this
document: if a Wing is scored on its best 5 of 8, a member going quiet costs
almost nothing, and no officer ever faces a choice between carrying someone and
cutting them.

### Grounded settles whether all three Wings must be filled

They need not. A guild of 12 can run `4 / 4 / 4`, or `8 / 4 / 0` with four
Grounded, and **Grounded is the mechanism that makes the choice expressible** —
without it, "concentrate into two strong Wings" has nowhere to put the leftovers.

The useful part is what the scoring model does to that choice:

> **Under a tally, concentrating is never actually better — *provided a thin Wing
> still places somewhere*.** Scores are totals, nothing is averaged, and a
> low-placing Wing does not drag the guild's reward down: the guild's cut sits
> *on top of* whatever its Wings earn. So a third Wing of four costs nothing to
> field and might place; grounding those four guarantees they contribute nothing.
> The competitive answer is **fill all three**.

> **That proviso is load-bearing, and an earlier draft stated the claim without
> it.** Simulated against a field dominated by full Wings of eight, a guild of
> twelve running `4 / 4 / 4` earns **nothing at any tier steepness** if the lowest
> paying bracket sits around the 35th percentile — all three Wings fall below it
> — while `8 / 4 / 0` places one and pays. Concentrating wins exactly when a
> half-strength Wing cannot reach the board.
>
> **The participation floor below is what makes the proviso hold unconditionally**
> rather than by tuning. Every Wing that posts a score is paid, so a thin Wing
> always places, so filling all three is always right.

That is a good property rather than a disappointing one. **Grounding has no
competitive upside, so it cannot be weaponised** — no officer can improve a
Wing's standing by benching someone, which means the feature is safe to leave
freely available whenever Wings are unlocked, with no rules guarding it.

What it *is* for is administrative: benching a member who is inactive, disruptive,
or who has asked to sit an event out. Those are social problems, and giving them
a visible mechanical answer is better than the alternative, which is removing
someone from the guild entirely.

> **One caution.** Grounding is a whole-event bench with no recourse, and an
> officer can apply it minutes before a lock. It needs to be visible to the
> member themselves, not only in the admin view — a player who quietly earns
> nothing for an event and is never told why has been punished invisibly.

### Grounded, and what it does to recruiting

**Grounded** is the state of a guild member who has no Wing for the current
event: someone who joined after the lock, and — if a guild chose to concentrate
rather than spread — anyone left unassigned when the lock fell.

It is worth having as a named, visible state rather than a blank, because it
tells a new recruit *why* their play is not counting, which is otherwise the kind
of silence that reads as a bug. It also names the thing an officer is choosing
when they recruit mid-event.

The knock-on is a **recruiting rhythm**: since a mid-event recruit contributes
nothing, guilds have no reason to fill seats while an event runs, and every
reason to fill them in the gap beforehand. Recruitment naturally clusters into
the window between events, which is a good rhythm to design *for* — the guild
admin screen should be at its most useful exactly then, and should say plainly
how long is left to recruit before the next lock.

One caution: Grounded lasts a whole event, so a recruit who joins early in a long
event sits idle for a long time. If events run long, this is the rule most likely
to feel punishing to a new member, and the mitigation is a visible countdown to
the next lock rather than a change to the rule.

### Edge cases the rules still have to answer

| Case | Question |
|---|---|
| A **removed member's tally** | Does the score they already earned stay with the Wing, or leave with them? |
| A **removed member's reward** | They may have contributed most of a paid Wing's score before being cut. Do they get a share? |
| A player **leaves voluntarily** mid-event | Presumably identical to being removed, but it should be stated rather than assumed |
| A player **rejoins** a guild they were removed from | Grounded, presumably — but this is also the loophole to check, since remove-then-rejoin must not become a way to reshuffle |
| A **new event starts** with empty seats | Does the lock capture the roster as-is, or force a fill first? |

On the first of those, **the tally should stay with the Wing**, for an
architectural reason as much as a design one: a Wing's score is a query over
battle results the server has already logged, so keeping it means filtering on
*membership at the time of the battle* rather than current membership — which is
both the simpler query and the honest one. The alternative would let a removal
retroactively rewrite a leaderboard mid-event.

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

A short Wing is allowed to compete, and the leftovers of any split sit
**Grounded** — see below. Under a tally, filling all three is almost always
right, so these splits are a genuine choice that mostly has an obvious answer.

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

## Rewards

Paid in **Rune Shards** (`06-progression.md`), on a **seasonal** cadence.

### The shape

| Layer | Who | Scales with |
|---|---|---|
| **Participation floor** | every member of a Wing that posted a score | nothing — flat, per member |
| **Bracket** | members of Wings that place | steeply, toward the top |
| **Guild share** | every member, on top | the guild's rolled-up standing |

**Everyone who participates gets something.** Any Wing that posts a non-zero
score earns the floor. There is no cut line, no "did we make it", and no season
in which a member played and received nothing.

> **The floor pays per filled slot, never per Wing.** This is not a detail. A flat
> per-Wing floor would let a three-person guild run `1 / 1 / 1`, collect three
> full floors between three people, and out-earn a full guild — which splits the
> same three floors among 24 — by **8× per head**. Paying per filled slot removes
> the incentive entirely: a Wing of eight collects eight floor units, a Wing of
> one collects one.

**"Filled slots" also settles the vacated-seat case for free.** A Wing that drops
to seven because an officer removed someone mid-event has **seven** filled slots,
so it collects seven floor units for the rest of the season. Kicking is therefore
self-harming at the floor as well as in the tally — the same incentive shape the
lock already relies on, arriving without a rule of its own.

**Steep above the floor.** The floor is deliberately small relative to the top
brackets. It exists so nobody is shut out, not so nobody needs to compete —
`The reward curve is the dial that makes the split matter` above explains why
steepness is the only thing tying three non-interacting Wings together.

That gives two dials pulling in opposite directions, each doing one job:

- **The floor serves participation** — a guild of twelve fielding three thin
  Wings earns from all three, which makes *fill all three* unconditionally
  correct and keeps `Grounded` an administrative tool rather than a competitive
  one.
- **Steepness serves ambition** — a full guild still has a real reason to load
  its strongest players into one Wing rather than balancing.

### Two competitions, not one

| | Cadence | Metric | Purpose |
|---|---|---|---|
| **The ladder** | continuous, paid **per season** | ladder points, rolled up per Wing then per guild | the always-on general competition |
| **Events** | time-boxed | an unusual metric — holds, super-effective hits, wins under a restriction | themed, occasional |

**The ladder gives Wings a purpose between events.** Without it a Wing is inert
except during an event, which is most of the time. With it, a Wing is a standing
competitive unit whose members' ordinary ladder results accumulate continuously.

**Events must therefore not simply count attack victories**, or they become a
slower, worse ladder measuring the same thing twice. The metric menu in
*Which metrics do events tally* is where an event earns its place — and the
defence-flavoured one is the most valuable, since holds are already tracked and
nothing else rewards being good at defense.

### The season resets everything

**Once a season's winnings are paid, scores reset to zero** — Wing tallies, guild
standings, and the ladder points behind them.

That is not optional under a seasonal payout. On a permanent total, a Wing two
years old holds an unreachable score and no new Wing can ever place; the
competition would be decided by age rather than by play. **A seasonal competition
requires a seasonal reset**, and this closes the question `06-progression.md`
carried open about whether ladder points reset.

The **matchmaking rating does not reset.** It is a measurement of skill rather
than a score, so wiping it each season would scramble matchmaking for everyone
and re-expose new players to veterans — which the starter-grant design in
`06-progression.md` depends on not happening.

---

## Still open

### ~~0. Is a Wing's score a total or an average?~~ — **settled: totals, with a participation floor**

Totals, as argued below. The under-filled-guild problem it identifies is solved by the **per-member participation floor** in *Rewards* above rather than by top-K scoring: every Wing that posts a score is paid, so a short Wing always places and no member's contribution is ever discarded. Top-K was the previous recommendation and is no longer needed.

The original reasoning, kept because it is what rules out averaging:

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

### 1. Which metrics do events tally? — *the shape is settled, the menu is not*

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

### 1a. Do event battles feed the personal attack streak?

Event battles are ordinary battles, so by default they do — which means a heavy
event week inflates everyone's ambush chance on the normal ladder, and near the
90% cap a PvP-victory event quietly becomes a Hidden-squad event. Excluding them
instead means the streak silently stops counting some of a player's real wins,
which is worse. Probably: **let them count, and expect events to drive ambush
rates up as a designed side effect.** Related to question 4.

### 2. Does the Hidden zone participate?

Guild events are the natural place for the ambush mechanic to feel different —
but ambush is currently driven by the *attacker's personal* win streak, which
does not obviously translate to a team. Whether a Wing has a collective streak
is a real question and would be the first streak in the game that isn't personal.

### ~~3. How deep does "top Wings" go?~~ — **settled**; the split inside a Wing is not

Depth is answered in *Rewards*: a participation floor reaching every Wing that scores, with steep brackets above it. What remains is only the second half —

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

The currency is settled — **Rune Shards** — so this is no longer blocked on
`06-progression.md`. What is left is a genuine design choice about whether being
*in* a good Wing or *carrying* one is the thing being paid for.

---

## Dependencies

- ~~**Blocked by `06-progression.md`**~~ — **unblocked.** Rewards pay in Rune
  Shards, on a seasonal cadence, with a per-member participation floor and steep
  brackets above it. Only the *sizes* remain to be tuned.
- **Depends on `02-squads.md`** for the roster economy, the defense lock, the
  invalidation rule and hold streaks. All four already do real work above.
- **Gates nothing.** No existing mechanic needs guilds to be finished. This can
  be designed in parallel with powers and turns without blocking either.
