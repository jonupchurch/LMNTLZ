/**
 * Six champions down one side — yours on the left, the engine's on the right
 * (019).
 *
 * ### Why the board is not enough
 *
 * The board answers *where is everybody standing*; it cannot also answer *how
 * is my squad doing* without cards big enough to carry health, Force, row and
 * reach, and six of those across a 1–6 axis do not fit. The export splits the
 * two questions into two regions, and the split is the reason the board can
 * afford to be a picture.
 *
 * ### The heading says who is driving
 *
 * *The striking six* against *engine defense*. The design's central asymmetry
 * is that **the player commands offense while the engine runs everyone's
 * defense**, and a screen that labelled both sides the same way would hide the
 * one fact that explains why only one of them has a power dock.
 */

import type { BattleState, HeroState, Side } from '@lmntlz/sim/rules';
import { Combatant } from './Combatant.js';

export interface SquadRailProps {
  readonly state: BattleState;
  readonly side: Side;
  readonly activeInstanceId: string | null;
  readonly targets: readonly string[];
  readonly unreachable: ReadonlyMap<string, number>;
  /**
   * **No `onTarget`.** The board is the one place you aim; a rail that was also
   * clickable gave every champion two controls with the same accessible name.
   * The rail still reports hover, because reading a champion and choosing one
   * are different acts.
   */
  readonly onHover?: ((instanceId: string | null) => void) | undefined;
  readonly busy: boolean;
}

const TITLE: Readonly<Record<Side, string>> = {
  attacker: 'The striking six',
  defender: 'Engine defense',
};

const SUBTITLE: Readonly<Record<Side, string>> = {
  attacker: 'you command these',
  defender: 'the engine runs these',
};

/** Front first: the order they meet the enemy in, matching the board's axis. */
const ORDER: Readonly<Record<Side, readonly number[]>> = {
  attacker: [3, 2, 1],
  defender: [4, 5, 6],
};

export function SquadRail({
  state,
  side,
  activeInstanceId,
  targets,
  unreachable,
  onHover,
  busy,
}: SquadRailProps): React.JSX.Element {
  const legal = new Set(targets);
  const order = ORDER[side];

  const squad = state.heroes
    .filter((hero) => hero.side === side)
    .sort(
      (a, b) => order.indexOf(a.row) - order.indexOf(b.row) || a.instanceId.localeCompare(b.instanceId),
    );

  const standing = squad.filter((hero: HeroState) => hero.hp > 0).length;

  return (
    <section aria-label={TITLE[side]} className="lz-surface flex flex-col gap-2 p-3">
      <header>
        <h3
          className={[
            'text-h3 font-display tracking-widest uppercase',
            side === 'attacker' ? 'text-parchment' : 'text-slash-lit',
          ].join(' ')}
        >
          {TITLE[side]}
        </h3>
        <p className="text-caption font-mono tracking-wider text-faint uppercase">
          {standing} of {squad.length} standing · {SUBTITLE[side]}
        </p>
      </header>

      <ul className="flex flex-col gap-1.5">
        {squad.map((hero) => (
          <li key={hero.instanceId}>
            <Combatant
              hero={hero}
              scale="rail"
              active={hero.instanceId === activeInstanceId}
              targetable={legal.has(hero.instanceId) && !busy}
              unreachable={unreachable.has(hero.instanceId)}
              rows={unreachable.get(hero.instanceId)}
              onHover={onHover}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
