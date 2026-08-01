/**
 * What the chosen power would do to the champion under the cursor (019).
 *
 * ### The one thing the battle screen never told you
 *
 * A player picked a power and a target and found out what happened afterwards.
 * Everything needed to answer *before* the click is derivable — Bane and Fault
 * are a pure function of two authored fields, and `damagePreview` is a shared
 * rule with no RNG in it — so the information was being withheld by omission
 * rather than by design. The game is counter-building; this is where the
 * counter-building happens.
 *
 * ### It previews and never decides
 *
 * The numbers come from `@lmntlz/sim/rules`, the same module the server
 * resolves with, and the roll happens on the server against a seed that never
 * leaves it. A range is not an outcome — `hitProbability` is why the shot can
 * still miss, and it is stated rather than hidden.
 */

import { HeroIcon, Meter } from '../../components/index.js';
import { FORCE_TEXT } from '../../components/index.js';
import { TIER_CLASS, TIER_LABEL, type TargetRead as Read } from './read.js';
import type { HeroId } from '@lmntlz/content';

export interface TargetReadProps {
  /** `null` when nothing is hovered, or when the ids stopped resolving. */
  readonly read: Read | null;
  /** Whether a power has been chosen at all — a different sentence. */
  readonly hasPower: boolean;
}

export function TargetRead({ read, hasPower }: TargetReadProps): React.JSX.Element {
  /**
   * **The height is reserved, not discovered.**
   *
   * Three states live in this box — the placeholder, a priced read, and an
   * out-of-reach read — and they are naturally different heights. Letting the
   * panel size to its content meant everything below it jumped every time the
   * cursor moved between two champions, which is the second half of the stutter
   * Jon caught. `battle.spec.ts` measures the box across every defender and the
   * placeholder and refuses any variation, so this number cannot quietly stop
   * being enough.
   */
  return (
    <section aria-label="Target read" className="lz-surface min-h-68 p-3">
      <h3 className="text-caption mb-2 font-mono tracking-widest text-muted uppercase">
        Target read
      </h3>

      {read === null ? (
        <p className="text-caption leading-relaxed text-faint">
          {hasPower
            ? 'Hover a defender. Effectiveness, reach and remaining health resolve here before you commit.'
            : 'Pick a power, then hover a defender.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <HeroIcon heroId={read.heroId as HeroId} size="chip" />
            <p className="text-body truncate font-display tracking-wide text-parchment">
              {read.name}
            </p>
          </div>

          {read.tier !== null ? (
            <p
              data-tier={read.tier}
              className={`text-h3 font-display tracking-widest uppercase ${TIER_CLASS[read.tier]}`}
            >
              {TIER_LABEL[read.tier]}
            </p>
          ) : (
            <p data-tier="unreachable" className="text-h3 font-display tracking-widest text-faint uppercase">
              Out of reach
            </p>
          )}

          <Meter
            label="Health"
            value={read.hp}
            max={read.maxHp}
            tone={read.hp / read.maxHp > 0.5 ? 'success' : read.hp / read.maxHp > 0.2 ? 'strong' : 'danger'}
          />

          {/**
           * **The one part that varies, given a fixed block of its own.**
           *
           * The priced read is two or three lines depending on whether a crit
           * is possible and how long the numbers are; the out-of-reach read is
           * one. Reserving three lines here is what makes every read the same
           * height, rather than tuning the panel's minimum until it happens to
           * cover the tallest — which is a number that stops being right the
           * first time a hero's damage gains a digit.
           */}
          <div className="min-h-14">
          {read.preview ? (
            <p className="text-caption leading-relaxed text-muted">
              {/* Rounded, because a fractional hit point is an engine detail. */}
              About <span className="text-parchment">{Math.round(read.preview.final)}</span> on{' '}
              {read.hp} health, at{' '}
              <span className="text-parchment">{Math.round(read.preview.hitProbability * 100)}%</span>{' '}
              to land.
              {read.preview.critChance > 0 && (
                <>
                  {' '}
                  A crit doubles it to{' '}
                  <span className="text-gold">{Math.round(read.preview.critFinal)}</span>.
                </>
              )}
            </p>
          ) : (
            <p className="text-caption leading-relaxed text-muted">
              {read.rows} occupied {read.rows === 1 ? 'row' : 'rows'} away. Reach opens up as rows
              empty.
            </p>
          )}
          </div>

          {/**
           * **The doors, always shown.** Derived from the two authored fields,
           * so a scout with the Codex open has them anyway — printing them is
           * saving the player a lookup, not disclosing anything.
           */}
          <p className="text-caption border-t border-line pt-2 font-mono tracking-wider uppercase">
            <span className="text-faint">bane </span>
            <span className={FORCE_TEXT[read.bane]}>{read.bane}</span>
            <span className="text-faint"> · fault </span>
            <span className={FORCE_TEXT[read.fault]}>{read.fault}</span>
            <span className="text-faint"> · resists </span>
            <span className={FORCE_TEXT[read.primary]}>{read.primary}</span>
            <span className="text-faint">, </span>
            <span className={FORCE_TEXT[read.secondary]}>{read.secondary}</span>
          </p>
        </div>
      )}
    </section>
  );
}
