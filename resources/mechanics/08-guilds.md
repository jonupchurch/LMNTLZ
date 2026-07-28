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
- **Rewards are paid at two levels, in two currencies** — **settled 2026-07-28.**
  The **top Wings take a reward** directly, paid to their eight members in **Rune
  Shards**; **the guild receives a lesser reward** on top, paid in **guild funds**
  (`11-social.md`). So a strong Wing is paid twice over — once to its members,
  once to the guild they belong to — and a guild benefits from its best Wing even
  if the other two place nowhere.

  **Guild funds are a separate, non-convertible balance** spendable only on
  guild-scoped things: recruiting posts today, guild logos and cosmetics later.
  That keeps the two payouts from being the same reward counted twice, and it
  **self-balances by need** — a full 24/24 guild has no use for recruiting budget
  and spends its winnings on prestige, while a guild still building spends the
  identical reward on advertising.

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

### Founding a guild costs 650 shards — **settled 2026-07-28**

> **One full rune. Paid personally by the founder, and not refundable.**

**Sized to be a decision, not a barrier.** 650 is **1.7 days** of a typical
player's income, 2.9 for a light one — nobody who wants a guild is priced out,
and nobody makes one by reflex. The alternative is thousands of one-member guilds
with a name and no people, which is worse for the guild-ads channel than any
spam rule could fix.

**Stated in runes, like the balance cap.** A founder is spending exactly one rune
they will not build, which is a trade they can feel without a table.

**Not refundable on disband**, for the same reason a rune is destroyed on
replacement: *committing is what costs.* An escrowed fee would make founding
free-if-you-change-your-mind, which is the reflex the price exists to slow.

> **It pairs with the allowance gate to kill vanity guilds twice.** A one-member
> guild has already paid 650 **and** cannot advertise, since guild funds require
> **3 members active in 7 days** (`11-social.md`). Neither rule alone is decisive;
> together they mean a guild that never recruits is a rune thrown away in silence.

#### Founding is a third door out of the beginner league

**Creating a guild ends the starter week exactly as joining one does** — the
founder is in a guild, and no guild member is ever in the beginner league. So the
warning fires on **three** doors, not two: **an invitation, an application, and
creation.**

This is easy to miss because creation does not feel like joining, and it is very
reachable: a starter player earns **432/day**, so 650 is **1.5 days** — well
inside their protected week.

#### There is no guild tag — **settled 2026-07-28**

A 2–4 character tag alongside the name was proposed by the guild-creation screen
and is **removed.**

> **It is the only free-text field in the design short enough to be
> un-moderatable.** Everything else a player authors — a username, a recruiting
> pitch, a chat message — can be *read in context* and judged. **Three characters
> cannot be**, which is precisely why abbreviated tags are where slurs concentrate
> in every game that has them. A blocklist does not fix it either: the whole point
> of a tag is compression, and compression is what defeats matching.

**Nothing is lost.** The **name** identifies a guild and the **emblem** expresses
it — 36 icons across two palettes — so a tag adds a third identity field carrying
no information the first two lack.

**That leaves the guild name as the only player-authored string on a guild**, and
it inherits the username model in `11-social.md` unchanged: **reportable, a forced
rename is free, a voluntary one is sold.**

#### A new guild is active for its first two weeks — **settled 2026-07-28**

> **A guild founded within the last 14 days counts as active regardless of
> headcount.** After that, the ordinary rule applies: **3 members active in the
> past 7 days** (`11-social.md`).

**Without it the gate eats its own young.** Guild funds require three active
members; a guild founded today has **one**, so it cannot advertise at the exact
moment it most needs to. The rule written to starve dead guilds would have
starved newborn ones identically, and they are opposite things.

**It is a change to the definition, not an exception to the allowance** — a new
guild is *active*, full stop, so anything else ever gated on activity inherits the
same grace without needing to know about it.

**Fourteen days is the right length because it is the same bar, later.** A guild
that has not found two other people in a fortnight — with 4 ad posts a day for the
whole of it — is precisely what the gate was written for, so the grace expiring is
the gate working rather than the gate relenting.

### Joining — invites and applications — **settled 2026-07-28**

> **Both are free. The side that *receives* the request is the side that decides,
> and its decision completes the join.**

| | Who asks | Who decides | Accepting… |
|---|---|---|---|
| **Application** | the player | **the guild** | joins them immediately |
| **Invite** | the guild | **the player** | joins them immediately |

One rule, stated once: **whoever is asked, answers.** There is no second
confirmation step on either path, because the deciding party has already made the
decision that matters and a confirm-your-confirm is friction without a purpose.

#### Applications are concurrent, and the first acceptance wins

> **A player may hold several applications at once. A later one does not
> invalidate an earlier one. The first guild to accept is the guild they join,
> and every other application is withdrawn automatically at that moment.**

**Exclusive applications were the alternative and they strand people.** If
applying to guild B withdrew the application to guild A, a player waiting on a
guild that never reviews its queue is simply stuck — and they cannot tell a slow
guild from a dead one. Concurrency costs nothing and removes that failure
entirely.

**The contract must be stated where they apply**: *apply to as many as you like —
the first to say yes is the one you join.* Said plainly up front, first-acceptance
is a clear deal rather than a surprise, and a player controls it by only applying
where they would be happy to land.

#### Without a cost, the limits have to be structural

**Applying and inviting are both free**, so nothing about the price stops a player
papering 500 guilds or a guild carpet-inviting the server. Caps do that instead:

| | Limit | Expiry |
|---|---|---|
| Concurrent applications per player | **5** | 7 days |
| Outstanding invites per guild | **10** | 7 days |
| Re-applying after a dismissal | **24h cooldown**, that guild only | — |

Expiry matters as much as the cap: **it is what stops a review queue rotting**,
and it means a guild that goes quiet does not silently hold anyone's application
hostage. All three numbers are tunable and none is load-bearing.

#### Filling the last slot is a race, and it resolves honestly

A guild with one open slot can hold ten outstanding invites and a queue of
applicants. **The first acceptance to commit takes the slot; every other
acceptance fails with *the guild is full*.** No reservation, no queueing, no
partial state — the cap of 24 is checked at the moment of joining and nowhere
else.

> **This is why acceptance-as-an-offer was rejected.** Letting a guild "accept"
> and then having the player confirm sounds more polite, but a guild with 3 slots
> would extend 8 offers to fill them and could receive 8 acceptances — so slots
> would need reserving, reservations would need expiring, and a two-step handshake
> becomes a small state machine. The race is simpler and its failure mode is one
> honest message.

#### Dismissal is told, and unexplained

A dismissed applicant **is notified plainly** — ghosting a queue is worse than a
refusal, and an application that silently expires teaches a player nothing.
**There is no reason field.** A free-text rejection sent to someone who was just
turned down is a harassment vector with no upside, and the 24-hour cooldown does
the work a reason would have.

#### Guilded players may apply; they may not advertise

**Applications and invites are open to players already in a guild** — accepting
one leaves their current guild, as a confirmed action that says so. Requiring
someone to quit first and *then* apply would leave the rejected homeless, which is
a cruel way to run a transfer.

> **Posting in Guild Ads is different and stays guildless-only.** The distinction
> is visibility, not status: **a public post is seen by the guildmates you are
> leaving; a private application is not.** One is quietly looking around; the
> other is an announcement.

### No guild member is ever in the starter league — **settled 2026-07-28**

> **Joining a guild ends a player's starter week immediately, and leaving the
> guild later does not restore it.** Guild membership and starter membership are
> mutually exclusive.

Full reasoning in `09-matchmaking.md` → *Joining a guild is the third exit*. Two
things it buys the guild system specifically:

- **It removes a class of edge case from the list below.** Assignments **lock when
  an event starts**, so a member graduating mid-event would change their own
  scoring context *after* the lock. That cannot happen if the two states are
  exclusive.
- **It is not an anti-exploit rule**, which is worth knowing before anyone
  "improves" it. Parking members in the bot pool gains a guild essentially nothing
  — a starter wins far more often but banks **no holds**, and the two cancel to
  within 3%.

**Both doors warn**: receiving an invitation *and* applying to a guild. The
warning must name **beginner status and the 1.5× beginner bonus separately**,
since a player told only that they are leaving the starter league has not been
told their income drops.

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
| **Participation floor** | every filled slot in a Wing that posted a score | nothing — flat |
| **Bracket** | every filled slot in a Wing that places | steeply, toward the top |
| **Guild share** | every filled slot, on top | the guild's rolled-up standing |

> **Every layer pays per filled slot.** Not per Wing, not per guild, and never as
> a fixed pot divided among whoever is present.

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
so it collects seven units at every layer for the rest of the season. Kicking is
therefore self-harming in the floor, the bracket *and* the tally — the same
incentive shape the lock already relies on, arriving without a rule of its own.

### The inverse exploit, and why per-slot closes it too

Paying a **fixed pot per Wing, divided among whoever is present**, looks fairer
and is worse. A seven-member Wing would take a larger share each than an
eight-member one, so **short Wings would pay more per head** — the same 8×
small-guild advantage as a per-Wing floor, arriving from the opposite direction.
Officers would have a live incentive to run thin Wings, and the assignment lock
would be protecting a decision that was already corrupted.

Per filled slot closes both doors with one rule.

> **What this does *not* do is penalise a member for their guild being
> short-handed.** An individual receives the same per-slot amount whether their
> Wing holds seven or eight; what shrinks is the Wing's aggregate. Nobody is paid
> less because a teammate left, and nobody is paid more either.

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

### Sizing is per event; the shape is not

> **Magnitudes are configured per event. The structure is fixed.**

| Fixed for every event | Configured per event |
|---|---|
| Paid **per filled slot**, at every layer | The size of the floor |
| A **participation floor** reaching any Wing that scores | The bracket values and how many brackets |
| Brackets climbing **steeply** above it | Where the bracket cut-offs fall |
| A **guild share** on top | The metric tallied, and the duration |
| Scores **reset** when winnings are paid | |

So an event is **data** — `{metric, duration, payout ladder}` — rather than code,
and a small weekly event and a headline seasonal one differ only in their
numbers. That is worth knowing before the schema is written.

**Two invariants should survive any tuning.** The floor has to stay large enough
to be felt — see the sanity check below — and the spread has to stay
*deep-floor, steep-top*, since that is what makes participation safe without
making ambition pointless.

### A calibration example

Numbers mean nothing without the earn rate beside them. Against a **4-week
season**, a typical player earns **10,864 shards** — about **17 complete runes** —
from ordinary play (`06-progression.md`). A ladder that lands correctly against
that:

| Bracket | Reaches | Per filled slot | In runes | Share of a season's earnings |
|---|---|---|---|---|
| **Participation floor** | any Wing that posts a score | **300** | 0.5 | 2.8% |
| Placed | top 35% | 700 | 1.1 | 6.4% |
| High | top 10% | 1,600 | 2.5 | 15% |
| Elite | top 1% | 4,000 | 6.2 | 37% |
| **Apex** | top 10 Wings | **9,000** | 13.8 | 83% |

Worked through for one member over one season: a slot in a **top-10% Wing inside
a placing guild** takes 1,600 plus a ~400 guild share, so **2,000**; a slot in a
**bottom Wing whose guild places nowhere** takes the floor, **300**. A **6.7×
spread with nobody at zero** — which is the deep-floor, steep-top shape this
section is built around.

> **A useful sanity check for any proposed figure:** 50 shards a slot — a
> plausible-sounding number — is **0.5% of a season's earnings**, or about a
> fourteenth of one rune. Guild rewards have to be denominated in runes to be
> felt at all.

> **The shares moved when `06-progression.md`'s daily curve landed** and ordinary
> earnings rose from 9,240 to 10,864 over four weeks. **The payout figures did not
> move** — they are round numbers chosen against the rune price, which is
> unchanged. Only the percentage column, which is derived, is different.

**Season length is the free variable, and it scales everything above.** Four
weeks is proposed: the top bracket then pays roughly *one hero fully runed*,
which is a unit a player can picture, and a season is short enough that a bad one
is not punishing. A two-week season halves every figure; an eight-week season
doubles them.

### What launch actually ships — a weekly tournament

**Decided 2026-07-27.** The seasonal ladder above stays as the calibration
reference, but v1 runs **one weekly event with smaller payouts**, adding cadence
and event types as the population grows.

#### The bracket count grows with the population

> **Every bracket is a percentile. None is an absolute count.**

The calibration ladder mixes the two — Elite is *top 1%*, Apex is *top 10
Wings* — and that inverts at any realistic launch size. Wings are guilds × 3:

| Full guilds | Wings | "Top 10 Wings" is really | "Top 1%" is |
|---|---|---|---|
| 10 | 30 | **top 33%** | 0.3 Wings — nobody |
| 20 | 60 | **top 17%** | 0.6 Wings — nobody |
| 50 | 150 | top 6.7% | 1.5 Wings |
| 100 | 300 | top 3.3% | 3 Wings |
| **334** | **1,002** | top 1.0% | 10 Wings |

Below roughly **334 full guilds — about 8,000 players — Apex is easier to reach
than Elite**, so the 9,000-shard bracket pays out more often than the 4,000 one
and the ladder runs backwards. At launch it would reach one Wing in three.

Percentiles alone break at the other end too, since top 1% of 30 Wings is nobody.
So the ladder **adds brackets as the population supports them**:

| Population | Brackets live |
|---|---|
| Launch — under ~150 Wings | **Floor · Placed (top 35%) · High (top 10%)** |
| ~150–1,000 Wings | + Elite (top 1%) |
| Above ~1,000 Wings | + Apex (top 0.1%) |

#### The weekly ladder

**A straight quarter of the seasonal figures does not work.** Weekly ordinary
earnings are 2,716 shards (10,864 ÷ 4), and 300 ÷ 4 is a **75-shard floor** —
0.12 of a rune, barely above the 50-shard figure the sanity check above calls too
small to feel. Percentages scale linearly; *"feels like a reward"* does not.

| Bracket | Reaches | Per filled slot | In runes | Share of a week's ordinary earnings |
|---|---|---|---|---|
| **Floor** | any Wing that posts a score | **150** | 0.23 | 5.5% |
| Placed | top 35% | 400 | 0.62 | 15% |
| **High** | top 10% | **900** | 1.4 | 33% |

A 6× spread with nobody at zero — the same deep-floor, steep-top shape, and the
floor alone puts about **one rune a month** in a participating player's hands.

#### Two things this removes from v1

- **The always-on ladder is deferred.** *Two competitions, not one* justifies it
  because "a Wing is inert except during an event, which is most of the time."
  With a weekly cadence that is no longer true, so the ladder — and the seasonal
  reset it requires — can wait.
- **The launch event may simply count attack victories.** The constraint that
  events must avoid this exists only so they do not duplicate the ladder. With no
  ladder, the simplest possible metric is available, and the metric menu becomes
  what it should be: the reason to add a *second* event type later.

#### The lock needs a weekly window

Assignments freeze at event start, so a weekly event means a weekly freeze.
**The event runs 6 days and Wings unlock for 1**, on a fixed weekday. That gives
officers a real reassignment window rather than a few minutes, and it satisfies
the pre-lock publication requirement in *One scheduling consequence* without
needing a separate announcement channel.

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

#### The default event counts both halves — **settled 2026-07-28**

> **One point per attack victory, one point per hold, and a small bonus for
> beating someone rated above you.** Attack points inherit the daily curve;
> hold points do not — exactly as shard income already works.

**Both halves, because the game has two of them.** An attack-only tally makes the
event a participation contest and ignores the Standing Six entirely; a hold-only
tally rewards a thing players cannot schedule. Counting both is the only version
where a good defensive builder and a good attacker are both competing.

**They are already the same size, which is what makes a flat point work.** A
typical day is **~10 attack victories** and **~8.6 holds** — 6.8 Visible at a 40%
hold rate, 1.8 Hidden at 60%. No weighting is needed to keep either half
relevant:

| Weighting | Attack share | Verdict |
|---|---|---|
| **1 point per victory, either kind** | **54%** | **Chosen** — balanced by arithmetic, not by tuning |
| Points mirroring shard values (2 / 4 / 1 / 2) | 70% | Attack dominates; defeats the purpose |

**Attack points inherit the daily curve, holds stay flat.** The 1.5× / 1.0× / 0.5×
tiers on the first five, next fifteen and everything beyond already govern shard
income, and holds are already never tiered. Reusing them costs nothing and stops
an event from rewarding a pattern of play the economy deliberately taxes. The
compression it buys is the whole argument:

| Player | Attack pts | Hold pts | **Total** | vs. typical |
|---|---|---|---|---|
| Light — 5 victories | 7.5 | 8.6 | 16.1 | 0.76× |
| **Typical — 10 victories** | 12.5 | 8.6 | **21.1** | **1.00×** |
| Heavy — 21 victories | 23.0 | 8.6 | 31.6 | **1.50×** |

**A heavy day is worth 1.5× a typical one, not 4×** — which is what an untiered
count would have produced. Playing more still wins events; it cannot win them
alone.

**The punching-up bonus is +0.5, and it applies to both halves.** A victory over
a defender rated above you, or a hold against an attacker rated above you, scores
1.5 rather than 1.

> **It cannot be farmed, and the rating is why.** The usual objection — park below
> a threshold and harvest easy upward wins — needs an *accumulating* rating to
> work. This one **converges**: every win over someone above you raises your own
> number and shrinks the pool still above it. The exploit closes itself, which is
> the same property that disarmed opponent-farming.
>
> The defensive half cannot be farmed at all, since **a defender never chooses who
> attacks them.** That asymmetry is a feature — it is the half of the score that
> is pure quality with no volume term available.

**This is the *default* event, not the only one.** The four other metrics in the
table above remain authorable as variants; what is settled is what a plain event
counts when nothing special is being asked for.

##### The sandbag this actually has to survive is skill, not gear

**Leagues bound gear. Nothing bounds skill.** Rating *orders* within a league and
never restricts it (`09-matchmaking.md`), so a skilled player holding a low gear
score is the apex predator of a weak pool — and low leagues will genuinely hold
lower-skill players on average, since low gear correlates with being new or
casual. Before an event, staying down is worth something **even with no gear
advantage at all.**

This is the real version of the sandbag question, and it is sharper than the gear
one: a hoarder faces their own *gear* level, but a skilled sandbagger faces their
own gear level and **not** their own skill level.

**Both halves of the settled metric push against it, and together they absorb
most of it.** Twenty battles a day, a skilled player winning 90% sandbagged
versus 55% at true gear:

| | Attack pts | Punch-up | Holds | **Total** | vs. honest |
|---|---|---|---|---|---|
| Sandbagged in Bronze — 18 victories | 20.5 | +0 | 8.6 | **29.1** | **1.17×** |
| At true gear, high league — 11 victories | 13.5 | +2.75 | 8.6 | 24.9 | 1.00× |

**1.52× on raw attack victories alone, 1.26× once the punching-up bonus applies,
1.17× once holds are counted.** Two rules chosen for other reasons turn out to be
the defense:

- **The punching-up bonus is worth nothing to a sandbagger.** At the top of a low
  league by rating, there is nobody above them to beat. It pays the honest player
  and not the parked one — which is the whole shape of the exploit, inverted.
- **Holds are a flat term neither player can farm.** ~8.6 points arrive regardless
  of league, diluting whatever edge the attack half carries. Counting both halves
  narrows the gap for a reason entirely separate from why it was chosen.

**Accepted at 1.17×, which is well under the 1.8× rune-destruction sandbag already
accepted** in `09-matchmaking.md`. Recorded rather than fixed, because the fix has
a real cost:

> **The drafted stronger fix is to scale a point by the rating gap** rather than
> paying a flat +0.5 above and nothing below. It closes the sandbag almost
> entirely — farming far-below opponents would pay a fraction of a point — at the
> cost of a rule a player can no longer hold in their head. *One point a win, half
> a point more for punching up* survives being said out loud; a curve does not.
>
> **`packages/sim` should measure the real spread before adopting it.** The 1.17×
> above assumes a 90% sandbagged win rate, and if low-league skill is less thin
> than assumed the figure falls further on its own.

### ~~1a. Do event battles feed the personal attack streak?~~ — **settled 2026-07-28: they count**

> **An event battle is an ordinary battle. It advances the attack streak like any
> other, and no rule distinguishes them.**

The consequence is real and intended: a heavy event week raises everyone's ambush
chance at once, and near the **90% cap a victory-counting event quietly becomes a
Hidden-squad event.**

**That is the design working, not leaking.** `02-squads.md` states outright that a
win streak is *the key to the better fights, not a liability* — so an event that
drives players into Hidden battles is delivering exactly what the streak was built
to deliver, at the moment they are playing hardest. Hidden pays **2× rating** and
roughly double the shards, so the escalation pays for itself.

**And it self-limits.** A high ambush rate means unscoutable opponents, which
means harder battles, a lower win rate, and a broken streak. The mechanic that
inflates it is the same one that corrects it; there is no runaway available.

Both alternatives cost more than they save:

- **Excluding event battles** makes the streak silently stop counting a player's
  real wins. Someone on a genuine twenty-win run would see a number disagreeing
  with what they just did — a worse failure than the inflation it prevents.
- **Pausing the streak** avoids both errors and adds a third state to build,
  explain and display, plus an odd window where **losing during an event is
  consequence-free**, which is its own small exploit.

### ~~2. Does the Hidden zone participate?~~ — **settled 2026-07-28: yes, and no Wing streak**

> **Hidden victories and Hidden holds score exactly like Visible ones — one point
> each. There is no collective Wing streak; ambush stays personal.**

**Participation needs no rule at all.** An event counts victories and holds, and a
Hidden battle produces both. Nothing has to be added for the zone to appear in the
tally, and 1a above already routes players into more Hidden battles during an
event as a side effect of the streak.

**Not weighting them is the deliberate part.** Hidden already pays **2× rating**
and roughly double the shards; scoring it above 1 point in events would be the
**third bonus stacked on one act.** The event tally is the one place the two zones
are counted the same, which is what keeps a Visible-heavy defender competitive in
an event they had no way to opt into.

**No Wing streak, and the reason is that it would be farmable in a way a personal
one is not.** A collective rate lets **eight players manufacture an ambush chance
one player could not** — the streak stops measuring a run of personal wins and
starts measuring headcount. It would also be the first non-personal streak in the
design, a whole new mechanic serving one feature.

> It stays available if events ever need a team-flavoured hook that guild-wide
> scoring does not provide. Nothing here forecloses it; it is simply not worth a
> new streak type today.

### ~~3. How deep does "top Wings" go?~~ — **settled**; the split inside a Wing is not

Depth is answered in *Rewards*: a participation floor reaching every Wing that scores, with steep brackets above it. What remains is only the second half —

The *shape* is settled — top Wings are paid directly, the guild gets a lesser
reward on top. Two things inside that are not:

- ~~**How many Wings count as "top".**~~ — **settled 2026-07-28: graded
  brackets.** Four tiers, **top 10 · top 100 · top 1000 · participation floor**,
  each paying meaningfully less than the one above. Sizes are still open (they
  wait on `06-progression.md`); the *structure* is not.

  **A hard cut was the alternative and it rewards the wrong thing.** With any real
  population a top-10-only list leaves well over 99% of Wings on the floor, so an
  event becomes a formality for nearly everyone — and it actively pushes a guild
  to **stack one Wing and bench the rest**, since spreading across three
  guarantees two of them place nowhere.

  > **The curve has one hard constraint: three mid-tier placements must beat one
  > top placement plus two floors.** That is the whole reason for grading, and it
  > is a property of the *numbers*, not of the structure — so whoever sets the
  > payout sizes has to check it explicitly. Get it wrong and graded brackets
  > reward stacking exactly as a hard cut would.

  **Fixed counts rather than percentiles**, because *top 100* is a target a player
  can aim at during an event and *top 1%* is not. The cost is that the tiers are
  sized for a mature population: at launch, when a few hundred Wings exist, top
  1000 is everyone and the brackets collapse toward the floor. **That degrades in
  the right direction** — early players find the higher tiers unusually reachable,
  which is a good problem at launch and self-corrects as the population grows.
- ~~**Whether all eight members of a paid Wing are paid equally.**~~ —
  **settled 2026-07-28: an even split.** Every member of a placed Wing takes the
  same share, regardless of individual contribution.

  **Proportional payout punishes the same person twice.** Score is already a
  **total**, so a quiet member has already reduced their Wing's placement; making
  their share proportional charges them for it a second time. One penalty per
  shortfall is enough.

  > **It also rebuilds what the assignment lock was written to tear down.** The
  > lock exists so a guild cannot cut a laggard mid-event. A proportional split
  > restores that pressure in a form the lock cannot reach — the Wing can no
  > longer remove you, but it can make sure you know what you cost everyone. An
  > even split is the only version where **a member who falls ill mid-event is a
  > disappointment rather than a liability.**

  **Free-riding is the accepted cost**, and it is small: eight members, a public
  tally, and a total-based score that visibly moves with each contribution. A
  participation minimum was considered and rejected — it recreates the cutting
  pressure in miniature by giving the Wing a reason to watch whether a struggling
  member clears a bar.

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
