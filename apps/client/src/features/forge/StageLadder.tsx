/**
 * The four stages, priced and described **entirely from served data**
 * (018 T013 · FR-001).
 *
 * ### Not one number here is a literal, and that is the requirement
 *
 * `config.stageCosts` and `config.stageBoosts` come off `GET /v1/me/shards`.
 * The Rune Forge export writes its own table —
 *
 * ```js
 * const STAGE_META = [
 *   { kind:"MAJOR", val:"+20", amount:20, cost:150 },
 *   ...
 * ```
 *
 * — and it is right today. It would stay in the bundle after the first tuning
 * pass moved a cost, and the player would read one price and be charged
 * another, with nothing to catch it because both compile (Constitution XV).
 *
 * ### Stage 4 costs more and grants nothing, which is the whole gate
 *
 * Stages 1–3 buy `+20 · +10 · +5`. **Stage 4 costs 200 and grants no stat
 * points at all** — it unlocks a utility effect. So the utility slot is a bad
 * buy early, while the roster still has obvious fills, and a good buy late once
 * the 75 cap has absorbed everything the boosts can give. The gate justifies
 * itself economically rather than by a rule, and this component says so rather
 * than dressing a `0` up as a feature.
 *
 * The labels come from the export — MAJOR · MINOR · TRACE · UTILITY — but which
 * one is which is derived from the boosts, so a reordered ladder relabels itself
 * instead of lying.
 */

import type { JSX } from 'react';
/**
 * **`STAT_CAP`, because the sentence below used to say `75`** (T042).
 *
 * It was rendered as literal copy in a paragraph explaining why the fourth
 * stage is worth buying — the same shape as the guild founding cost that said
 * `650` in four places (017 T057), and the same reason it is wrong: a content
 * rule with a second home is a rule that can disagree with itself. Every other
 * number on this screen already comes from `config.*`; this one hid inside
 * prose, which is precisely where a numbers scan does not look.
 */
import { STAT_CAP } from '@lmntlz/content';
import { Button } from '../../components/index.js';

export interface StageLadderProps {
  /** `[150, 150, 150, 200]` — from `config.stageCosts`, never written down. */
  readonly costs: readonly number[];
  /** `[20, 10, 5, 0]` — from `config.stageBoosts`. */
  readonly boosts: readonly number[];
  /** `0..4`. The stage already committed on this slot. */
  readonly stage: number;
  readonly balance: number;
  readonly onCommit?: (() => void) | undefined;
}

/**
 * MAJOR · MINOR · TRACE · UTILITY, **derived from the boost rather than
 * indexed**. A ladder reordered on the server relabels itself; a hardcoded
 * `['MAJOR','MINOR','TRACE','UTILITY']` would keep calling the biggest boost
 * whatever position 1 happened to hold.
 */
function kindOf(boost: number, boosts: readonly number[]): string {
  if (boost === 0) return 'Utility';
  const ranked = [...new Set(boosts.filter((b) => b > 0))].sort((a, b) => b - a);
  return ['Major', 'Minor', 'Trace'][ranked.indexOf(boost)] ?? 'Boost';
}

export function StageLadder({
  costs,
  boosts,
  stage,
  balance,
  onCommit,
}: StageLadderProps): JSX.Element {
  const nextIndex = stage;
  const nextCost = costs[nextIndex];
  const affordable = nextCost !== undefined && balance >= nextCost;

  return (
    <section aria-label="Stage ladder" className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {costs.map((cost, i) => {
          const boost = boosts[i] ?? 0;
          const done = i < stage;
          const next = i === stage;

          return (
            <li
              key={i}
              data-stage={i + 1}
              data-state={done ? 'placed' : next ? 'next' : 'later'}
              /*
               * **A stage not yet reached is dashed** — the export's
               * `style: stat ? "solid" : "dashed"`, applied to the ladder it
               * came from. `done` and `next` are things that exist; `later` is
               * a place a stage will go, and drawing all three solid made the
               * ladder read as four equal rows in different colours.
               *
               * `lz-empty` owns the border, so the `later` branch carries no
               * `border-*` of its own — see `SlotPlanner` for why that pairing
               * is a coin flip rather than an override.
               */
              className={[
                'text-caption flex items-center gap-3 rounded px-3 py-2 font-mono',
                done
                  ? 'border border-earth bg-earth-deep/20 text-parchment'
                  : next
                    ? 'border border-gold bg-raised shadow-(--shadow-glow-gold) text-parchment'
                    : 'lz-empty text-faint',
              ].join(' ')}
            >
              <span className="w-16 shrink-0 uppercase tracking-wide">
                {kindOf(boost, boosts)}
              </span>
              <span className="w-12 shrink-0 text-parchment">
                {/* A `+0` would read as a bug. Stage 4 grants an effect. */}
                {boost > 0 ? `+${boost}` : 'effect'}
              </span>
              <span className="ml-auto shrink-0">◈ {cost}</span>
            </li>
          );
        })}
      </ol>

      {nextCost === undefined ? (
        <p className="text-caption font-mono text-earth-lit">
          This rune is complete. All four stages are placed.
        </p>
      ) : (
        <>
          {/**
           * **The balance sits beside the price, always** (T018). A screen that
           * shows a cost without what you hold makes the player leave to find
           * out whether they can pay it.
           */}
          <p className="text-caption font-mono text-faint">
            Next stage ◈ {nextCost} · you hold ◈ {balance}
            {!affordable && (
              <span className="text-slash-lit"> · {nextCost - balance} short</span>
            )}
          </p>

          {boosts[nextIndex] === 0 && (
            <p className="text-caption text-muted">
              The fourth stage buys no stat points. It unlocks this rune&rsquo;s utility
              effect, which is why it is worth more once the {STAT_CAP} cap has absorbed
              what the boosts can give.
            </p>
          )}

          {onCommit ? (
            /* 017's `Button`, not a private one (T043). `state` carries the
               refusal, so an unaffordable stage is disabled by the component
               rather than by a class this file chose. */
            <Button
              variant="primary"
              size="sm"
              state={affordable ? 'rest' : 'disabled'}
              onClick={onCommit}
            >
              Commit stage {nextIndex + 1}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
