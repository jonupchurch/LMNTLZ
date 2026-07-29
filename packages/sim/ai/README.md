# `@lmntlz/sim/ai`

The engine plays **every** defense squad — yours, and everybody else's. **Server
only.**

## The one hazard everything else defends against

**A power fires only when everything ranked above it is on cooldown. The tier-0
auto-attack has cooldown 0 and no gate, so it is never on cooldown. Therefore
nothing ranked below tier 0 ever fires.**

That single sentence is the deepest lever in the game and the easiest one to pull
by accident. Handled well, a ranking is the most expressive setting a player has
— it governs every turn of every battle from one drag. Handled badly, a player
drops their ultimate to the bottom of a list, halves their own defense, and the
game never tells them.

`firingProfile` is what tells them. It lives in `@lmntlz/sim/rules`, not here.

## Two lists, and that is the whole surface

```ts
interface SquadMemberConfig {
  targeting: [primary: TargetRule, fallback: TargetRule];
  ranking:   PowerRanking;                 // six tiers, highest priority first
  allyRule?: TargetRule;                   // only if the champion can heal
}
```

Deliberately small. `07-defense-ai.md` rejected opening scripts because a ranking
governs every turn from one setting, while a three-power script configures about
a third of a hero's fight and then runs out.

**The targeting pair is a pair for a measured reason.** A single role rule leaves
the target undefined 49–80% of the time — *"Buffers first"* finds no Buffer in
four turns out of five, because there are 3 Buffers among 27 heroes. **The
fallback is the rule that usually fires.**

**The ally rule is a single choice** because the ally menu discriminates far
better: *lowest HP percentage* over five allies almost always names exactly one.
It is absent entirely on a champion owning no friendly power, so the interface
stays honest about which champions face the decision.

## What is here and what is next door

| | Where | Why |
|---|---|---|
| `firingProfile`, `isSafeOrdering`, `rankOneFiringCount` | **`rules`** | Arithmetic, not a choice. The squad builder needs it on every drag of a ranking widget; an endpoint and a round trip for that would be absurd |
| `choosePower`, `chooseTarget`, `chooseAlly`, `decideAction`, `roleDefaults` | **here** | They make **choices**. Shipping them would hand every player the exact ranking and target preference the engine will use against them |

## The order of resolution, which is not negotiable

**Power preference first, then targeting.** Type effectiveness is a property of
the *power*, so tiebreak 3 (*best type matchup*) and the `least-mitigation` rule
are both unanswerable until the power is known. Choosing a target first and then
a power for it is not a different design; it is unimplementable.

```
choosePower   →   legalTargets (feature 002, stages 1–3)   →   chooseTarget
```

## The five-step tiebreak

```
1  primary rule        defender    rules
2  fallback rule       defender    rules
3  best type matchup   engine      rules
4  nearest row         defender    rules   (indirectly, via placement)
5  seeded random       engine      RESOLVER
```

Four of the five are pure, so a client can preview which champions are legal and
which one a configuration prefers — and can never quite predict which is struck,
because the last step is a draw it will never see.

**`chooseTarget` sorts. It never filters.** There is no parameter that could
remove a candidate, which makes "the AI had no legal target" structurally
unreachable rather than merely intended. A priority ranking the only available
champion last still takes it.

**A taunt beats a priority, always** — and not because a rule here says so. A
compulsion is stage 3 and resolves before this module is called at all, so by the
time any preference runs there is one champion left to prefer.

> **`legalTargets` reports the compulsion; it does not apply it.** It returns
> `compelled` alongside the full candidate set, and narrowing is the caller's job.
> `decideAction` does it. A caller reading `candidates` alone would silently drop
> every taunt in the game — which is exactly what happened here once, and is why
> `taunt.test.ts` drives the whole decision rather than only the sorter.

## Nothing here reads a zone

Visible and Hidden squads are played by the same function with the same inputs.
The distinction between them is **visibility and reward, never behaviour**. A
Hidden squad that played better would be a second AI nobody can scout and nobody
can prepare for, and there is no board field or config field that could carry the
distinction. `divergence.test.ts` scans every source file to keep it that way.

## Randomness comes from the resolver, never from here

Tiebreak 5 is the only draw a defense makes, and it takes it from
`draw(seed, index)`. A `Math.random()` at the bottom of that ladder would sit
there passing every test that never forced a tie, and then make a battle change
underneath a player between one request and the next — in-progress state is never
stored, so every request re-derives the past from the action log.

`replayability.test.ts` scans for `Math.random`, `Date.now`, `new Date`, `crypto`
and `performance` in every file here.

## The reach window is computed, never bounded

**There is no constant `2` anywhere in this directory and no array sized to two
rows.** `02-squads.md` derives a two-entry distance menu from "at base reach a
champion sees at most two enemy rows"; the Air rune `Further Than It Looks`
grants **+1 reach for a turn** and puts a reach-2 front seat in range of three.
`Math.min(reach + mod, 2)` would look defensive and quietly delete the rune.

So the menu carries **three** distance entries, and **`middle` degrades to
`furthest`** when fewer than three rows are reachable — never to `nearest`. A
defender choosing *middle* is asking to get **past the front line**; dropping
them onto the front row inverts the instruction rather than approximating it.

## The defaults, and the standing instruction

The four role rankings are drawn from the **12 universally safe orderings**, so
no default can silently switch a power off. `tools/characterize-orderings.ts`
measures them: 720 orderings × 27 heroes, at both 60 turns and 9.

> ### Re-run the sweep before the hero-numbers pass locks.
>
> **A one-point *reduction* in the tier-4/5 cooldown ladder takes the safe set
> from 12 to zero** (research.md Finding 2). That is not a formality — it is the
> difference between four defaults that keep every power live and four that do
> not. Re-pick every default from whatever the sweep returns; do not assume these
> four survived.
>
> ```bash
> pnpm sweep:orderings          # offline, ~19,440 pairs. Not in CI.
> ```

**The safety is measured. The role→ordering assignment is a proposal**
(Constitution XX). The sweep can prove a power *fires*; it can never prove that
firing it was worth doing. That needs the powers' **effects** read rather than
their cooldowns simulated, and it belongs with the hero-numbers pass. The Buffer
assignment in particular assumes its mid tiers carry the sustain.

### Two corrections carried in code

1. **`07-defense-ai.md` says all 12 safe orderings end `1·0`. Eleven do.** The
   twelfth is `4·3·2·1·5·0` — that same document's published Tank default. The
   real structural rule is **tier 0 last**, and unlike the `1·0` pattern it is
   *provable* rather than measured. It is also necessary but **not sufficient**:
   120 of 720 orderings end in tier 0 and only 12 are safe.
2. **The 60-turn horizon is a measurement artifact, about seven times a real
   battle.** A hero takes ~8.5 turns in a 6v6. `firingProfile` therefore defaults
   to **9**, not 60 — a 60-turn profile tells a player their auto-attack fires 5%
   of the time when in their actual battles it never fires at all. At 9 turns *no*
   ordering keeps all six powers live; excluding the auto-attack, **32 of 720**
   keep tiers 1–5 live on all 27.

### One caveat that holds only because of who gets it

`4·3·2·1·5·0` is safe at 60 turns and **loses tier 5 at nine** on the fast
`0·1·2·3·4·6` ladder — Cirrolan, Lucen, Umbriel and Silka Pinquick. None of them
is a Tank, so the assignment holds. **A future reassignment must re-check rather
than inherit it.**

## A self-defeating ranking is surfaced, not blocked

Constitution XVIII. Deliberate is fine — a player who wants `1·2·3·4·5·0` and
knows what it costs may have it. Accidental is the failure, and `firingProfile`
is the difference.
