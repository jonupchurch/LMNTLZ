/**
 * What a power actually does (019).
 *
 * Jon, pointing at the empty column under the striking six: *"I want a hover
 * panel that shows the details of the selected power."* Then, on the roster:
 * *"when you hover over the powers in the list I'd like a description and any
 * mechanics of the power to be displayed in a flyout."*
 *
 * ### ⚠️ There is NO authored description of a power, anywhere
 *
 * A `Power` is `{id, name, tier, multiplier, cooldown, gateTurn, types, targets,
 * friendly, reactive}` — the schema has no `description`, and no file in
 * `resources/` carries prose for the 162 powers. So the sentence at the top of
 * this panel is **generated from the mechanics**, not flavour text someone
 * wrote: it says what the power does because it is assembled from what the
 * power is.
 *
 * That is the honest option and it is also the durable one — invented flavour
 * would be a second source of truth for behaviour, and the hero-numbers pass
 * would silently falsify it. If authored voice lines arrive later they belong in
 * `@lmntlz/content` beside `name`, and this panel would print both.
 *
 * ### It lives at the component layer because two screens explain a power
 *
 * It was `features/battle/PowerDetail.tsx` and the roster needed the same thing.
 * A second copy is how *"cooldowns are turns"* ends up written two ways on two
 * screens; there is one explanation of a power and both callers render it.
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
import { TypeIcon } from '../icons/TypeIcon.js';
import { FORCE_TEXT } from '../type/forceClasses.js';

export interface PowerDetailProps {
  /** The power under the cursor, else the one chosen. `null` before either. */
  readonly power: Power | null;
  /**
   * Drop the panel chrome — heading, surface, reserved height — because a
   * flyout already provides all three.
   *
   * The battle screen renders this as a **fixed region** in a column, so it must
   * hold its height whether or not a power is hovered; see
   * `a-panel-that-resizes-is-a-defect`. A flyout is absolutely positioned and
   * shifts nothing, so reserving space there would be a 240px hole in the air.
   */
  readonly bare?: boolean;
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

/**
 * One sentence saying what the power does, **assembled from the power**.
 *
 * Not flavour text — see the note at the top of this file. Every clause is a
 * field, so this cannot go out of step with the mechanics printed underneath it
 * the way a hand-written line would the first time a cooldown is retuned.
 *
 * The three shapes it has to cover, and each exists in the roster today:
 * a damaging power, a friendly one (`multiplier` set, `friendly` true), and the
 * three that deal neither damage nor healing (`multiplier === null`).
 */
export function describePower(power: Power): string {
  const forces = (power.types as readonly DamageType[]).join('/');
  const at = TARGETS_LABEL(power.targets);

  const verb =
    power.multiplier === null
      ? `Acts on ${at}`
      : power.friendly
        ? `Heals ${at} for Might × ${power.multiplier}`
        : `Deals ${forces} damage to ${at} for Might × ${power.multiplier}`;

  const cadence =
    power.cooldown === 0
      ? 'every turn'
      : `once every ${power.cooldown} ${power.cooldown === 1 ? 'turn' : 'turns'}`;

  /* The gate is a *rule*, not a state — a tier-5 is unavailable on turn 1 for
     everybody, forever — so it belongs in the sentence rather than being
     discovered by the slot being greyed out. */
  const gate = power.gateTurn > 1 ? `, and not before turn ${power.gateTurn}` : '';

  return `${verb}, ${cadence}${gate}.`;
}

export function PowerDetail({ power, bare = false }: PowerDetailProps): React.JSX.Element {
  return (
    <section
      aria-label="Power detail"
      className={bare ? '' : 'lz-surface min-h-60 p-3'}
    >
      {!bare && (
        <h3 className="text-caption mb-2 font-mono tracking-widest text-muted uppercase">
          Power detail
        </h3>
      )}

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

          {/* The generated sentence. First, because it is the answer to "what
              does this do?" and everything under it is the detail behind it. */}
          <p data-power-summary className="text-caption leading-relaxed text-muted">
            {describePower(power)}
          </p>

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
