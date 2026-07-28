# LMNTLZ · Mechanics 07 — Defense AI

How the engine plays a defense squad.

This is not a fallback for when a human is unavailable. **The engine plays every
defense squad in the game, for every player, always** — a player commands offense
and never plays defense at all. So the quality of what is described here *is* the
defensive half of LMNTLZ, and roughly half of every battle anyone fights.

---

## The defender is a builder, not a spectator

Before this document, a defender's only decisions were **which twelve heroes to
lock into the two zones** and **where to place them** in the 2/3/1 formation.
Everything after the battle started was engine behaviour they had no say in.

> **A defender configures the AI rather than watching it.** The squad is the
> plan; the engine is the executor.

That is the same shape as the rest of the design — *planning over paying* in
`06-progression.md`, and now planning over playing. It also means two defenses
built from the same six heroes can behave completely differently, which is what
stops every defense in the game feeling like the same opponent.

---

## Targeting priority

**Each hero on a defense squad carries a targeting priority**, chosen by the
defender when the squad is built.

### Where it slots in

`04-turns.md` resolves targeting in four stages. Priority is **stage 4 and
nothing else**:

| Stage | Does | Priority's role |
|---|---|---|
| 1 · **Reach** | Which enemies this hero can legally hit | untouched |
| 2 · **Filters** | Fade removes candidates | untouched |
| 3 · **Compulsion** | Taunt forces a target | untouched — **it overrides priority** |
| 4 · **Choice** | Pick from what survives | **this is the priority** |

Both invariants carry over unchanged — a filter that would empty the candidate
set is ignored, and a compulsion naming a hero outside that set does not apply.
**A taunt beats a priority**, always: compulsion resolves first, so a taunting
Tank pulls a defender off its preferred target exactly as it pulls a player.

**Priority is a sort over the survivors of stages 1–3, never a filter** — so it
can never produce "no legal target" where one exists, and it needs no
special-case rule.

### A primary and a fallback, not one choice

> **Each champion carries two targeting rules in order — a primary and a
> fallback.** *"Buffers first, then lowest HP."* Anything still tied after both
> is resolved by the engine.

**Settled 2026-07-27.** This exists because a single rule decides nothing most of
the time. There are only **3 Buffers among 27 heroes** — 12 Strikers, 7 Tanks, 5
Ranged, 3 Buffers — and a defending champion chooses from 2 candidates at reach 1
or 5 at reach 2. Simulated over 200,000 random squads:

| Priority | Candidates | No match | Exactly one | Tie (2+) | **Undefined** |
|---|---|---|---|---|---|
| Buffers first | 2 | **78.7%** | 20.4% | 0.9% | **79.6%** |
| Tanks first | 2 | 54.1% | 40.0% | 6.0% | 60.0% |
| Ranged first | 2 | 66.0% | 31.2% | 2.8% | 68.8% |
| Buffers first | 5 | 52.6% | 39.6% | 7.8% | **60.4%** |
| Tanks first | 5 | 19.3% | 42.0% | 38.7% | 58.0% |
| Strikers first | 5 | 3.8% | 20.3% | **75.9%** | **79.7%** |

**A single role priority leaves the choice undefined 49–80% of the time** —
either nothing matches, or several do and nothing says which. *"Buffers first"*
on a reach-1 defender finds no Buffer at all in **four turns out of five**. The
fallback is therefore not an edge case; it is the rule that usually fires, which
is exactly why it should be the defender's decision rather than a hidden default.

> **This is not an argument about variety.** A single choice already gives
> 9 × 240 = 2,160 configurations per champion and ~10²⁰ per squad; a primary plus
> fallback gives 72 × 240 = 17,280 and ~10²⁴. Nobody exhausts either. The reason
> is that the old rule was **under-specified**, not that it was too small.

**Anything still valid after both rules is decided by the engine.** The defender
configures intent; the engine always produces an answer:

| # | Tiebreak | Whose decision |
|---|---|---|
| 1 | the champion's **primary** rule | defender |
| 2 | the champion's **fallback** rule | defender |
| 3 | **best type matchup** | engine |
| 4 | **nearest row** | defender, indirectly |
| 5 | **seeded random** among what remains | engine |

**Step 3 keeps the engine from making obvious mistakes.** Type effectiveness runs
×1.50 Bane · ×1.25 Fault · ×1.00 · ×0.80 · ×0.50, so a champion that swings into
a resist when a Bane was available deals **three times less damage** for no
reason. That is not a strategic choice a defender might want, it is an error —
and an engine that visibly errs undermines the premise that it plays every
defense in the game.

**It sits *below* both configured rules on purpose.** A defender who says
*"Buffers first"* still gets a Buffer; type matchup only chooses *which* Buffer,
or steps in once the configured rules run out. The plan always wins over the
optimizer. **"Best type matchup" is also on the menu** for a defender who wants
it as their stated plan rather than as a tiebreak.

> **This fixes the evaluation order, which was undefined.** Type effectiveness
> depends on the *power* — a dual-typed power takes the better of its two types
> (`01-stats.md`) — so the power must be known before the target can be scored.
> **Power preference resolves first, then targeting.**
>
> **The engine deliberately does not re-rank powers to chase a matchup.** It could
> notice that a lower-ranked power would be super-effective and fire that instead
> — and it must not, because the power ranking is the defender's lever and the
> source of the 240 rotations below. An optimizer that overrides it would collapse
> every defense toward the same choice, which is the greedy failure wearing a
> smarter hat.

**Step 4 stays tactical on purpose.** Row placement is a deliberate choice a
defender already makes, so breaking a tie on proximity honors the build rather
than leaking from it — and hitting what is closest is a defensible default in its
own right.

> **Step 4 is random rather than squad slot, and that is the point.** Ordering by
> slot would make a defense behave differently depending on the order its
> champions happened to be added — a decision surface the defender never knew
> they were using, and one a competitive player would eventually find and farm.
> Randomizing removes it.

**Random here means the server's seeded stream**, the same one behind accuracy,
crits and rider contests. The seed never leaves the server (`docs/tech-stack.md`)
and in-progress state is re-derived from the append-only action log, so the draw
must be reproducible from seed plus draw order — which it is, exactly as every
other roll in the game is. Replays are stored event logs and never re-simulated,
so nothing there is affected either.

**One architectural consequence.** `packages/sim` splits into *rules* — pure,
shared, no RNG — and *resolver* — RNG, server only. Targeting therefore splits
with it: **stages 1–3 and tiebreaks 1–3 are rules**, computable on the client for
a preview; **tiebreak 4 is resolver**. The client can show which champions are
legal targets and which one the configuration prefers, and cannot always predict
which is struck.

### Defaults come from the role

A squad saved without targeting rules — a new account, or a player who never
opened the control — **must not fall straight to random.** Each role carries its
own default pair, **which any explicit selection overrides.**

The defaults are not invented: three of the four role passives already name the
rule their role should want.

| Role | Role passive rewards | Default primary | Default fallback |
|---|---|---|---|
| **Striker** | `Finish It` — bonus damage below half pool | **Lowest current HP** | nearest row |
| **Tank** | `Hold the Line` — row-scoped taunt, it holds a line | **Highest `Might`** | nearest row |
| **Ranged** | `Measured Shot` — bonus damage at **distance 2** | **Furthest reachable** | least Armor / Magic Resist |
| **Buffer** | `Behind the Line` — permanent fade, survives to support | Lowest current HP | nearest row |

> **`Measured Shot` requires a menu entry that did not exist.** It pays Ranged for
> striking at the far edge of its reach, and *every* option on the current menu
> would push a Ranged champion toward something else. **Add "furthest reachable"
> and "nearest reachable"** — distance is a question a defender can obviously ask,
> and one role is already built around the answer.

**Two distance entries, not three.** At base reach a middle band cannot occur:
reach caps at 2 and counts a champion's own rows, so from any seat a champion
sees **at most two enemy rows** — rows 4–5 from the front at reach 2, or rows 5–6
once the enemy front falls. Empty-row skipping shifts the window without widening
it.

> **The Air rune breaks that ceiling, and code must not assume it holds.**
> `Further Than It Looks` (`06-progression.md`) grants **+1 reach for a turn**, so
> a reach-2 champion in the front seat reaches rows 4, 5 *and* 6 — three enemy
> rows, with a genuine middle. **Any implementation that assumes at most two
> reachable rows is wrong.** The reach window is computed, never bounded by a
> constant.

**So the menu carries three distance entries, and *middle* degrades to
*furthest*** whenever fewer than three rows are reachable. Priority is a sort
rather than a filter, so the degradation needs no special case — it falls out of
the same mechanism everything else uses.

**Degrading to furthest rather than nearest is the point.** A defender choosing
*middle* is asking to get **past the front line**; dropping them onto the front
row when the window narrows would invert the instruction rather than approximate
it.

The two are not near-duplicates when all three rows *are* in range: the 2/3/1
formation puts **three champions in the middle rank and one in the back**, so
*middle* takes the fattest rank while *furthest* takes the back seat. And pairing
*middle* with `Further Than It Looks` is a coherent build in its own right — the
rune buys the extra row, the priority says what to spend it on.

Absolute row entries — *front row first*, *back row first* — are still not worth
adding. With reach bounding the candidates they return the same champion as
*nearest* and *furthest* in every configuration, so they would be longer names
for options already present, on a menu this document requires to stay short
enough to read on a squad-builder row.

**An unconfigured defense should be competent, not incoherent.** Randomness is a
tiebreak of last resort, never a default strategy.

#### On publishing the defaults

Documenting them means some players will never change them, and those defenses
become predictable. **That is a skill floor rather than a repeat of the greedy
problem**, and the difference is worth stating because the two look alike:

- Greedy was a defect because **nobody had a lever** — every defense behaved
  identically regardless of how much thought went into it, and one learned
  opening covered 63% of the roster.
- Role defaults leave the lever in place. A player who configures beats one who
  does not, which is the pressure that makes the control worth opening.

An unconfigured squad also shows **up to four distinct behaviours** rather than
one, since the defaults are per role and a squad of six typically spans three or
four roles.

**Power preference carries per-role defaults for the same reason** — see *The
default ranking is per role*. They are drawn from the 12 orderings that are safe
for every hero, so an unconfigured defense can never have a power silently
switched off.

---

## Targeting an ally

**A friendly power needs a target choice exactly as an attack does**, and until
now nothing described one — stage 1 above reads *"which **enemies** this hero can
legally hit."* A Buffer deciding who to heal is the single targeting decision
that most determines whether a defense survives.

> **A champion that owns at least one friendly power carries one additional
> rule: who to help.** It is a single choice, not a pair — the ally menu
> discriminates far better than the enemy one, so a fallback earns much less.

**The control appears only when the champion owns a friendly power.** Most squad
rows show two dropdowns; a few show three. That keeps the interface honest about
which champions actually face the decision.

Reach applies unchanged — `02-squads.md` states one reach rule with no
exceptions, so **a heal is range-limited exactly as an attack is.** Taunt and
fade do not apply, being properties of enemy targeting, so friendly selection is
stage 1 and stage 4 only.

### The menu, and the trap in it

| Option | Asks |
|---|---|
| **Lowest HP percentage** | who is most hurt |
| Lowest current HP | who has the smallest pool left |
| Tanks first · Strikers first · Ranged first · Buffers first | which role is worth keeping alive |
| Most damaged | who has lost the most absolute HP |

> **Lowest HP *percentage* and lowest *current* HP are not the same question, and
> confusing them is a live trap.** `HP = Toughness × 50` with `Toughness` from 25
> to 40, so maximum pools run **1,250 to 2,000**. A Tank at 1,300 of 2,000 — 65%
> and in real trouble — holds *more* current HP than an untouched Buffer at
> 1,250 of 1,250. A "lowest current HP" heal would pass over the wounded Tank to
> top up a Buffer at full health.

**The default is lowest HP percentage**, for every role, because it is the only
entry that means *"whoever is most hurt"* — which is what a player assumes a
healer does.

**Two dropdowns, not a ranking widget.** A full ordered ranking of the whole menu
was considered — it matches how power preference works and would be internally
consistent — but it puts a nine-item ranking on each of twelve defense champions
alongside the six-item power ranking already there. Two rules cover the case that
actually fires, and the third and fourth tiebreaks cost the player nothing.

### The menu

Two families, and the class-based ones are the more legible half.

| By role | By state |
|---|---|
| Strikers first | Lowest current HP |
| Tanks first | Highest current HP |
| Ranged first | Least Armor / Magic Resist |
| **Buffers first** | Most Armor / Magic Resist |
| | Highest `Might` |

**Role targeting is the stronger idea.** *"Focus the Buffers"* is a real plan a
player can reason about before the battle exists — the three Buffers carry the
heals, so cutting them first is a coherent strategy. State-based priorities are
more granular but harder to configure well, because the defender is choosing
against a battle state they cannot see.

The exact menu is open; what matters is that it stays **short enough to be
readable on a squad-builder row** and that every entry answers a question a
player can actually ask.

---

## Power preference

**Each hero also carries an ordered ranking of its six powers.** The engine fires
the **highest-ranked power that is off cooldown and past its gate** — tier 4 from
turn 3, tier 5 from turn 5 (`03-powers.md`). The tier-0 auto-attack has a
cooldown of 0 and no gate, so a legal choice always exists and no fallback rule
is needed.

That is the whole algorithm. **The defender's entire interface is two ordered
lists per champion** — a **pair** of targeting rules and a **ranking** of all six
powers, who to hit and which power to use — and nothing else.

### Why ranking beats firing the biggest thing available

The obvious rule is greedy: always fire the most expensive available power, so
its cooldown starts sooner. Measured against the real cooldown ladders, greedy
distributes tiers *well* but makes every defense in the game behave the same:

| | Distinct rotations across 27 heroes | Distinct openings |
|---|---|---|
| **Greedy** | **4** | **1** — every hero opens `3·2·4·1·5·3` |
| **Preference order** | **240** per hero | **64** per hero |

Seventeen of the twenty-seven heroes share a single greedy rotation. An attacker
who learns one opening has learned **63% of the defenses in the game** — which is
precisely what the targeting layer exists to prevent, undone one layer down.

Greedy's tier distribution is genuinely healthy, and worth recording so it is not
"fixed" later: **4.6% tier 0 · 19.6% tier 1 · 23.3% tier 2 · 23.5% tier 3 · 16.4%
tier 4 · 12.6% tier 5.** The cooldown ladder was retuned once already to achieve
that. The problem is not *what* greedy fires — it is that every hero fires it in
the same order.

At squad level, ranking gives **240⁶ ≈ 1.9 × 10¹⁴** behavioural combinations.

### A ranking can silently delete powers — and most of them do

> **A power only ever fires when everything ranked above it is on cooldown.**

That one sentence has consequences the ranking model did not account for. The
tier-0 auto-attack has **cooldown 0 and no gate**, so it is available every turn —
which means **anything ranked below tier 0 never fires at all.** Simulated over
60 turns for all 27 heroes:

| Ranking | t0 | t1 | t2 | t3 | t4 | t5 |
|---|---|---|---|---|---|---|
| **`5·4·3·2·1·0`** — greedy | 5.4 | 18.8 | 23.6 | 23.6 | 16.7 | 11.9 |
| `0·5·4·3·2·1` — tier 0 first | **100** | 0 | 0 | 0 | 0 | 0 |
| `5·4·0·3·2·1` — tier 0 third | 71.4 | **0** | **0** | **0** | 16.7 | 11.9 |
| `1·2·3·4·5·0` — cheap first | 0 | 50.0 | 25.0 | 25.0 | **0** | **0** |

*(This also validates the model: greedy's simulated 5.4/18.8/23.6/23.6/16.7/11.9
reproduces the published 4.6/19.6/23.3/23.5/16.4/12.6 closely.)*

**Cheap powers ranked high starve expensive ones**, because availability scales
with `1/(cooldown+1)`. `1·2·3·4·5·0` puts tier 1 on top, and both ultimates go to
**exactly zero**.

Enumerating all 720 orderings against every hero:

| Powers still firing ≥1% of turns | Share of the 19,440 hero × ordering pairs |
|---|---|
| 1 | 16.7% |
| 2 | 16.7% |
| 3 | 19.2% |
| 4 | 24.4% |
| 5 | 20.2% |
| **6 — all live** | **3.0%** |

**Only 3% of orderings keep a whole kit working**, a median of 13 per hero. So the
240 distinct rotations are real, but most of them are varied *because* they have
switched powers off.

**Two things follow.**

- **The squad builder must show which powers will actually fire** under the chosen
  ranking. Without it, a player ranking casually disables half their kit and never
  learns why their defense is weak. This is not a nice-to-have; it is the
  difference between a lever and a trap.
- **Every default must come from the safe set.** Exactly **12 of 720 orderings are
  healthy for all 27 heroes**, and every one of them ends **`1·0`** — tier 1
  second-to-last, tier 0 last. That is a structural rule, not a style.

### The default ranking is per role

**Settled 2026-07-27**, matching how targeting defaults work, and chosen from the
12 universally safe orderings so no default can ever delete a power:

| Role | Default ranking | t0 | t1 | t2 | t3 | t4 | t5 | Why |
|---|---|---|---|---|---|---|---|---|
| **Striker** | `5·4·3·2·1·0` | 5.4 | 18.8 | 23.6 | 23.6 | 16.7 | **11.9** | `Finish It` pays for closing out — burst first |
| **Tank** | `4·3·2·1·5·0` | 3.7 | **24.0** | 24.2 | 24.5 | 16.7 | **6.9** | `Hold the Line` wants presence over spike; the only safe ordering that trades the ultimate for uptime |
| **Ranged** | `3·5·4·2·1·0` | **2.0** | 22.6 | 25.0 | 25.0 | 14.1 | 11.3 | `Measured Shot` pays a lower stat budget for reach — the lowest tier-0 share, so it is rarely reduced to a ×1 auto |
| **Buffer** | `4·5·2·3·1·0` | 3.1 | 18.0 | **30.8** | 19.5 | 16.7 | 11.9 | `Behind the Line` keeps it alive to sustain — mid-tier cadence |

Four distinct openings instead of greedy's one, all verified to keep every power
live on every hero.

> **The role→ordering mapping is a proposal; the safety is not.** All four are
> measured, and no default can switch a power off. Which ordering suits which role
> should still be checked against what each role's tier-2 and tier-3 powers
> actually *do* — the Buffer assignment in particular assumes its mid tiers carry
> the support, which nobody has verified.

### Why not scripting the opening instead

Letting a defender choose their first three powers and running greedy afterwards
was the other candidate. It is the lightest interface of the three, and the
opening is where front-loading matters most.

It was dropped on arithmetic: **a battle runs roughly 13 turns per hero**
(`01-stats.md`), so a three-power script configures **under a quarter** of a
hero's fight and greedy runs the rest. Defenses would diverge early and converge
late — and the gates mean tier 5 can never appear in an opening script at all,
with tier 4 only reachable in the third slot. A ranking governs every turn from
the same single setting.

**An attacker never sees a defender's priorities**, in either zone, on the
Visible squad or the Hidden one.

That is a deliberate departure from how open the rest of the design is. The
Visible squad is scoutable, hold streaks are public per zone, and ambush chance
is always displayed — priorities are the exception.

**Scouting loses nothing that matters.** An attacker still reads the six heroes,
their primary and secondary types (and therefore their Banes and Faults), the
2/3/1 formation, and their rune fill — see below. The type profile is the
headline read and it is untouched. Priority is a layer on top, not the substance.

**And replays make it discoverable.** Replays are stored JSON event logs
(`../../docs/tech-stack.md`) rather than re-simulations, so a player who reviews
a battle can work out exactly who each defender chose and infer the rule behind
it. Combined with the existing Battle Record screen, that makes **remembering an
opponent a genuine edge** — the information is not given away, but it is
available to anyone who does the work.

> **Not hidden to create mystery — hidden so that learning it is worth
> something.** A player who studies the opponent they keep losing to can beat
> them next time. That is the intended shape.

The honest cost: a **first** encounter turns partly on the unknown. That is
acceptable for ordinary attacks and actively desirable for ambushes, which are
supposed to be the dangerous ones and pay double (`06-progression.md`) for
precisely that reason.

---

## What a scouted Visible squad reveals

Scouting is a `02-squads.md` concern, but it is settled here because it is the
same question as targeting priority: **what does an attacker learn before
committing?**

| Shown | Hidden |
|---|---|
| The six heroes, their primary and secondary types — so their Banes and Faults | **Every stat value**, base or runed |
| The 2/3/1 formation | **Which stats** any rune boosts |
| Each hero's **three rune slots, their elements, and how many stages each has reached** (0–4) | **Which utility effect** a completed slot holds |
| | **Targeting priority** |

### The element of a slot is free information

A hero's slots are always *primary · secondary · common*, and both elements are
public — Bramwen's are always Earth, Fire, Common; Vantric's are always Pierce,
Air, Common. **Showing the element discloses nothing derivable-in-principle**, so
it is a readability choice rather than a disclosure one. The only real disclosure
is the **fill state**.

### Fill shows commitment, never power

This is what makes the display safe, and it follows directly from
`06-progression.md`: **spending is not effectiveness.** Measured at an identical
1,950-shard spend on one hero, the best allocation scored roughly **3.35×** the
worst. So a full set of pips means a player *committed*, not that they committed
*well*.

Three consequences, all of them good:

- **Deterrence becomes unreliable**, which mostly dissolves the problem that a
  visibly strong Visible defense would be attacked less and therefore earn fewer
  holds. A scary-looking squad may be badly built.
- **Bluffing is a real strategy.** Filling every slot cheaply and carelessly reads
  as a finished defense. No other disclosure level allows that.
- **Reading becomes judgement rather than arithmetic** — the skill is guessing
  whether an opponent's investment is likely to be well spent, not reading a
  number off a card.

### What a completed slot actually tells an attacker

A lit fourth pip means a utility effect from that slot's pool is live. With
roughly four effects per pool, that narrows the possibilities from ~35 to ~4 —
real information, well short of giving it away. Paired with hidden targeting
priorities, an attacker can know that Bramwen *has* an Earth effect without
knowing whether it will fire on her terms or theirs.

Stage counts rather than a simple complete/incomplete mark were chosen
deliberately: they let a scout tell a squad mid-build from a bare one, which is
the difference between an opponent worth attacking now and one worth attacking
later.

---

## Open

- ~~**Whether targeting is a single choice or an ordered list too.**~~
  **Settled: a primary and a fallback**, two dropdowns rather than a ranking
  widget. See *A primary and a fallback, not one choice* — a single rule leaves
  the target undefined 49–80% of the time, so the fallback is the rule that
  usually fires.
- ~~**Whether reactive powers are configurable.**~~ **Settled — they are not.**
  `04-turns.md` makes "reactive" a **property of the power**, so nothing here
  configures it. The stance version was rejected because the obvious cost is
  already spent — a reactive power carries a normal cooldown ticking in its
  owner's turns — so a stance with no additional cost is a property wearing a
  costume, plus a third ranking widget on every squad row. It remains available
  as a config field once `packages/sim` can price one.
- **Whether the two zones behave differently.** `02-squads.md` question 6 asks
  whether a defending formation follows different combat rules at all. Nothing so
  far requires it, and the Visible/Hidden distinction is currently about
  visibility and reward rather than behaviour.
- ~~**Whether the AI ever declines to act.**~~ **Settled: only when it has
  nothing legal.** A champion passes if and only if **no power it owns has a
  legal target in reach** — never as a tactical choice, never because its
  priority ranks the only available target last. Priority is a sort, not a
  filter, so a disliked target is still taken.

  In practice this almost never fires, because the **tier-0 auto-attack has no
  cooldown and no gate** — so any reachable enemy means a legal action exists. The
  case that does occur is positional: a **reach-1 champion in the back seat**
  reaches only its own middle row (`02-squads.md`), so it has no enemy to strike,
  and it passes unless it owns a friendly power to spend on the allies it *can*
  reach. That is the seat the squad builder already warns about, behaving as
  documented rather than as a bug.
