/**
 * The active champion and what they can do (019).
 *
 * ### A power was a word on a button
 *
 * Five powers rendered as five text buttons with nothing but a name. A player
 * choosing between them wants the same three things every time — *what does it
 * hit, how hard, and can I use it again next turn* — and none of the three was
 * on screen. The export gives each power a card with its Force, its tier and
 * its cooldown, which is exactly those three.
 *
 * ### Only powers that could actually be used are offered
 *
 * Off cooldown, past their tier gate, and with somewhere to point. A power with
 * no legal target is not an option, and offering it and then presenting an
 * empty target list is the shape of a UI that looks broken while being
 * technically correct.
 *
 * ### The cooldown is a count of turns and is written as one
 *
 * Constitution XIII. `2 turns` is the whole of the rule; a clock face or a
 * seconds value here would be a second opinion about a mechanic that has one.
 */

import { getHero, type DamageType, type Power } from '@lmntlz/content';
import { FORCE_TEXT, TypeIcon } from '../../components/index.js';
import type { HeroState } from '@lmntlz/sim/rules';

export interface PowerDockProps {
  readonly actor: HeroState | undefined;
  readonly offered: readonly Power[];
  readonly chosen: string | null;
  readonly onChoose: (powerId: string) => void;
  /**
   * Reports the power under the cursor to the detail panel. **Enter and focus
   * only** — the same rule the combatants follow, and for the same reason: a
   * panel that empties when the cursor crosses the gap between two cards
   * flickers, and everything below it moves.
   */
  readonly onHoverPower?: ((powerId: string) => void) | undefined;
  readonly busy: boolean;
}

export function PowerDock({
  actor,
  offered,
  chosen,
  onChoose,
  onHoverPower,
  busy,
}: PowerDockProps): React.JSX.Element {
  const content = actor ? getHero(actor.heroId) : null;

  return (
    <section aria-label="Your move" className="lz-surface flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        {content ? (
          <>
            <div className="min-w-0">
              <p className="text-h3 truncate font-display tracking-wide text-parchment uppercase">
                {content.name}
              </p>
              <p className="text-caption font-mono text-faint">
                Row {actor!.row} · reach {content.reach + actor!.reachMod} · choose a power, then a
                target
              </p>
            </div>
          </>
        ) : (
          <p className="text-caption font-mono text-faint">Waiting for the engine…</p>
        )}
      </header>

      {offered.length === 0 ? (
        <p className="lz-empty text-caption p-3 font-mono text-faint">
          Nothing in reach — the turn will pass.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Powers" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {offered.map((power) => (
            <PowerCard
              key={power.id}
              power={power}
              chosen={power.id === chosen}
              busy={busy}
              onChoose={() => onChoose(power.id)}
              onPeek={onHoverPower ? () => onHoverPower(power.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PowerCard({
  power,
  chosen,
  busy,
  onChoose,
  onPeek,
}: {
  readonly power: Power;
  readonly chosen: boolean;
  readonly busy: boolean;
  readonly onChoose: () => void;
  readonly onPeek?: (() => void) | undefined;
}): React.JSX.Element {
  /* A dual-typed power takes the better of its two types, so both are shown —
     showing only the first would hide half of what it can open. */
  const types = power.types as readonly DamageType[];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={power.name}
      disabled={busy}
      onClick={onChoose}
      onMouseEnter={onPeek}
      onFocus={onPeek}
      data-power={power.id}
      className={[
        'flex items-center gap-2.5 rounded-lg bg-raised p-2.5 text-left ring-inset',
        'transition-shadow duration-(--duration-fast) disabled:opacity-50',
        chosen
          ? 'shadow-(--shadow-glow-gold) ring-2 ring-gold'
          : 'ring-1 ring-line hover:shadow-(--shadow-glow-air)',
      ].join(' ')}
    >
      <span className="flex shrink-0 items-center gap-0.5">
        {types.map((type) => (
          <TypeIcon key={type} type={type} variant="badge" size="pip" />
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span
          data-may-ellipsis
          className="text-body block truncate font-display tracking-wide text-parchment"
        >
          {power.name}
        </span>
        <span className="text-caption flex flex-wrap gap-x-2 font-mono text-faint">
          <span className={FORCE_TEXT[types[0]!]}>T{power.tier}</span>
          {/* Turns, never milliseconds — the cooldown IS an integer turn count. */}
          <span>{power.cooldown === 0 ? 'no cooldown' : `${power.cooldown} turn${power.cooldown === 1 ? '' : 's'}`}</span>
          {power.friendly && <span className="text-success">ally</span>}
        </span>
      </span>
    </button>
  );
}
