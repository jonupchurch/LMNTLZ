/**
 * The component layer's `Effectiveness` path (017 T008, T025 · FR-019).
 *
 * ### Why a re-export earns its keep
 *
 * This file adds no behaviour. It exists so that a component reaching for a
 * multiplier has a **shorter path to the right type than to `number`** — the
 * import sits beside the component being written rather than in a package the
 * author has to know to look in.
 *
 * The point is what it makes impossible. `Effectiveness` is the closed union
 * `1.5 | 1.25 | 1.0 | 0.8 | 0.5`, so a component typed on it **cannot compile**
 * with the ladder four design exports print:
 *
 * ```ts
 * const fault: Effectiveness = 1.2;   // ❌ Type '1.2' is not assignable
 * const fault: Effectiveness = 1.25;  // ✅
 * ```
 *
 * That is the whole mechanism. `resources/README.md` records that four exports
 * draw `FAULT ×1.2` and none draws `×0.80`; the canon in
 * `resources/mechanics/` is the five-tier ladder below. Typing on the union
 * turns that discrepancy from **a review someone has to remember to do** into a
 * build error nobody can merge past — which is the difference between a rule
 * and a hope.
 *
 * Never widen this to `number` to make a call site compile. A call site that
 * wants a value outside the union is the defect the type just caught.
 *
 * @see resources/mechanics/03-combat.md — the five tiers and their derivation
 * @see specs/017-design-port/contracts/components.md — rule 2
 */

export type { Effectiveness } from '@lmntlz/content';

/**
 * The five tiers, named. Prefer these to their literals in a component: `BANE`
 * says why the number is 1.5, and `1.5` does not.
 *
 * Re-exported from `@lmntlz/content` rather than redeclared — a second
 * declaration would be a second source of truth for a rule, which is the thing
 * Constitution XV exists to stop.
 */
export {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_SECONDARY,
  RESISTED_PRIMARY,
} from '@lmntlz/content';
