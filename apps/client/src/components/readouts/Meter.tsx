/**
 * `Meter` — a bar with a value, a max and a **tone** (017 T028).
 *
 * `tone` is not a colour prop in disguise. It takes either one of the nine
 * forces or one of the semantic roles, and the fill is derived from that — so
 * an HP bar asks for `water` because the hero *is* Water, not because someone
 * chose blue. Constitution XV: colour never becomes a second source of truth.
 *
 * `max` of zero renders an indeterminate bar rather than dividing by it. The
 * export draws exactly that case — `LOADING ROSTER —` — so "we do not know the
 * total yet" is a designed state, not a defect to guard against.
 */

import type { DamageType } from '@lmntlz/content';
import { FORCE_FILL } from '../type/forceClasses.js';

export type MeterTone = DamageType | 'strong' | 'danger' | 'success' | 'neutral';

export interface MeterProps {
  readonly value: number;
  readonly max: number;
  readonly tone?: MeterTone;
  readonly label?: string;
  /** Hides the numeric read; the bar alone. */
  readonly bare?: boolean;
}

const SEMANTIC_FILL: Record<'strong' | 'danger' | 'success' | 'neutral', string> = {
  strong: 'bg-gold',
  danger: 'bg-danger',
  success: 'bg-success',
  neutral: 'bg-muted',
};

function fillClass(tone: MeterTone): string {
  if (tone in SEMANTIC_FILL) return SEMANTIC_FILL[tone as keyof typeof SEMANTIC_FILL];
  /* The force map carries `bg-x text-void`; only the fill applies to a bar. */
  return FORCE_FILL[tone as DamageType].split(' ')[0]!;
}

export function Meter({
  value,
  max,
  tone = 'neutral',
  label,
  bare = false,
}: MeterProps): React.JSX.Element {
  const indeterminate = max <= 0;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(1, value / max)) * 100;

  return (
    <div className="flex flex-col gap-1" data-tone={tone}>
      {(label || !bare) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <span className="text-caption text-muted font-display tracking-wide uppercase">
              {label}
            </span>
          )}
          {!bare && (
            <span className="text-caption font-mono tabular-nums">
              {indeterminate ? '—' : `${Math.round(pct)}%`}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        /* Omitting `aria-valuenow` is what marks a progressbar indeterminate. */
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : max}
        className="h-2 overflow-hidden rounded-sm bg-void ring-1 ring-line"
      >
        <div
          className={[
            'h-full transition-[width] duration-(--duration-slow) ease-in-out',
            indeterminate ? 'w-1/3 animate-pulse bg-raised' : fillClass(tone),
          ].join(' ')}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
