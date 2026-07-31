/**
 * `Button` — **seven states, and the seventh is Pending** (017 T021).
 *
 * ### The contract says `success`; the export says `pending`. The export wins.
 *
 * `contracts/components.md` enumerates the seventh state as `success`. No
 * export draws a success button, and the Design System export draws a Pending
 * one with a paragraph explaining it. T021 settles which is authoritative —
 * *"a state that exists in the export and not here is the defect T015
 * catches"* — so the state list is read off the design, and the contract's
 * enumeration is the thing that is wrong. Recorded rather than quietly swapped.
 *
 * It also happens to be the right call for this game specifically. LMNTLZ is
 * **server-authoritative**: the client sends an intent and the server resolves
 * it, so "the click landed, the server has not answered yet" is a state the
 * interface is in constantly. A success flash is decoration; pending is load
 * bearing.
 *
 * > *"The label holds its width, the fill dims to a pulse, and the control
 * > stops accepting input without going grey — grey reads as 'you can't',
 * > pending means 'you already did'."*
 *
 * And the pulse **never spins**: a spinner reads as "loading data", a pulse
 * reads as "the server is deciding", which is what is actually true.
 *
 * ### Why `state` covers pseudo-classes too
 *
 * Three of the seven — hover, pressed, focus — are ordinarily CSS pseudo
 * states and cannot be photographed side by side. The `state` prop lets the
 * gallery render all seven at once (T015) while real interaction still runs
 * through `:hover` / `:active` / `:focus-visible` for a button left at `rest`.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type ButtonState =
  | 'rest'
  | 'hover'
  | 'pressed'
  | 'focus'
  | 'disabled'
  | 'loading'
  | 'pending';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'disabled'> {
  readonly variant?: ButtonVariant;
  readonly state?: ButtonState;
  readonly size?: ButtonSize;
  readonly children?: ReactNode;
}

/** Base, then the forced-hover and forced-pressed appearances for the gallery. */
const VARIANT: Record<ButtonVariant, { base: string; hover: string; pressed: string }> = {
  primary: {
    base: 'bg-gold text-void font-semibold',
    hover: 'bg-light-lit text-void font-semibold',
    pressed: 'bg-light-deep text-parchment font-semibold',
  },
  secondary: {
    base: 'bg-raised text-parchment ring-1 ring-line',
    hover: 'bg-surface text-parchment ring-1 ring-muted',
    pressed: 'bg-void text-muted ring-1 ring-line',
  },
  ghost: {
    base: 'bg-transparent text-muted',
    hover: 'bg-surface text-parchment',
    pressed: 'bg-void text-muted',
  },
  danger: {
    base: 'bg-danger text-parchment font-semibold',
    hover: 'bg-slash-lit text-void font-semibold',
    pressed: 'bg-slash-deep text-parchment font-semibold',
  },
  icon: {
    base: 'bg-transparent text-muted aspect-square p-0',
    hover: 'bg-surface text-parchment aspect-square p-0',
    pressed: 'bg-void text-muted aspect-square p-0',
  },
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-(--control-sm) px-3 text-caption',
  md: 'h-(--control-md) px-4 text-h3',
  lg: 'h-(--control-lg) px-6 text-h2',
};

export function Button({
  variant = 'primary',
  state = 'rest',
  size = 'md',
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const skin = VARIANT[variant];

  /**
   * Disabled greys out; **pending deliberately does not**. Grey says "you
   * cannot", and by the time a button is pending the player already has.
   */
  const appearance =
    state === 'hover'
      ? skin.hover
      : state === 'pressed'
        ? skin.pressed
        : state === 'disabled'
          ? 'bg-raised text-faint'
          : skin.base;

  const busy = state === 'loading' || state === 'pending';
  const inert = busy || state === 'disabled';

  return (
    <button
      type="button"
      {...rest}
      disabled={inert}
      aria-busy={busy || undefined}
      data-state={state}
      data-variant={variant}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-display uppercase tracking-wide',
        'transition-colors duration-(--duration-fast) ease-out',
        'disabled:cursor-not-allowed',
        SIZE[size],
        appearance,
        /* The gallery's focus column. Real focus still comes from the global
           `:focus-visible` ring in base.css, which no component overrides. */
        state === 'focus' ? 'outline-2 outline-offset-2 outline-air shadow-[0_0_0_2px_var(--color-void)]' : '',
        state === 'pending' ? 'animate-pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {state === 'loading' && (
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {/* The label holds its width in every state — a control that resizes
          when the server is thinking makes the whole row twitch. */}
      <span>{children}</span>
    </button>
  );
}
