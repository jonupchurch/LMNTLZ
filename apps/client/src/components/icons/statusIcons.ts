/**
 * Engine status kind → the icon that stands for it (020 US2).
 *
 * ### Why this file exists now
 *
 * `icons.test.ts` carries an anti-vacuity guard written in 017: the status icon
 * registry checks itself, which is an assertion over an empty set while nothing
 * produces a status. The guard's instruction was explicit — *"when a status
 * vocabulary is authored, do not relax these; write the real cross-check."*
 *
 * 020 authored the vocabulary. This is the cross-check's other half: the one
 * place that says which of the 71 design icons answers each of the engine's
 * twelve kinds.
 *
 * ### What it deliberately is not
 *
 * **Not a component, and `StatusPip` still has no caller.** Rendering the row is
 * US4 and is not built. This is the mapping alone, so that the guard can be a
 * real assertion today without inventing a screen — and so US4 finds the
 * correspondence already decided rather than deciding it inline.
 *
 * ### The registry is finer-grained than the engine, on purpose
 *
 * Seventy-one icons against twelve kinds is not drift. The design draws a
 * damage-over-time pip **per Force** and a stat pip **per stat and direction**,
 * which is information the *power* carries and `StatusInstance` does not. So the
 * base mapping below answers the kind, and the two refiners narrow it when the
 * caller knows more. "Every icon is claimed by some kind" was never satisfiable
 * and the guard should not ask for it.
 */

import type { DamageType } from '@lmntlz/content';
import type { StatusInstance } from '@lmntlz/sim/rules';
import { STATUS_ICONS, type StatusIconKey } from './icons.generated.js';

type StatusKind = StatusInstance['kind'];
type StatKey = NonNullable<StatusInstance['stat']>;

/**
 * The stat slugs the icon set uses. **Nine of ten match the engine's key
 * exactly; `magicResist` is drawn as `resist`** — the one place the two
 * vocabularies disagree, and the reason this is a table rather than a
 * `toLowerCase()`.
 */
const STAT_SLUG: Readonly<Record<StatKey, string>> = Object.freeze({
  might: 'might',
  perception: 'perception',
  agility: 'agility',
  toughness: 'toughness',
  armor: 'armor',
  penetration: 'penetration',
  magicResist: 'resist',
  speed: 'speed',
  resolve: 'resolve',
  luck: 'luck',
});

/**
 * One icon per kind, with no further information.
 *
 * Two choices worth stating rather than leaving to a reader to reverse-engineer:
 *
 * - **`shred` is `exposed`, not `withered`.** Shred removes a wall rather than
 *   wearing a champion down, and Crush's whole identity is *"does not go through
 *   the guard — it removes the guard."*
 * - **`mark` is `reprisal`.** A mark is a record that this attacker has struck
 *   this target before, which is exactly what Reckoning cashes in.
 */
const BASE: Readonly<Record<StatusKind, StatusIconKey>> = Object.freeze({
  burn: 'status-dot',
  bleed: 'status-dot',
  poison: 'status-dot',
  buff: 'status-renewed',
  debuff: 'status-withered',
  shred: 'status-exposed',
  shield: 'status-shield',
  taunt: 'status-taunt',
  fade: 'status-fade',
  stun: 'status-stun',
  silence: 'status-silence',
  mark: 'status-reprisal',
});

/** The icon for a status, using the stat when the kind carries one. */
export function statusIconFor(status: Pick<StatusInstance, 'kind' | 'stat'>): StatusIconKey {
  if ((status.kind === 'buff' || status.kind === 'debuff') && status.stat) {
    const key = `status-stat-${STAT_SLUG[status.stat]}` as StatusIconKey;
    if (key in STATUS_ICONS) return key;
  }
  return BASE[status.kind];
}

/**
 * The **pip** for a stat change, which is the only place the registry draws
 * direction. `status-stat-*` is neutral; `pip-stat-*-up` and `-down` are not.
 */
export function statPipFor(stat: StatKey, direction: 'up' | 'down'): StatusIconKey {
  return `pip-stat-${STAT_SLUG[stat]}-${direction}` as StatusIconKey;
}

/**
 * The **pip** for a damage-over-time effect of a given Force.
 *
 * The Force is the *power's*, not the status's — `StatusInstance` snapshots a
 * magnitude and deliberately not a type, because the type multiplier is already
 * folded into that magnitude at application. A caller that has the power can
 * narrow; one that does not gets `status-dot` from {@link statusIconFor}.
 */
export function dotPipFor(force: DamageType): StatusIconKey {
  return `pip-dot-${force}` as StatusIconKey;
}

/** Every kind the engine can produce, for the icon guard to enumerate. */
export const MAPPED_STATUS_KINDS: readonly StatusKind[] = Object.freeze(
  Object.keys(BASE) as StatusKind[],
);
