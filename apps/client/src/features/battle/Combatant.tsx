/**
 * One champion on the battlefield — the card the board and both rails share
 * (019, `LMNTLZ Battle.dc.html`).
 *
 * ### The battle screen had no faces on it at all
 *
 * Twelve champions were twelve bordered boxes with a name and `1840 / 1840`.
 * Every other screen in the game is portrait-led — the squad builder, the
 * roster, the Codex, and now matchmaking — and the one screen where you watch
 * those champions fight was the one that never drew them. The export puts the
 * art on every unit in all three regions, which is why this is one component
 * rather than three.
 *
 * ### Four states, and each is drawn twice over
 *
 * `active`, `targetable`, `out of reach` and `down` all change the border, and
 * every one of them also changes something that is not colour: the active hero
 * gets a bar, a targetable one gets a cursor and a ring, an unreachable one is
 * hatched, and a fallen one is greyed and captioned. A battle read entirely in
 * border colours is a battle a colour-blind player cannot follow.
 *
 * **`down` is a caption, not an opacity.** A champion at 40% opacity looks like
 * a rendering glitch; *Returned to the shard* is the game saying what happened.
 */

import type { DamageType, HeroId } from '@lmntlz/content';
import { getHero } from '@lmntlz/content';
import type { HeroState } from '@lmntlz/sim/rules';
import { FORCE_RING, FORCE_TEXT, HeroIcon, HeroPortrait } from '../../components/index.js';

export type CombatantScale = 'board' | 'rail';

export interface CombatantProps {
  readonly hero: HeroState;
  readonly scale: CombatantScale;
  /** Whose turn it is right now. */
  readonly active: boolean;
  /** The engine would accept this target for the power currently chosen. */
  readonly targetable: boolean;
  /**
   * An enemy the chosen power cannot reach. Distinct from *not targetable*:
   * an ally is not a target and is not out of reach either.
   */
  readonly unreachable?: boolean;
  /** Rows between the actor and this hero, printed on the hatch. */
  readonly rows?: number | undefined;
  /**
   * Present on the board and absent in the rails, which is what decides whether
   * this renders as a button at all.
   *
   * ### One target surface, deliberately
   *
   * The export makes its rail cards clickable as well as its board units, and
   * following it produced **two buttons per champion with the same accessible
   * name** — twelve heroes, twenty-four controls, and a screen reader offering
   * `Bramwen, 1840 of 1840 health, targetable` twice with no way to tell the
   * two apart. `getByRole` could not either, which is how the existing test
   * found it.
   *
   * So the board is where you aim and the rails are a readout. They still
   * report the hover, because reading a champion is not the same as choosing
   * one.
   */
  readonly onSelect?: (() => void) | undefined;
  readonly onHover?: ((instanceId: string | null) => void) | undefined;
}

const pct = (hero: HeroState): number =>
  hero.maxHp === 0 ? 0 : Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100)));

/**
 * The bar's colour is a **health band**, not the House colour.
 *
 * A Fire champion's bar in Fire red is indistinguishable from a Fire champion
 * about to die, which is the one thing a bar exists to say.
 */
const barClass = (share: number): string =>
  share > 50 ? 'bg-success' : share > 20 ? 'bg-warning' : 'bg-slash';

export function Combatant({
  hero,
  scale,
  active,
  targetable,
  unreachable = false,
  rows,
  onSelect,
  onHover,
}: CombatantProps): React.JSX.Element {
  const content = getHero(hero.heroId);
  const down = hero.hp <= 0;
  const share = pct(hero);
  const board = scale === 'board';

  /* A button when it can be aimed at, a plain box when it is a readout. */
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      {...(onSelect
        ? {
            type: 'button' as const,
            /**
             * **`aria-disabled`, not `disabled`.**
             *
             * A `disabled` button takes no pointer events, so hovering an
             * unreachable enemy did nothing — and *why can I not hit this* is
             * precisely the question the target read exists to answer. The
             * screen was hatching a card to raise a question and then refusing
             * to take the follow-up.
             *
             * `aria-disabled` announces the same thing, keeps the control
             * focusable and hoverable, and the click is guarded below. The
             * failing test was `userEvent.hover` on a disabled element, which is
             * exactly the interaction a player would have tried.
             */
            'aria-disabled': !targetable,
            onClick: targetable ? onSelect : undefined,
          }
        : {})}
      onMouseEnter={() => onHover?.(hero.instanceId)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(hero.instanceId)}
      onBlur={() => onHover?.(null)}
      data-combatant={hero.instanceId}
      data-down={down}
      data-targetable={targetable}
      aria-label={`${content.name}, ${hero.hp} of ${hero.maxHp} health${
        down ? ', returned to the shard' : ''
      }${targetable ? ', targetable' : ''}${unreachable ? ', out of reach' : ''}`}
      className={[
        'relative block w-full overflow-hidden rounded-lg bg-raised text-left ring-inset',
        'transition-shadow duration-(--duration-fast)',
        board ? 'aspect-3/4' : 'h-16',
        down
          ? 'opacity-60 ring-1 ring-line'
          : active
            ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold'
            : targetable
              ? 'cursor-pointer ring-2 ring-gold/50 hover:shadow-(--shadow-glow-gold)'
              : `ring-1 ${FORCE_RING[content.primary as DamageType]}`,
      ].join(' ')}
    >
      <HeroPortrait
        heroId={hero.heroId as HeroId}
        force={content.primary as DamageType}
        fill
        scrim
        sizes={board ? '120px' : '240px'}
      />

      {/* Greyed on top of the wash, so a fallen champion reads as spent art
          rather than as a card that failed to load. */}
      {down && <span aria-hidden className="absolute inset-0 bg-void/70" />}

      {/* The emblem stays put under an overlay — it is how you find the
          champion you are looking for without reading anything. */}
      <span className={`absolute z-10 ${board ? 'top-1 left-1' : 'top-1.5 left-1.5'}`}>
        <HeroIcon heroId={hero.heroId as HeroId} size="chip" />
      </span>

      {/**
       * --- the label strip ---------------------------------------------------
       *
       * **Hidden under an overlay on a rail card, and only there.** A rail card
       * is 64px tall, and a centred `OUT OF REACH · 2 rows away` landed directly
       * on top of the name, the Force, the row and the health — four facts and
       * a fifth written over them, all of it perfectly present in the DOM. The
       * board's cards are 180px and have the room, so they keep the name under
       * the hatch, which is where it is useful: *who* is out of reach is the
       * question the hatch raises.
       *
       * Nothing is lost either way — `aria-label` on the root carries the name,
       * the health and the state in one sentence regardless.
       */}
      <span
        hidden={!board && (down || unreachable)}
        className={[
          'absolute right-0 bottom-0 left-0 px-1.5 pb-1',
          board ? '' : 'pl-11',
        ].join(' ')}
      >
        <span
          data-may-ellipsis
          className="text-caption block truncate font-display tracking-wide text-parchment uppercase"
        >
          {content.name}
        </span>

        {!board && (
          <span className="text-caption flex gap-2 font-mono">
            <span className={FORCE_TEXT[content.primary as DamageType]}>{content.primary}</span>
            <span className="text-faint">row {hero.row}</span>
            <span className="text-faint">R{content.reach + hero.reachMod}</span>
          </span>
        )}

        <span className="mt-1 flex items-center gap-1.5">
          <span aria-hidden className="block h-1.5 flex-1 overflow-hidden rounded-full bg-void/85">
            <span
              className={`block h-full rounded-full ${barClass(share)}`}
              style={{ width: `${share}%` }}
            />
          </span>
          {!board && (
            <span className="text-caption shrink-0 font-mono tabular-nums text-muted">
              {hero.hp}
            </span>
          )}
        </span>
      </span>

      {/* --- the four states, each with a shape as well as a colour --------- */}
      {active && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold" data-state="active" />
      )}

      {unreachable && !down && (
        <span
          aria-hidden
          data-state="unreachable"
          className={`lz-hatch-dark absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center ${board ? '' : 'pl-11'}`}
        >
          <span className="text-caption font-mono tracking-wider text-muted uppercase">
            Out of reach
          </span>
          {rows !== undefined && (
            <span className="text-caption font-mono text-faint">
              {rows} {rows === 1 ? 'row' : 'rows'} away
            </span>
          )}
        </span>
      )}

      {down && (
        <span
          aria-hidden
          data-state="down"
          className={`text-caption absolute inset-0 flex items-center justify-center px-1 text-center font-display tracking-widest text-slash-lit uppercase ${board ? '' : 'pl-11'}`}
        >
          Returned to the shard
        </span>
      )}
    </Tag>
  );
}
