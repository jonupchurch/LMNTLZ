/**
 * SQUAD READOUT — the strategic centrepiece of the squad builder (019 US2).
 *
 * `resources/03-squad-builder.md` calls this *"a live squad-synergy / coverage
 * panel — the strategic centerpiece"*, and the client had none of it: the
 * builder showed six names and a Save button, so the one screen where LMNTLZ's
 * whole premise lives — *read the enemy's weaknesses, don't stack your own* —
 * gave a player nothing to read.
 *
 * Four readings, in the order the design stacks them:
 *
 * 1. **Collective vulnerability** — what this six bleeds to, per force.
 * 2. **Damage coverage** — which doors it can open.
 * 3. **Tempo** — whether its damage is now or later.
 * 4. **Reach distribution** — who can connect from where.
 *
 * Every number comes from `analysis.ts`, which reads `bane`, `fault` and
 * `strengths` off `@lmntlz/content`'s derived `Hero`. Nothing here authors a
 * weakness and nothing transcribes a multiplier (Constitution XV).
 *
 * ### It renders an incomplete squad, deliberately
 *
 * A squad under construction is the normal state of this screen, not an error,
 * so every reading is honest about a partial six rather than blanking until the
 * sixth champion lands. A player choosing a fifth wants to know what the first
 * four already bleed to — that is the moment the panel is worth having.
 */

import type { DamageType, Hero } from '@lmntlz/content';
import { DAMAGE_TYPES } from '@lmntlz/content';
import { FORCE_FILL, FORCE_GRADIENT, FORCE_TEXT } from '../../components/index.js';
import {
  coverage,
  headline,
  reachSpread,
  sharedDoors,
  tempo,
  vulnerability,
} from './analysis.js';

export interface SquadReadoutProps {
  /** The seated champions, in seat order. Fewer than six is expected. */
  readonly squad: readonly Hero[];
  /** Whoever holds the single back seat, for the reach note. */
  readonly backSeat?: Hero | null;
}

export function SquadReadout({ squad, backSeat = null }: SquadReadoutProps): React.JSX.Element {
  const rows = vulnerability(squad);
  const doors = sharedDoors(squad);
  const cover = coverage(squad);
  const pace = tempo(squad);
  const reach = reachSpread(squad);

  return (
    <section aria-label="Squad readout" className="flex flex-col gap-5" data-testid="squad-readout">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 font-display tracking-widest text-parchment uppercase">
          Squad readout
        </h2>
        <p className="text-body text-muted">{headline(squad)}</p>
      </header>

      <Callout doors={doors} seated={squad.length} />

      {/* --- 1 · collective vulnerability ---------------------------------- */}
      <Section title="Collective vulnerability">
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.type} className="flex items-center gap-2">
              <span className="text-caption w-14 shrink-0 font-mono tracking-wider text-faint uppercase">
                {row.type}
              </span>
              <span
                role="img"
                aria-label={`${row.type}: ${describe(row.banes, row.faults)}`}
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-void shadow-(--shadow-hairline)"
              >
                <span
                  className={`block h-full rounded-sm transition-[width] duration-(--duration-slow) ease-in-out ${FORCE_GRADIENT[row.type]}`}
                  style={{ width: `${Math.round(row.weight * 100)}%` }}
                />
              </span>
              {/**
               * **A Bane outranks a Fault in the label, not just the bar.** The
               * design writes `1 BANE` in caps and `1 fault` in lower case, and
               * that casing is the whole hierarchy on a 10px line. A force that
               * is both is written out — the export never draws that case, but
               * six champions over nine forces produce it routinely.
               */}
              <span className="text-caption w-16 shrink-0 text-right font-mono">
                {row.banes > 0 ? (
                  <span className={FORCE_TEXT[row.type]}>
                    {row.banes} BANE
                    {row.faults > 0 ? <span className="text-faint"> +{row.faults}</span> : null}
                  </span>
                ) : row.faults > 0 ? (
                  <span className="text-faint">{row.faults} fault</span>
                ) : (
                  <span className="text-decor">&ndash;</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* --- 2 · damage coverage ------------------------------------------- */}
      <Section title="Damage coverage">
        <ul className="flex flex-wrap gap-1.5">
          {DAMAGE_TYPES.map((type) => {
            const has = cover.covered.has(type);
            return (
              <li key={type}>
                <span
                  data-covered={has}
                  className={[
                    'text-caption inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono tracking-wider uppercase',
                    has
                      ? 'border-line bg-raised text-parchment'
                      : 'border-line/50 text-decor',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className={[
                      'size-1.5 rounded-full',
                      has ? FORCE_FILL[type].split(' ')[0]! : 'bg-decor',
                    ].join(' ')}
                  />
                  {type}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-body text-muted">
          {cover.count} of {DAMAGE_TYPES.length} forces covered
          {cover.count >= 6
            ? ' — broad enough to open most doors.'
            : cover.count === 0
              ? '.'
              : ' — narrow, and a defender who resists them all takes very little.'}
        </p>
      </Section>

      {/* --- 3 · tempo ------------------------------------------------------ */}
      <Section title="Tempo">
        <div className="lz-surface flex flex-col gap-3 p-3">
          <div className="text-caption flex items-baseline justify-between font-mono tracking-widest text-faint uppercase">
            <span>Burst</span>
            <span>Sustain</span>
          </div>
          {/**
           * **A dot on a line, not a slider** — nothing here is adjustable. It
           * is `role="img"` with the sentence as its label, so a screen reader
           * gets the reading rather than a control it cannot operate.
           */}
          <div
            role="img"
            aria-label={TEMPO_SENTENCE[pace.band]}
            className="relative h-1 rounded-full bg-void shadow-(--shadow-hairline)"
          >
            <span
              aria-hidden
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-(--shadow-glow-gold-strong)"
              style={{ left: `${Math.round((1 - pace.burst) * 100)}%` }}
            />
          </div>
          <p className="text-body text-muted">{TEMPO_SENTENCE[pace.band]}</p>
        </div>
      </Section>

      {/* --- 4 · reach ------------------------------------------------------ */}
      <Section title="Reach distribution">
        <ul className="flex flex-col gap-1.5">
          <ReachRow dot="bg-air" label="Reach 2 — can strike from the middle row" value={reach.long} />
          <ReachRow dot="bg-crush" label="Reach 1 — must sit front to connect" value={reach.short} />
          {backSeat ? (
            <ReachRow
              dot="bg-earth"
              label={`Back seat: ${backSeat.name} (reach ${backSeat.reach})`}
              value={backSeat.reach}
            />
          ) : (
            <ReachRow dot="bg-decor" label="Back seat empty" value={0} />
          )}
        </ul>
      </Section>
    </section>
  );
}

const TEMPO_SENTENCE: Record<'sustain' | 'balanced' | 'burst', string> = {
  sustain: 'Sustained pressure — little held back, and little to wait for.',
  balanced: 'Balanced tempo — an opening punch with something held back.',
  burst: 'Burst-heavy — most of the damage is behind a cooldown. Survive to reach it.',
};

/**
 * The callout under the headline.
 *
 * **The good case is stated, not left implicit.** The design draws the
 * no-shared-door squad as an earth-tinted panel saying so, and that is the
 * right call: a player who has built well learns *why* it was well built, and
 * a panel that only ever appears to complain trains people to ignore it.
 */
function Callout({
  doors,
  seated,
}: {
  readonly doors: ReturnType<typeof sharedDoors>;
  readonly seated: number;
}): React.JSX.Element | null {
  if (seated === 0) return null;

  if (doors.length === 0) {
    return (
      <aside className="lz-surface border-l-2 border-l-earth p-3">
        <p className="text-caption font-mono tracking-widest text-earth-lit uppercase">
          Closed formation
        </p>
        <p className="text-body mt-1 text-parchment">
          No shared door. Every Bane in this six is unique — nothing here bleeds twice to the same
          Force.
        </p>
      </aside>
    );
  }

  const worst = [...doors].sort((a, b) => b.banes - a.banes)[0]!;
  return (
    <aside className="lz-surface border-l-2 border-l-danger p-3" data-shared-doors={doors.length}>
      <p className="text-caption font-mono tracking-widest text-slash-lit uppercase">Shared door</p>
      <p className="text-body mt-1 text-parchment">
        {worst.banes} of this squad take <span className={FORCE_TEXT[worst.type]}>{worst.type}</span>{' '}
        as their Bane. One champion of that Force opens all {worst.banes} at once.
      </p>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-caption font-mono tracking-widest text-faint uppercase">{title}</h3>
      {children}
    </section>
  );
}

function ReachRow({
  dot,
  label,
  value,
}: {
  readonly dot: string;
  readonly label: string;
  readonly value: number;
}): React.JSX.Element {
  return (
    <li className="text-body flex items-center gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1 text-muted">{label}</span>
      <span className="font-mono tabular-nums text-parchment">{value}</span>
    </li>
  );
}

/** `1 bane and 2 faults`, for the bar's accessible label. */
function describe(banes: number, faults: number): string {
  const parts: string[] = [];
  if (banes > 0) parts.push(`${banes} ${banes === 1 ? 'bane' : 'banes'}`);
  if (faults > 0) parts.push(`${faults} ${faults === 1 ? 'fault' : 'faults'}`);
  return parts.length === 0 ? 'nobody bleeds to this' : parts.join(' and ');
}

/** Re-exported so a seat card can colour a chip the same way. */
export type { DamageType };
