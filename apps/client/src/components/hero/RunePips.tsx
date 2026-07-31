/**
 * Three vertical marks — one per rune slot, lit when a rune is in it (019 US2).
 *
 * ### Why this belongs on a squad card at all
 *
 * Every player owns all 27 champions and they are identical across accounts —
 * that is the competitive premise, and it means a roster screen has almost
 * nothing to say about *this* player. Runes are the exception: they are the only
 * thing anybody accumulates, they are permanent, and they are destroyed on
 * replacement. So *which of these have I actually put shards into* is a real
 * question a player asks while picking six, and until now the squad screen could
 * not answer it without a trip to the Forge.
 *
 * ### Three, always — an empty slot is drawn, not omitted
 *
 * A champion has exactly three slots (`primary`, `secondary`, `common`), so the
 * empty ones are the information. Rendering only the filled ones would make two
 * runes and three runes look like a difference in *layout*, and a champion with
 * none would show nothing at all — indistinguishable from a card that failed to
 * load.
 *
 * ### Stage is height, not colour alone
 *
 * A pip carries `stage` 1–4 as a fill fraction from the bottom, because colour
 * alone is one channel and it is the channel a colour-blind player cannot read.
 * The same reasoning retired the coloured dots on the Force filter.
 *
 * **No rule is stated here.** What a stage costs, what it grants and when the
 * fourth unlocks are the Forge's and the server's business; this reads a number
 * it was handed and draws a bar. The one thing it asserts is that `0` means
 * empty, which is the wire contract.
 */

/** Stage `0..4` per slot, in `primary · secondary · common` order. */
export interface RunePipsProps {
  readonly stages: readonly number[];
  /** Names the champion in the accessible label, when the pips sit alone. */
  readonly name?: string;
}

/** The slots, in the order the server sends them. Labels only — never a rule. */
const SLOT_NAME = ['primary', 'secondary', 'common'] as const;

/** Stages above this are still drawn full; the cap belongs to the server. */
const FULL_STAGE = 4;

export function RunePips({ stages, name }: RunePipsProps): React.JSX.Element {
  const filled = stages.filter((stage) => stage > 0).length;

  return (
    <span
      role="img"
      aria-label={
        filled === 0
          ? `${name ? `${name}: ` : ''}no runes placed`
          : `${name ? `${name}: ` : ''}${stages
              .map((stage, i) => `${SLOT_NAME[i] ?? `slot ${i + 1}`} ${stage === 0 ? 'empty' : `stage ${stage}`}`)
              .join(', ')}`
      }
      data-runes={filled}
      className="flex items-end gap-[3px]"
    >
      {SLOT_NAME.map((slot, i) => {
        const stage = stages[i] ?? 0;
        return (
          <span
            key={slot}
            data-rune-slot={slot}
            data-rune-stage={stage}
            /* The track is always drawn, so three slots occupy three widths
               whether or not anything is in them. */
            className="relative block h-3.5 w-[3px] overflow-hidden rounded-full bg-line"
          >
            {stage > 0 ? (
              <span
                className="absolute right-0 bottom-0 left-0 rounded-full bg-gold"
                style={{ height: `${(Math.min(stage, FULL_STAGE) / FULL_STAGE) * 100}%` }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
