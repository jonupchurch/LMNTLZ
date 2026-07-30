/**
 * What one opponent's Visible squad looks like, and what it is weak to.
 *
 * ### This is the screen the whole design is about
 *
 * *"The game is counter-building: read the enemy's weaknesses, don't stack your
 * own."* Every hero's Bane and Fault are a pure function of its two authored
 * types, so a scout can compute them from the Codex regardless — which is exactly
 * why disclosing them is safe, and why **counting** them is the useful thing this
 * panel does that a list of six names does not.
 *
 * ### What is deliberately absent
 *
 * No stat values, base or runed. No indication of which stat a rune boosts. No
 * targeting rule and no power ranking, in either zone. And for the Hidden squad,
 * **the hold streak and nothing else** — there is no seats array to render,
 * because an empty one would still tell a scout the shape of what is missing.
 *
 * Rune pips show **commitment, never power**: at an identical spend the best
 * allocation scores ~3.35× the worst, so a full set of pips means a player
 * committed, not that they committed well. That gap is what makes bluffing real.
 */

import { useMemo } from 'react';
import type { ScoutView } from './types.js';

export interface ScoutPanelProps {
  readonly scout: ScoutView;
  /** Rendered under the squad, so the choice sits beside what informed it. */
  readonly children?: React.ReactNode;
}

const ROW_ORDER: Readonly<Record<string, number>> = { front: 0, middle: 1, back: 2 };

export function ScoutPanel({ scout, children }: ScoutPanelProps) {
  /**
   * **The counting is the point.** Six names and their types are the raw data; the
   * question a player is actually asking is *"what one damage type hurts the most
   * of them?"* — and answering it by eye across six champions and nine types is
   * the sort of arithmetic that makes people not bother.
   *
   * A Bane is super-effective (×1.50) and a Fault is minor (×1.25), so they are
   * counted apart rather than summed. Ordered by Banes first, because that is the
   * lever.
   */
  const answers = useMemo(() => {
    const banes = new Map<string, number>();
    const faults = new Map<string, number>();

    for (const seat of scout.visible.seats) {
      banes.set(seat.hero.bane, (banes.get(seat.hero.bane) ?? 0) + 1);
      faults.set(seat.hero.fault, (faults.get(seat.hero.fault) ?? 0) + 1);
    }

    return [...new Set([...banes.keys(), ...faults.keys()])]
      .map((type) => ({ type, banes: banes.get(type) ?? 0, faults: faults.get(type) ?? 0 }))
      .sort((a, b) => b.banes - a.banes || b.faults - a.faults || a.type.localeCompare(b.type))
      .slice(0, 4);
  }, [scout.visible.seats]);

  const seats = useMemo(
    () =>
      [...scout.visible.seats].sort(
        (a, b) => (ROW_ORDER[a.row] ?? 9) - (ROW_ORDER[b.row] ?? 9) || a.index - b.index,
      ),
    [scout.visible.seats],
  );

  return (
    <section
      aria-label={`Scouting ${scout.username}`}
      className="flex flex-col gap-4 rounded border border-line bg-surface p-6"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-lg tracking-widest uppercase text-parchment">
          {scout.username}
        </h3>
        <p className="font-mono text-xs text-faint">
          {scout.league} · hold {scout.visible.holdStreak} visible ·{' '}
          {/**
           * **Both streaks are disclosed, and only the streaks for Hidden.** A
           * player choosing a target is owed the fact that the Hidden squad they
           * might be ambushed into has held for a long time.
           */}
          {scout.hidden.holdStreak} hidden
        </p>
      </header>

      {answers.length > 0 && (
        <div>
          <h4 className="font-display text-[11px] tracking-widest uppercase text-faint">
            What answers this squad
          </h4>
          {/* Labelled, because the panel holds two lists and "the second one" is
              not a thing a screen reader or a test can ask for. */}
          <ul aria-label="What answers this squad" className="mt-2 flex flex-wrap gap-2">
            {answers.map((answer) => (
              <li
                key={answer.type}
                className="rounded border border-line px-2 py-1 font-mono text-[11px]"
              >
                <span className="text-parchment uppercase">{answer.type}</span>
                {answer.banes > 0 && (
                  <span className="ml-2 text-gold">
                    {answer.banes} bane{answer.banes === 1 ? '' : 's'}
                  </span>
                )}
                {answer.faults > 0 && (
                  <span className="ml-2 text-faint">{answer.faults} fault</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul aria-label="Visible squad" className="flex flex-col gap-2">
        {seats.map((seat) => (
          <li
            key={`${seat.row}-${seat.index}`}
            className="flex items-baseline justify-between gap-3 border-b border-line/40 pb-2 font-mono text-xs"
          >
            <span className="w-32 shrink-0 text-parchment">{seat.hero.name}</span>
            <span className="w-20 shrink-0 text-faint uppercase">{seat.row}</span>
            <span className="text-faint">
              {seat.hero.primary} · {seat.hero.secondary} · reach {seat.hero.reach}
            </span>
            {/* Bane in gold: it is the ×1.50, and the only one worth building for. */}
            <span className="text-gold">bane {seat.hero.bane}</span>
            <span className="text-faint">fault {seat.hero.fault}</span>
          </li>
        ))}
      </ul>

      {!scout.visible.canDefend && (
        <p role="status" className="font-mono text-xs text-slash-lit">
          This squad is not at full strength.
        </p>
      )}

      {children}
    </section>
  );
}
