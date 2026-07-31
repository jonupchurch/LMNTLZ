/**
 * `CooldownRing` — **a fraction of turns, never a clock** (017 T027 · FR-008,
 * Constitution XIII).
 *
 * Combat in LMNTLZ is discrete and turn-based. A power recharges over an
 * integer number of *turns*, so this component takes `turnsRemaining` and
 * `turnsTotal` and takes nothing else. There is deliberately no `Date`, no
 * `setInterval`, no `ms` — **a ring that animates against a wall clock is a
 * rules claim made in CSS**, and it would be a false one.
 *
 * The 320ms transition below is the only time value here and it is a UI
 * transition between two discrete turn states, not a countdown. The ring never
 * moves on its own; it moves when a turn resolves.
 *
 * **The numeral is the authoritative read**, per the export — the arc is the
 * glanceable version and the number is the truth.
 */

export interface CooldownRingProps {
  /** Turns still to wait. `0` means ready. */
  readonly turnsRemaining: number;
  /** The power's full cooldown, in turns. */
  readonly turnsTotal: number;
  readonly size?: number;
}

const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CooldownRing({
  turnsRemaining,
  turnsTotal,
  size = 34,
}: CooldownRingProps): React.JSX.Element {
  /**
   * A tier-0 power has `cooldown: 0` and is always ready. Dividing by it would
   * give `NaN` and silently erase the ring, so the zero case is answered
   * explicitly as "nothing left to wait for" rather than guarded against.
   */
  const remaining = Math.max(0, Math.min(turnsRemaining, turnsTotal));
  const fraction = turnsTotal <= 0 ? 0 : remaining / turnsTotal;
  const ready = remaining === 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      role="img"
      aria-label={
        ready ? 'ready' : `recharging, ${remaining} of ${turnsTotal} turns remaining`
      }
      data-turns-remaining={remaining}
      data-turns-total={turnsTotal}
    >
      <circle cx="17" cy="17" r={RADIUS} fill="none" strokeWidth="3" className="stroke-raised" />
      {!ready && (
        <circle
          cx="17"
          cy="17"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="butt"
          className="stroke-gold transition-[stroke-dashoffset] duration-(--duration-slow) ease-in-out"
          strokeDasharray={CIRCUMFERENCE}
          /* Fraction of the circle still to burn down. One step per turn — the
             arc lands on the same positions every time because the input is an
             integer count, not an elapsed time. */
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 17 17)"
        />
      )}
      <text
        x="17"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-parchment font-mono text-[11px] tabular-nums"
      >
        {ready ? '' : remaining}
      </text>
    </svg>
  );
}
