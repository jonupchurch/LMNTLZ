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

**If no candidate matches the priority, the next-best does.** Priority is a sort
over the survivors of stages 1–3, never a filter — so it can never produce "no
legal target" where one exists, and it needs no special-case rule.

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
lists per hero** — who to hit, which power to use — and nothing else.

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

- **Whether targeting is a single choice or an ordered list too.** Power
  preference is an ordered ranking, so a single-choice targeting priority is now
  the odd one out. An ordered chain — *Buffers, then lowest HP, then nearest* —
  would be consistent and more expressive, at the cost of a second ranking widget
  on every squad row. The fallback rule above works either way.
- **Whether reactive powers are configurable.** `04-turns.md` leaves open whether
  "reactive" is a power property or a stance a hero adopts. If it is a stance, it
  is a **defender's** decision and belongs here — and it would be the second
  defensive choice a player makes, after priority.
- **Whether the two zones behave differently.** `02-squads.md` question 6 asks
  whether a defending formation follows different combat rules at all. Nothing so
  far requires it, and the Visible/Hidden distinction is currently about
  visibility and reward rather than behaviour.
- **Whether the AI ever declines to act.** A Buffer with nothing to heal, or a
  hero whose only reachable target is one its priority ranks last — is passing
  ever correct? `04-turns.md` already establishes that a champion with no legal
  target in reach passes.
