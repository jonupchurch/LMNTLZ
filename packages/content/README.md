# `@lmntlz/content`

The 27-hero roster as validated, versioned data. Everything else in LMNTLZ
speaks this vocabulary; **nothing else may define a hero, a damage type or an
effectiveness value.**

## ⚠️ The workbook is read-only. Permanently.

`resources/characters/hero-stats.xlsx` is the single authored source, and
**nothing in this repository may open it for writing.** Five scripts used to, and
all five were deleted — a script that rewrites the workbook can destroy authored
work that exists nowhere else, and it will do it silently and completely.

CI enforces this (`.github/workflows/content.yml`). If you need a value changed,
change it in the workbook by hand and run the build.

## Using it

```ts
import { getHero, getAllHeroes, effectiveness, contentVersion } from '@lmntlz/content';

const hero = getHero('h01');          // throws UnknownHeroError, never undefined
hero.bane;                            // 'air'  — derived, never authored
effectiveness('air', hero);           // 1.5
contentVersion();                     // 'c0f64f2490b78'
```

## Rebuilding

```bash
pnpm content:build
```

Reads the workbook, validates it, and emits three **committed** files:

| Emitted | What it is |
|---|---|
| `src/heroes.generated.ts` | the roster |
| `src/version.generated.ts` | the content stamp |
| `../../resources/characters/MATCHUPS.md` | the roster of record |

CI re-runs the build and **fails if the result differs from what is committed**.
That is what makes the generated files trustworthy: a hand edit to any of them
cannot survive a pull request.

## Two authored fields, four derived ones

A hero authors `primary` and `secondary`. Everything about how it relates to the
other eight types follows:

```
strengths = { primary, secondary }
bane      = counter(primary)      // major weakness, x1.50
fault     = counter(secondary)    // minor weakness, x1.25
```

`counter` is a bijection over all nine types that never crosses the magic/melee
families — `earth<->air`, `fire<->water`, `light<->dark`, and the melee triangle
where each type is Bane-weak to the one that beats it.

**All four slots must stay distinct**, which is three rules:
`secondary ≠ primary`, `counter(primary) ≠ secondary`, `counter(secondary) ≠ primary`.

Of the 72 pairings with a distinct secondary, exactly **60 are legal**. That
count is asserted, not described — a change to `counter` that silently widened
the legal space fails `tests/derivation.test.ts` rather than shipping.

**Melee heroes always take a magic secondary.** This is a *consequence*, not a
rule: of a melee primary's two other melee options, one is already its Bane and
the other would make its Fault its own primary. `isLegalPairing` never asks what
family a type belongs to, and a test asserts that it doesn't.

## Effectiveness is not a table

`effectiveness(attackType, defender: Hero)` takes a **hero**, and there is no
overload taking a bare defending type. That is deliberate: effectiveness reads
the defender's *two* authored types, so a 9x9 type-versus-type table has nowhere
to put Fault or the x0.80 secondary case. The signature is the enforcement.

A dual-typed power resolves as the **better of its two types**.

## `friendly` means *who it targets*, not *what it does*

About twenty powers grant a buff. **All but one of them are correctly hostile**,
because the buff is a rider on an attack and lands on the caster:

> *Might ×3.5 single-target Earth/Dark strike, 5-turn cooldown; Ossic also raises
> a wall of bone around himself, granting a temporary Magic Resist buff.*

That power targets an enemy. Marking it friendly would point a damaging strike at
an ally. So `friendly` tracks **who the power targets** and never whether a buff
happens to result — a test locks fourteen of these self-buff riders as hostile.

The four genuinely ally-targeting powers are the three heals plus **Whisper from
the High Reach**, the roster's only ally-targeting non-heal: *"No direct damage.
Grants the whole squad a temporary Speed and Agility buff."*

**One limit worth knowing:** `friendly` is a boolean, and *The Unhidden Hour*
touches both sides — it cleanses the whole squad *and* strips every enemy's
buffs. It is recorded as hostile because the contested half is the part that
needs resolving against a defender. A power that genuinely needs both wants a
third value, not a lie.

## Known gaps

- **⚠️ Three multiplier cells in the workbook are wrong.** `03-powers.md` says
  *Whisper from the High Reach*, *The Unhidden Hour* and *The Undoing* carry a
  **blank** multiplier, because *"damage is not a thing these powers have."* The
  workbook gives all three the tier-5 default of **5**. Left alone, three tier-5
  powers would deal full damage that they are specified to deal none of.

  The build overrides them to `null` and **prints a warning on every run** for as
  long as the workbook disagrees. Blank the three cells in `Power List` and the
  warning stops by itself — the override becomes a no-op rather than debt someone
  has to remember to remove.

- **`targets`, `friendly` and `reactive` have no workbook columns.** They live in
  `tools/power-targeting.json`, which fails the build if it names a power the
  workbook doesn't have — so it can be wrong, but it cannot drift quietly. The
  right fix is three new columns in `Power List`, at which point the overlay is
  deleted.

## A correction to the canon

`CLAUDE.md` and `03-powers.md` both state that **"no tier-4 or tier-5 power is
ever resisted."** Measured against the real roster, that is **false** — there are
**24 resisted cases**.

A tier-4/5 power is dual-typed with the attacker's own two types, so it is
resisted only when the defender resists *both* — which requires the defender to
carry the same two types. **Six hero pairs carry exactly swapped types** (Bramwen
`earth/fire` against Cindara `fire/earth`, and five more). Each ordered pair
costs both of the attacker's top powers a x0.80.

The weaker claim is true and is what the test locks: **a tier-4/5 power is never
*strongly* resisted.** It never resolves to x0.50, because that branch needs both
of the power's types to be the defender's primary and a type cannot be its own
pair.

See `tests/effectiveness.test.ts`.
