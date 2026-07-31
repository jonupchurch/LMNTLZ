/**
 * `Pill` — a compact labelled read (017 T028).
 *
 * The export's stat pills: `HP 1 840`, `DEF 204 ▲`, `SPD 64 ▼`, `CRIT 12%`.
 * The arrows are a **direction**, not decoration — a buffed or debuffed stat
 * has to be readable at chip scale where there is no room for a tooltip.
 *
 * Direction is carried by the glyph as well as the colour, so the buff/debuff
 * distinction survives for a colour-blind player. Same rule as the
 * relationship strip: shape first, colour second.
 */

import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'strong' | 'danger' | 'success' | 'warning' | 'info';
export type PillTrend = 'up' | 'down';

export interface PillProps {
  readonly label?: string;
  readonly children: ReactNode;
  readonly tone?: PillTone;
  readonly trend?: PillTrend;
}

const TONE: Record<PillTone, string> = {
  neutral: 'bg-surface text-parchment ring-line',
  strong: 'bg-surface text-gold ring-gold',
  danger: 'bg-surface text-danger ring-danger',
  success: 'bg-surface text-success ring-success',
  warning: 'bg-surface text-warning ring-warning',
  info: 'bg-surface text-info ring-info',
};

const TREND_GLYPH: Record<PillTrend, string> = { up: '▲', down: '▼' };

export function Pill({ label, children, tone = 'neutral', trend }: PillProps): React.JSX.Element {
  return (
    <span
      data-tone={tone}
      data-trend={trend}
      className={`inline-flex h-6 items-center gap-1.5 rounded-sm px-2 ring-1 ${TONE[tone]}`}
    >
      {label && (
        <span className="text-caption text-muted font-display tracking-wide uppercase">{label}</span>
      )}
      <span className="text-caption font-mono tabular-nums">{children}</span>
      {trend && (
        <span aria-label={trend === 'up' ? 'increased' : 'decreased'} className="text-caption">
          {TREND_GLYPH[trend]}
        </span>
      )}
    </span>
  );
}
