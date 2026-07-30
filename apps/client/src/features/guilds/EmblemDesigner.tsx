/**
 * The emblem designer — **36 icons, 12 inks, 12 grounds** (013 T030, T031).
 *
 * ### It warns on low contrast and never blocks
 *
 * FR-004 and Constitution XVIII: *harm is a gate, taste is a note.* **A solid block
 * of colour is a permitted choice** — icon 0 is blank, and ink 0 on ground 0 is
 * exactly that. The warning is a sentence beside the preview, not a disabled Save.
 *
 * ### There is no upload here, and that is the whole reason there is no review
 *
 * An emblem is three indices into a palette vetted at authoring time — all 5,184
 * combinations. **Composition is what removes the review, not a relaxed policy.**
 * An avatar is an *upload* and is still pre-moderated (feature 012).
 */

import { useMemo, type JSX } from 'react';
import type { Emblem } from './types.js';

/**
 * Twelve inks and twelve grounds, **chosen so illegibility is unreachable by
 * accident** (FR-003).
 *
 * The palettes are deliberately far apart in lightness: inks cluster dark and
 * saturated, grounds cluster light or deep-neutral. A player has to *aim* at a
 * low-contrast pair, which is what makes the warning rare enough to be read.
 *
 * The nine Forces come first in both lists, so a guild can fly its allegiance.
 */
export const INKS = [
  '#7c5c34', // Earth
  '#6fa8b5', // Air
  '#c0492b', // Fire
  '#2f6f9f', // Water
  '#b8912f', // Light
  '#4a3a6b', // Dark
  '#8d3a3a', // Slash
  '#3f6b4a', // Pierce
  '#5a5a63', // Crush
  '#1d1f24',
  '#403247',
  '#243447',
] as const;

export const GROUNDS = [
  '#e8dcc4',
  '#dceaee',
  '#f2ded5',
  '#dbe7f2',
  '#f4ecd2',
  '#ded8e8',
  '#efdcdc',
  '#dcebe0',
  '#e4e4e8',
  '#12141a',
  '#1e1a26',
  '#101a26',
] as const;

/** 36 icons, index 0 blank. Glyphs stand in until the art pass draws them. */
export const ICONS = [
  '', '▲', '◆', '●', '■', '★', '✦', '✚', '❖', '▼', '◈', '⬟',
  '⌘', '☾', '☀', '⚑', '⚔', '⛨', '⚓', '⌂', '♜', '♞', '♛', '⟡',
  '⧗', '⧉', '◉', '◍', '◐', '⬢', '⬡', '✧', '✵', '❋', '➤', '⊛',
] as const;

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const channel = (start: number): number => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio, 1..21. Below 3 is where a glyph starts to disappear. */
export function contrastRatio(ink: string, ground: string): number {
  const a = luminance(ink);
  const b = luminance(ground);
  const [light, dark] = a > b ? [a, b] : [b, a];

  return (light + 0.05) / (dark + 0.05);
}

export const LOW_CONTRAST = 3;

export function EmblemDesigner({
  emblem,
  onChange,
}: {
  emblem: Emblem;
  onChange: (next: Emblem) => void;
}): JSX.Element {
  const ratio = useMemo(
    () => contrastRatio(INKS[emblem.ink] ?? INKS[0], GROUNDS[emblem.ground] ?? GROUNDS[0]),
    [emblem.ink, emblem.ground],
  );

  const low = ratio < LOW_CONTRAST;

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <div
          data-testid="emblem-preview"
          className="flex h-32 w-32 items-center justify-center rounded-lg border border-stone-700"
          style={{ background: GROUNDS[emblem.ground], color: INKS[emblem.ink] }}
        >
          <span className="text-6xl leading-none">{ICONS[emblem.icon]}</span>
        </div>

        {/**
         * **A note, never a gate.** The Save control is untouched by this — a
         * player who wants a solid block of colour is allowed one.
         */}
        {low ? (
          <p role="status" className="max-w-[16rem] text-center text-xs text-amber-400">
            These two are close in tone, so the icon will be hard to make out. You can
            keep it — this is a note, not a rule.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <Palette
          label="Icon"
          count={ICONS.length}
          selected={emblem.icon}
          onSelect={(icon) => onChange({ ...emblem, icon })}
          render={(i) => (
            <span className="text-lg leading-none">{ICONS[i] === '' ? '—' : ICONS[i]}</span>
          )}
        />
        <Palette
          label="Ink"
          count={INKS.length}
          selected={emblem.ink}
          onSelect={(ink) => onChange({ ...emblem, ink })}
          render={(i) => (
            <span className="block h-4 w-4 rounded-sm" style={{ background: INKS[i] }} />
          )}
        />
        <Palette
          label="Ground"
          count={GROUNDS.length}
          selected={emblem.ground}
          onSelect={(ground) => onChange({ ...emblem, ground })}
          render={(i) => (
            <span className="block h-4 w-4 rounded-sm" style={{ background: GROUNDS[i] }} />
          )}
        />
      </div>
    </div>
  );
}

function Palette({
  label,
  count,
  selected,
  onSelect,
  render,
}: {
  label: string;
  count: number;
  selected: number;
  onSelect: (index: number) => void;
  render: (index: number) => JSX.Element;
}): JSX.Element {
  return (
    <fieldset>
      <legend className="mb-1 text-xs uppercase tracking-wide text-stone-400">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${label} ${i}`}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            className={`flex h-8 w-8 items-center justify-center rounded border ${
              selected === i ? 'border-amber-400' : 'border-stone-700'
            }`}
          >
            {render(i)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
