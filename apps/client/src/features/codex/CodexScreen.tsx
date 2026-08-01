/**
 * The Codex — *THE LAWS* and *THE CHAMPIONS* (017 T061, T062, T063).
 *
 * ### Every number here is generated, and that is the entire design
 *
 * This is the screen that *states the rules*, so it is the screen where a
 * transcribed number does the most damage: a player reads it as authoritative
 * and builds against it. So nothing below is typed out.
 *
 * - The counter ring comes from `counter()`, the **generated bijection** — it
 *   cannot disagree with the engine because it *is* what the engine asks.
 * - The effectiveness ladder comes from the five tier constants. ⚠️ **Four
 *   design exports print `FAULT ×1.2` and none prints `×0.80` at all.** Typing
 *   the ladder here would have shipped a rule that is wrong by 0.05 and a tier
 *   that does not exist. Read from `@lmntlz/content`, it is correct by
 *   construction — and `Effectiveness` makes `1.2` a compile error, so it
 *   cannot drift back (FR-019, SC-010).
 * - Bane and Fault are shown **as derived**, with the derivation displayed:
 *   `bane = counter(primary)`, `fault = counter(secondary)`. Constitution XV
 *   forbids authoring them, and showing the arrow is how a reader learns the
 *   rule rather than memorising 27 special cases.
 *
 * **No new route.** The client already ships the roster in the bundle, so the
 * Codex costs one screen and zero requests.
 */

import {
  BANE,
  counter,
  DAMAGE_TYPES,
  FAULT,
  getAllHeroes,
  MAGIC_TYPES,
  MELEE_TYPES,
  NEUTRAL,
  RESISTED_PRIMARY,
  RESISTED_SECONDARY,
  type DamageType,
  type Effectiveness,
} from '@lmntlz/content';
import { HeroIcon, Panel, RelationshipStrip, TypeBadge } from '../../components/index.js';
import { ReachAxis } from './ReachAxis.js';
import type { HeroId } from '@lmntlz/content';

/** `×1.50`, two decimals, so `0.80` reads as a tier rather than a rounding. */
const show = (m: Effectiveness): string => `×${m.toFixed(2)}`;

/** The five rungs, read — never typed. */
const LADDER: readonly { readonly label: string; readonly value: Effectiveness; readonly note: string }[] = [
  { label: 'Bane', value: BANE, note: 'counter(primary) — the major weakness' },
  { label: 'Fault', value: FAULT, note: 'counter(secondary) — the minor weakness' },
  { label: 'Neutral', value: NEUTRAL, note: 'no relationship either way' },
  { label: 'Resisted', value: RESISTED_SECONDARY, note: 'the hero’s secondary Force' },
  { label: 'Resisted', value: RESISTED_PRIMARY, note: 'the hero’s primary Force' },
];

function CounterRing({ types, title }: { types: readonly DamageType[]; title: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-h3 font-display tracking-widest text-faint uppercase">{title}</h3>
      <ul className="flex flex-col gap-1">
        {types.map((type) => (
          <li key={type} className="flex items-center gap-2">
            <TypeBadge type={type} size="sm" />
            <span aria-hidden="true" className="text-faint">
              →
            </span>
            {/* The generated bijection. Not a table, not a memory. */}
            <TypeBadge type={counter(type)} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CodexScreen(): React.JSX.Element {
  const heroes = getAllHeroes();

  return (
    <>
      <Panel span={12}>
        <h1 className="text-h1 font-display uppercase tracking-wide">The Laws of Aethrym</h1>
        <p className="text-body mt-2 max-w-3xl text-muted">
          Nine Forces. Six arcane in a ring, three martial in a triangle. Each counters exactly one
          other and is countered by exactly one other, and no Force crosses between the families —
          so there is no safe type, only a matchup you have prepared for.
        </p>
      </Panel>

      <Panel span={6}>
        <h2 className="text-h2 mb-3 font-display uppercase tracking-wide">The counter ring</h2>
        <div className="flex gap-8">
          <CounterRing types={MAGIC_TYPES} title="Arcane · the ring" />
          <CounterRing types={MELEE_TYPES} title="Martial · the triangle" />
        </div>
      </Panel>

      <Panel span={6}>
        <h2 className="text-h2 mb-3 font-display uppercase tracking-wide">Effectiveness</h2>
        <table className="text-body w-full border-collapse">
          <caption className="sr-only">The five effectiveness tiers</caption>
          <thead>
            <tr className="text-caption border-b border-line text-left font-display tracking-widest text-faint uppercase">
              <th scope="col" className="py-2 pr-4 font-normal">
                Tier
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Multiplier
              </th>
              <th scope="col" className="py-2 font-normal">
                Where it comes from
              </th>
            </tr>
          </thead>
          <tbody>
            {LADDER.map((rung) => (
              <tr key={`${rung.label}-${rung.value}`} className="border-b border-line/40">
                <td className="py-2 pr-4 text-parchment">{rung.label}</td>
                <td className="py-2 pr-4 font-mono tabular-nums text-gold">{show(rung.value)}</td>
                <td className="text-caption py-2 text-muted">{rung.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-caption mt-3 text-muted">
          A dual-typed power takes the better of its two types, so no tier-4 or tier-5 power is
          ever resisted.
        </p>
      </Panel>

      {/*
       * **Reach, which the Codex did not explain until 019.**
       *
       * It is the rule that gates all targeting and the one a new player is
       * most likely to get wrong, because it is counter-intuitive twice over:
       * the axis is shared rather than per-side, and distance counts *occupied*
       * rows, so a champion's range grows as the battle goes badly.
       */}
      <Panel span={12}>
        <h2 className="text-h2 mb-1 font-display uppercase tracking-wide">Reach and the axis</h2>
        <p className="text-body mb-4 max-w-3xl text-muted">
          Both squads stand on <strong className="text-parchment">one shared axis of six rows</strong>,
          numbered from the attackers&rsquo; rearmost seat to the defenders&rsquo;. Every champion has
          a reach of 1 or 2, measured in rows crossed — and a champion&rsquo;s own row counts against
          it, so the back seat starts the battle unable to touch anybody across the line.
        </p>

        <ReachAxis />

        <p className="text-body mt-4 max-w-3xl text-muted">
          <strong className="text-parchment">Only occupied rows count.</strong> A row holding
          nothing but the fallen is skipped entirely, so range opens up as a battle wears on and
          the seat that could do nothing on turn one decides it later. The same rule governs
          healing: a heal is range-limited exactly as an attack is.
        </p>
      </Panel>

      <Panel span={12}>
        <h2 className="text-h2 mb-1 font-display uppercase tracking-wide">The Champions</h2>
        <p className="text-body mb-3 text-muted">
          {heroes.length} champions, three for each Force, unlocked from the start and identical
          for every player.{' '}
          <strong className="text-parchment">
            Weaknesses are derived from the two Forces, never authored.
          </strong>
        </p>

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {heroes.map((hero) => (
            <li key={hero.id} className="rounded-lg bg-surface p-3 shadow-(--shadow-glow-1)">
              <div className="flex items-center gap-2">
                <HeroIcon heroId={hero.id as HeroId} name={hero.name} size="tile" />
                <div className="min-w-0 flex-1">
                  <span className="text-h3 block truncate font-display uppercase">{hero.name}</span>
                  <span className="text-caption block font-mono text-muted uppercase">
                    {hero.role} · reach {hero.reach}
                  </span>
                </div>
              </div>

              {/* The derivation, shown rather than asserted. */}
              <p className="text-caption mt-2 font-mono text-faint">
                bane = counter({hero.primary}) = {hero.bane} · fault = counter({hero.secondary}) ={' '}
                {hero.fault}
              </p>

              <div className="mt-2">
                <RelationshipStrip hero={hero} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel span={12}>
        <h2 className="text-h2 mb-3 font-display uppercase tracking-wide">Every Force</h2>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TYPES.map((type) => (
            <TypeBadge key={type} type={type} size="md" />
          ))}
        </div>
      </Panel>
    </>
  );
}
