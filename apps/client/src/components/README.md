# The component layer

Everything 014, 015, 016 and every screen in 018 builds against. Import from
`components/index.js` — never from a path inside this directory, so the internal
arrangement can change without touching a consumer.

**Re-implementing one of these privately inside `features/` is the debt this
layer exists to retire.** If something here does not fit, widen it here.

---

## The three rules

### 1 · A component never accepts a colour

It accepts the *thing*, and derives.

```tsx
<TypeBadge type="fire" />        // ✅ colour derives from the Force
<TypeBadge color="#E8552B" />    // ❌ colour becomes a second source of truth
```

The nine Forces **are** the brand, and their relationships are a rule that lives
in `@lmntlz/content`. A `color` prop lets a caller paint Fire with the Water
token, and nothing catches it — the colour has quietly become a second place the
rule is written down (Constitution XV).

Derivation lives in one file, `type/forceClasses.ts`. `tone` and `variant` are
permitted prop names because they are *semantic*, and their types
(`MeterTone`, `PillTone`, `ButtonVariant`) are closed unions — a caller cannot
smuggle a hex through them.

`tests/components/noColourProp.test.ts` scans for the four banned prop names,
comment-stripped, with a companion case that must fail.

> **Why the class strings are written out in full.** Tailwind scans source text,
> so `` `bg-${type}` `` generates nothing at all and the badge renders
> transparent. Every class in `forceClasses.ts` is a complete literal for that
> reason. It looks redundant; it is what makes the file work.

### 2 · A multiplier is `Effectiveness`, never `number`

```ts
import type { Effectiveness } from '@lmntlz/content'; // 1.5 | 1.25 | 1.0 | 0.8 | 0.5
```

**Four design exports print `FAULT ×1.2`, and none prints `×0.80` at all.**
Typing on the closed union makes the design's wrong ladder *unrepresentable*:

```ts
const fault: Effectiveness = 1.2;   // ❌ Type '1.2' is not assignable
const fault: Effectiveness = 1.25;  // ✅
```

That is the difference between a rule and a hope. A review someone has to
remember to run becomes a build error nobody can merge past. Never widen it to
`number` to make a call site compile — a call site that wants a value outside the
union is the defect the type just caught.

### 3 · A duration is turns

`CooldownRing` takes `turnsRemaining` and `turnsTotal`. No `Date`, no
`setInterval`, no milliseconds (Constitution XIII). Combat is discrete and
turn-based, so **a ring that animates against a wall clock is a rules claim made
in CSS** — and a false one. The ring moves when a turn resolves, never on its
own.

The `--duration-*` tokens are UI transitions and have nothing to do with combat.

---

## Where this layer departs from the exports, on purpose

Three, and each is recorded rather than silently applied.

| What | The export | Here | Why |
|---|---|---|---|
| Effectiveness ladder | four tiers, `FAULT ×1.2` | **five tiers**, `×1.25`, and `×0.80` present | Canon wins; logged in `resources/README.md` |
| Button's 7th state | contract says `success` | **`pending`** | No export draws a success button; the Design System export draws Pending with a rationale. The game is server-authoritative, so "the click landed, the server has not answered" is a constant state |
| `EffectivenessGrid` | contract sketches a 9×9 | **squad vulnerability** | A 9×9 cannot exist: effectiveness is a function of an attack type and a *hero*, since bane and fault derive from that hero's two Forces. There is no cell for "fire vs water" without asking *which* water hero |

The focus ring departs too, in technique only: the export writes `outline: none`
plus a double box-shadow, and `bootstrap.test.tsx` rightly forbids removing the
outline anywhere in `base.css`. The same two rings are built the other way round
— `outline-offset` opens the gap, a `box-shadow` in void fills it. **The ring is
Air, never gold**: gold is the same hex as `--color-light`, so a gold ring was
invisible on a Light hero card and on every `--color-strong` surface.

---

## What a consumer may rely on

- Every component honours the tokens in `base.css` and contains **no colour
  literal**.
- Every interactive component is keyboard-reachable with a visible focus ring,
  and none overrides the global `:focus-visible`.
- No component fetches anything or imports `@lmntlz/sim/resolver`.
- Every component renders at the 1280 floor without horizontal overflow.

## What a consumer must not do

- Pass a colour, a hex, or a raw `number` where `Effectiveness` is expected.
- Add a rail entry for a screen that does not exist (FR-015). `RailEntry` has no
  destination field at all, so this is enforced by the type.
- Re-implement a component privately inside `features/`.

## Known unwired

`StatusPip` and its 71-icon registry ship with **no producer** — nothing
constructs a status and `board.ts` hardcodes `statuses: []`. See
[`icons/README.md`](./icons/README.md) for why its guard is vacuous today and
what will make it start biting.

## Seeing them

`#gallery` in a dev build renders every component in every state. It is
registered in `App.tsx` behind `import.meta.env.DEV`, so it is mounted by the
real app rather than a parallel tool that can drift from it — and
`tests/components/gallery.test.tsx` asserts the registration by rendering `App`,
not by importing the gallery.
