/**
 * Three slots, and the stat line the next stage would move (018 T014, T015).
 *
 * ### Planning is free, and this component is where that is true
 *
 * `06-progression.md` makes deliberation *correct play*, because a rune is
 * destroyed when it is replaced. So choosing a stat here **sends nothing and
 * stores nothing** — there is no request in this file at all, and
 * `tests/forge/planning.test.tsx` asserts that by moving a draft around and
 * requiring the fetch stub to stay untouched. A "save your plan" call would be
 * a small convenience that makes the free half of the design cost something.
 *
 * ### The cap is checked here **and** on the server, and neither is redundant
 *
 * Constitution XII: the client renders what it is allowed to and the server
 * decides. The server answers `422 cap-exceeded`, which is the rule. This check
 * is the courtesy in front of it — a refusal *before* the click, naming the
 * stat and the headroom, so the player is not made to spend a round trip
 * learning that 45 + 20 + 20 is over 75.
 *
 * **`STAT_CAP` is imported, never written.** It is a content rule and
 * `@lmntlz/content` exports it precisely so no screen says `75`.
 */

import { STAT_CAP, STAT_KEYS, type Hero, type StatKey } from '@lmntlz/content';
import { RUNE_EFFECTS } from '@lmntlz/sim/rules';
import type { JSX } from 'react';
import { RUNE_SLOTS, type OwnedHeroRunes, type RuneSlot } from './types.js';
import { UtilityPicker } from './UtilityPicker.js';

export interface SlotPlannerProps {
  readonly hero: Hero;
  readonly runes: OwnedHeroRunes;
  readonly selected: RuneSlot;
  readonly onSelect: (slot: RuneSlot) => void;
  /** The stat the next stage would go on. `null` until one is chosen. */
  readonly draftStat: StatKey | null;
  readonly onDraft: (stat: StatKey | null) => void;
  /** `config.stageBoosts[stage]` — what the next stage would add. */
  readonly nextBoost: number;
  /**
   * The stage-4 effect under consideration, and how to change it (021).
   *
   * Optional so the planner still renders in a test that only cares about stats —
   * but when a stage-4 slot is selected and this is absent, the player is shown a
   * stage with nothing to choose, which is the defect. `ForgeScreen` always passes
   * it.
   */
  readonly draftUtility?: string | null;
  readonly onChooseUtility?: ((id: string | null) => void) | undefined;
}

const SLOT_LABEL: Record<RuneSlot, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  common: 'Common',
};

/** Points this hero already has from every placed rune, per stat. */
export function placedPoints(runes: OwnedHeroRunes): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const slot of runes.slots) {
    for (const [stat, amount] of Object.entries(slot.allocations)) {
      out[stat as StatKey] = (out[stat as StatKey] ?? 0) + amount;
    }
  }
  return out;
}

/**
 * Whether `stat` has room for `boost` — **base + placed + boost against the
 * cap**, which is the same sum the server performs.
 *
 * Returns the headroom rather than a boolean, so the refusal can name it. *"Over
 * the cap"* sends the player to work out by how much; *"5 of those 20 would be
 * wasted"* is the same refusal doing the arithmetic it is already holding.
 */
export function headroomFor(hero: Hero, runes: OwnedHeroRunes, stat: StatKey): number {
  const base = hero.stats[stat];
  const placed = placedPoints(runes)[stat] ?? 0;
  return Math.max(0, STAT_CAP - base - placed);
}

export function SlotPlanner({
  hero,
  runes,
  selected,
  onSelect,
  draftStat,
  onDraft,
  nextBoost,
  draftUtility,
  onChooseUtility,
}: SlotPlannerProps): JSX.Element {
  const placed = placedPoints(runes);
  const slotOf = (slot: RuneSlot) => runes.slots.find((s) => s.slot === slot)!;

  /** All three stat boosts placed — the condition the utility slot is gated on. */
  const complete = (slot: RuneSlot): boolean => slotOf(slot).stage >= 3;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Rune slots">
        <h3 className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
          Three slots · one primary, one secondary, one common
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {RUNE_SLOTS.map((slot) => {
            const state = slotOf(slot);
            const isSelected = slot === selected;

            return (
              <button
                key={slot}
                type="button"
                aria-pressed={isSelected}
                /**
                 * **Explicit, because the computed name runs the card
                 * together.** This tile stacks a label, a stage, an element and
                 * up to three allocations with no whitespace between the
                 * elements, so the name computed from its content is
                 * `"Primaryempty earth"` — announced as one nonsense word. The
                 * squad zone tabs hit the same thing in 006 and were fixed the
                 * same way.
                 */
                aria-label={`${SLOT_LABEL[slot]} slot, ${
                  state.stage === 0 ? 'empty' : `stage ${state.stage} of 4`
                }`}
                onClick={() => onSelect(slot)}
                data-slot={slot}
                data-stage={state.stage}
                /*
                 * **An empty slot is drawn as empty.** The export's rule for
                 * every line in this screen is `style: placed ? solid : dashed`,
                 * and until 019 a slot with nothing in it had the same solid
                 * border as a complete one — so the only thing separating "no
                 * rune" from "four stages and a utility effect" was reading the
                 * word `empty` in the corner. Three slots per champion, 27
                 * champions, and the shape said nothing.
                 *
                 * `lz-empty` sets its own border, so it must not be paired with
                 * a `border-*` utility — the two are the same property and which
                 * one wins is Tailwind's emit order rather than this list's.
                 */
                className={[
                  'flex flex-col gap-2 rounded-lg p-3 text-left transition-colors',
                  isSelected
                    ? 'border-2 border-gold bg-raised shadow-(--shadow-glow-gold)'
                    : state.stage === 0
                      ? 'lz-empty bg-surface/40 hover:border-faint'
                      : 'border-2 border-line bg-surface hover:border-faint',
                ].join(' ')}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-caption font-display uppercase tracking-wide text-parchment">
                    {SLOT_LABEL[slot]}
                  </span>
                  <span className="text-caption font-mono text-faint">
                    {/* `0` is empty, and the word is what the player reads. */}
                    {state.stage === 0
                      ? 'empty'
                      : state.stage === 4
                        ? 'complete'
                        : `stage ${state.stage}`}
                  </span>
                </span>

                <span className="text-caption block font-mono uppercase text-faint">
                  {/* `common` takes any element, so it says so rather than
                      naming one. */}
                  {state.element ?? 'any force'}
                </span>

                <span className="flex flex-col gap-1">
                  {Object.entries(state.allocations).length === 0 ? (
                    <span className="text-caption font-mono text-faint">nothing placed</span>
                  ) : (
                    Object.entries(state.allocations).map(([stat, amount]) => (
                      <span key={stat} className="text-caption flex gap-2 font-mono">
                        <span className="text-parchment">+{amount}</span>
                        <span className="truncate text-muted">{stat}</span>
                      </span>
                    ))
                  )}
                </span>

                {/**
                 * **The utility gate, stated on the slot it applies to.** It is
                 * reachable only once all three stat boosts are placed, and
                 * saying so here is what stops it reading as a bug.
                 */}
                {state.stage === 3 && (
                  <span className="text-caption font-mono text-gold">utility unlocked</span>
                )}
                {state.stage < 3 && state.stage > 0 && (
                  <span className="text-caption font-mono text-faint">
                    utility at stage 4
                  </span>
                )}
                {state.utility ? (
                  /* **The name, not the id.** This printed `the-floor-comes-up`
                     until 021 gave the ids something to be looked up in. */
                  <span className="text-caption font-mono text-gold" data-utility-placed={state.utility}>
                    {RUNE_EFFECTS[state.utility]?.name ?? state.utility}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Stat line">
        <h3 className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
          Stat line · cap {STAT_CAP} per stat
        </h3>

        {nextBoost === 0 ? (
          /**
           * **Stage 4 buys no stat points, and until 021 it bought nothing else
           * either.** This branch used to end at the sentence below — accurate
           * about the allocation and silent about the fact that there was also
           * nothing to *choose*, which is how the most expensive stage of a rune
           * came to charge 200 shards and store `null`.
           */
          <div className="flex flex-col gap-3">
            <p className="text-caption font-mono text-muted">
              This stage buys the utility effect rather than stat points, so there is
              nothing to allocate.
            </p>
            {onChooseUtility ? (
              <UtilityPicker
                heroId={hero.id}
                slot={selected}
                chosen={draftUtility ?? null}
                onChoose={onChooseUtility}
              />
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {STAT_KEYS.map((stat) => {
              const base = hero.stats[stat];
              const already = placed[stat] ?? 0;
              const headroom = headroomFor(hero, runes, stat);
              const drafting = draftStat === stat;
              const wasted = Math.max(0, nextBoost - headroom);
              const blocked = headroom === 0;

              return (
                <li key={stat}>
                  <button
                    type="button"
                    aria-pressed={drafting}
                    onClick={() => onDraft(drafting ? null : stat)}
                    data-stat={stat}
                    data-blocked={blocked ? 'true' : 'false'}
                    className={[
                      'text-caption grid w-full grid-cols-[7rem_1fr_auto] items-center gap-3 rounded border px-3 py-1 text-left font-mono transition-colors',
                      drafting
                        ? 'border-gold bg-raised shadow-(--shadow-glow-gold)'
                        : blocked
                          ? 'border-line text-faint'
                          : 'border-line hover:border-faint',
                    ].join(' ')}
                  >
                    <span className="uppercase">{stat}</span>

                    <span className="text-muted">
                      {base}
                      {already > 0 && <span className="text-gold"> +{already}</span>}
                      {drafting && !blocked && (
                        <span className="text-earth-lit"> +{Math.min(nextBoost, headroom)}</span>
                      )}
                      <span className="text-faint"> / {STAT_CAP}</span>
                    </span>

                    {/**
                     * **The refusal names why, before anything is charged**
                     * (FR-004). "Over the cap" makes the player do the
                     * arithmetic this line is already holding.
                     */}
                    <span className={blocked ? 'text-slash-lit' : 'text-faint'}>
                      {blocked
                        ? 'at the cap'
                        : wasted > 0
                          ? `${wasted} would be wasted`
                          : `${headroom} room`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/**
         * The stage-4 gate again, where a player looking at an empty slot
         * would otherwise wonder why the utility never appears.
         */}
        {!complete(selected) && (
          <p className="text-caption mt-2 font-mono text-faint">
            The utility slot opens once all three stat boosts are placed.
          </p>
        )}
      </section>
    </div>
  );
}
