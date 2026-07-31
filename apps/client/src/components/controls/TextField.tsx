/**
 * `TextField` and `Toggle` — form fields in the four states the export draws
 * (017 T022): rest, focus, error, disabled.
 *
 * **Error is a state of the field, not a paragraph underneath it.** The export
 * draws the invalid value still in the box (`Wardn Cort`) with the message
 * below — the player's input is never cleared for them, because retyping a
 * long name to fix one letter is the actual cost of a "helpful" reset.
 *
 * The message is wired with `aria-describedby` and `aria-invalid` rather than
 * only coloured, so the failure reaches a screen reader. Colour alone would
 * make the error state invisible to exactly the users least able to guess.
 */

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  readonly label: string;
  /** Present means the field is in its error state; the text is shown below. */
  readonly error?: string;
  /** Right-aligned hint inside the control — the export's `3 / 27` result count. */
  readonly adornment?: ReactNode;
}

export function TextField({
  label,
  error,
  adornment,
  disabled,
  ...rest
}: TextFieldProps): React.JSX.Element {
  const id = useId();
  const messageId = `${id}-message`;
  const invalid = error !== undefined;

  return (
    <div className="flex flex-col gap-1" data-state={invalid ? 'error' : disabled ? 'disabled' : 'rest'}>
      <label htmlFor={id} className="text-caption text-muted font-display tracking-wide uppercase">
        {label}
      </label>
      <div
        className={[
          'flex items-center gap-2 rounded-md bg-void px-3 ring-1',
          'h-(--control-md) transition-colors duration-(--duration-fast) ease-out',
          invalid ? 'ring-danger' : 'ring-line',
          disabled ? 'opacity-60' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          {...rest}
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? messageId : undefined}
          /* No `outline-none` here. The global `:focus-visible` ring is the
             only focus treatment in the app and a component may not opt out. */
          className="text-body min-w-0 flex-1 bg-transparent text-parchment placeholder:text-faint disabled:cursor-not-allowed"
        />
        {adornment && <span className="text-caption text-faint font-mono shrink-0">{adornment}</span>}
      </div>
      {invalid && (
        <p id={messageId} className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
}

/**
 * A real `<button role="switch">` rather than a styled checkbox — the export
 * draws a track and a knob, and `aria-checked` on a switch is what tells a
 * screen reader "on/off" instead of "checked".
 */
export function Toggle({ label, checked, onChange, disabled }: ToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={[
          'inline-flex h-5 w-9 items-center rounded-xl p-0.5',
          'transition-colors duration-(--duration-base) ease-out',
          checked ? 'bg-gold' : 'bg-raised',
        ].join(' ')}
      >
        <span
          className={[
            'size-4 rounded-xl bg-parchment',
            'transition-transform duration-(--duration-base) ease-out',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      <span className="text-body">{label}</span>
    </button>
  );
}
