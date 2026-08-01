/**
 * What the power you are holding actually does (019).
 *
 * Jon, pointing at the empty column under the striking six: *"I want a hover
 * panel that shows the details of the selected power."*
 *
 * ### The dock could never have said this
 *
 * A power card is ~180px wide and carries a name, two Force badges, a tier and
 * a cooldown. Everything else a player might want — how the packet scales, how
 * many it hits, which of the defender's two mitigation stats it answers, and
 * why a tier-5 is not available on turn one — did not fit and was nowhere else
 * either. The Codex has it for a champion at rest; nothing had it mid-fight,
 * which is the only moment the question is urgent.
 *
 * ### Everything here is content or a shared rule
 *
 * `resistedBy` comes from `@lmntlz/sim/rules` — the same function the resolver
 * uses to pick which of Armor or Magic Resist applies — rather than a second
 * reading of `power.types` written here. The rest is the authored power.
 *
 * **The multiplier is shown against Might rather than as a damage number.**
 * `packet = Might × multiplier` and nothing else; a flat "deals 240" would be a
 * damage claim this panel is in no position to make, and `TargetRead` already
 * makes it properly against a specific defender.
 */

import type { DamageType, Power } from '@lmntlz/content';
import { resistedBy } from '@lmntlz/sim/rules';
import { FORCE_TEXT, TypeIcon } from '../../components/index.js';

export interface PowerDetailProps {
  /** The power under the cursor, else the one chosen. `null` before either. */
  readonly power: Power | null;
}

const RESISTED_LABEL: Readonly<Record<'armor' | 'magicResist' | 'mixed', string>> = {
  armor: 'Armor',
  magicResist: 'Magic Resist',
  /* A mixed martial/arcane power answers the defender's LOWER stat, which is
     the whole reason mixed typing is worth anything. */
  mixed: 'the lower of the two',
};

const TARGETS_LABEL = (targets: Power['targets']): string => {
  if (targets === 'single') return 'one champion';
  if (targets === 'row') return 'a whole row';
  if (targets === 'party') return 'the whole squad';
  return `${targets} champions`;
};

export function PowerDetail({ power }: PowerDetailProps): React.JSX.Element {
  return (
    <section aria-label="Power detail" className="lz-surface min-h-60 p-3">
      <h3 className="text-caption mb-2 font-mono tracking-widest text-muted uppercase">
        Power detail
      </h3>

      {power === null ? (
        <p className="text-caption leading-relaxed text-faint">
          Hover a power to see how it scales, what it hits and which defence it answers.
        </p>
      ) : (
        <div data-power-detail={power.id} className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="flex shrink-0 items-center gap-0.5">
              {(power.types as readonly DamageType[]).map((type) => (
                <TypeIcon key={type} type={type} variant="badge" size="pip" />
              ))}
            </span>
            <p className="text-body font-display tracking-wide text-parchment">{power.name}</p>
          </div>

          <p className="text-caption font-mono tracking-wider uppercase">
            {(power.types as readonly DamageType[]).map((type, i) => (
              <span key={type}>
                {i > 0 && <span className="text-faint"> · </span>}
                <span className={FORCE_TEXT[type]}>{type}</span>
              </span>
            ))}
            {/**
             * **A dual-typed power takes the better of its two types**, which is
             * why both are listed rather than only the first — and it is the
             * reason no tier-4 or tier-5 power in the game is ever resisted.
             */}
            {power.types.length === 2 && (
              <span className="text-faint"> · the better of the two applies</span>
            )}
          </p>

          <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt className="text-faint uppercase">Tier</dt>
            <dd className="text-parchment">
              {power.tier}
              {/* The gate, stated rather than discovered by it being greyed out. */}
              {power.gateTurn > 1 && (
                <span className="text-faint"> · from turn {power.gateTurn}</span>
              )}
            </dd>

            <dt className="text-faint uppercase">Cooldown</dt>
            {/* Integer turns, never a clock — Constitution XIII. */}
            <dd className="text-parchment">
              {power.cooldown === 0
                ? 'none'
                : `${power.cooldown} ${power.cooldown === 1 ? 'turn' : 'turns'}`}
            </dd>

            <dt className="text-faint uppercase">Hits</dt>
            <dd className="text-parchment">
              {TARGETS_LABEL(power.targets)}
              {power.friendly && <span className="text-success"> · an ally</span>}
            </dd>

            <dt className="text-faint uppercase">Packet</dt>
            <dd className="text-parchment">
              {power.multiplier === null ? (
                <span className="text-faint">no damage or healing</span>
              ) : (
                <>
                  Might × {power.multiplier}
                  {/* Luck is deliberately NOT in the packet; saying so here is
                      cheaper than a player inferring it wrong from the Forge. */}
                </>
              )}
            </dd>

            {power.multiplier !== null && !power.friendly && (
              <>
                <dt className="text-faint uppercase">Answered by</dt>
                <dd className="text-parchment">{RESISTED_LABEL[resistedBy(power)]}</dd>
              </>
            )}
          </dl>

          {power.reactive && (
            <p className="text-caption text-muted">
              Reactive — it answers on its own, rather than being spent as a turn.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
