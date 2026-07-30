/**
 * Applying, and **the first-acceptance contract stated where the decision is made**
 * (013 T017 · FR-011).
 *
 * ### The contract goes here, not on a confirmation screen
 *
 * FR-011 is specific: *"the first-acceptance-wins contract MUST be stated **where a
 * player applies**"*. A player firing off five applications is making a decision
 * about all five at once, and the thing they need to know — that the first guild to
 * say yes takes them and the other four close — is only useful *before* they send
 * them.
 *
 * ### The budget is a number, not an error
 *
 * FR-008 says *"shown as a budget rather than discovered as an error"*. `used / max`
 * is rendered whether or not it is full. A cap a player only meets by hitting it
 * reads as a fault, because they cannot tell a rule from a bug.
 */

import { useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import type { ApplicationView } from './types.js';

export function ApplicationForm({
  applications,
  budget,
  onChanged,
  onUnauthenticated,
}: {
  applications: readonly ApplicationView[];
  budget: { readonly used: number; readonly max: number };
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [guildId, setGuildId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = applications.filter((a) => a.state === 'open');
  const full = budget.used >= budget.max;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/guilds/${guildId}/applications`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setGuildId('');
      setMessage('');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No such guild.'
          : err instanceof ApiError && err.status === 409
            ? 'That application was refused — check your budget and any cooldown.'
            : 'Could not apply.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-800 p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Apply to a guild</h2>
        <span className="text-sm text-stone-400" data-testid="application-budget">
          {budget.used} of {budget.max} open
        </span>
      </div>

      {/**
       * FR-011. Stated here, always — not behind a tooltip and not only when the
       * player already has several open.
       */}
      <p className="mb-3 text-sm text-stone-400">
        You can hold {budget.max} applications at once, and they are free.{' '}
        <strong className="text-stone-200">
          The first guild to accept you takes you, and the rest are withdrawn
          automatically.
        </strong>{' '}
        An application you never hear back about expires after seven days.
      </p>

      {open.length > 0 ? (
        <ul className="mb-3 grid gap-1 text-sm text-stone-300">
          {open.map((a) => (
            <li key={a.id} className="flex items-center justify-between">
              <span>{a.guildId}</span>
              <button
                type="button"
                className="text-xs text-stone-400 underline"
                onClick={() => {
                  void api(`/applications/${a.id}/withdraw`, { method: 'POST' })
                    .then(onChanged)
                    .catch(() => setError('Could not withdraw.'));
                }}
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
        <input
          aria-label="Guild id"
          placeholder="Guild id"
          className="rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
          value={guildId}
          onChange={(e) => setGuildId(e.currentTarget.value)}
        />
        <input
          aria-label="Message"
          placeholder="Say something (optional)"
          className="rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
          value={message}
          maxLength={300}
          onChange={(e) => setMessage(e.currentTarget.value)}
        />
        <button
          type="button"
          disabled={guildId.trim() === '' || full || busy}
          className="rounded bg-amber-700 px-4 py-2 text-sm font-medium disabled:opacity-40"
          onClick={() => void submit()}
        >
          Apply
        </button>
      </div>

      {full ? (
        <p className="mt-2 text-sm text-amber-400">
          All {budget.max} are open. Withdraw one to apply somewhere else.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
