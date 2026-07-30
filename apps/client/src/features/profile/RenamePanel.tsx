/**
 * Change your name — and see what it costs before you commit (012 T042).
 *
 * **The price is shown next to the balance on purpose.** A rename is 325 shards
 * and the server refuses with `402` when the player cannot afford it; a form that
 * only discovered that on submit would spend a round trip teaching the player
 * something the screen already knew.
 */

import { useState, type FormEvent, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import type { ShardState } from './types.js';

/** Mirrors `RENAME_COST_SHARDS`. Displayed only; the server is authoritative. */
const RENAME_COST_SHARDS = 325;

interface RenameResult {
  readonly username: string;
  readonly shardsCharged: number;
  readonly changesRemaining: number;
}

export function RenamePanel({
  currentUsername,
  shards,
  onRenamed,
  onUnauthenticated,
}: {
  currentUsername: string;
  shards: ShardState | null;
  onRenamed: () => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const affordable = shards === null || shards.balance >= RENAME_COST_SHARDS;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || value.trim().length === 0) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await api<RenameResult>('/me/username', {
        method: 'PUT',
        body: JSON.stringify({ username: value.trim() }),
      });

      setValue('');
      setMessage({
        tone: 'ok',
        text:
          result.shardsCharged > 0
            ? `Renamed. ${result.shardsCharged} shards spent, ${result.changesRemaining} changes left this month.`
            : `Renamed, free of charge. ${result.changesRemaining} changes left this month.`,
      });
      onRenamed();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthenticated();
        return;
      }
      setMessage({
        tone: 'bad',
        text:
          error instanceof ApiError
            ? // The server's own message names which rule matched — "that reads
              // the same as an existing name" is the one worth surfacing, since
              // a Cyrillic lookalike is invisible by inspection.
              error.message
            : 'That rename could not be completed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="rename-heading">
      <h2 id="rename-heading" className="font-display text-sm tracking-widest text-faint uppercase">
        Name
      </h2>
      <p className="mt-2 text-sm text-muted">
        You are <span className="text-parchment">{currentUsername}</span>.
      </p>

      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="block">
          <span className="sr-only">New name</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="A new name"
            maxLength={24}
            className="w-full rounded border border-line bg-raised px-3 py-2 text-sm text-parchment"
          />
        </label>

        <p className="text-xs text-faint">
          {RENAME_COST_SHARDS} shards. Your first change is free.
          {shards ? ` You have ${shards.balance.toLocaleString()}.` : null}
        </p>

        <button
          type="submit"
          disabled={busy || value.trim().length === 0 || !affordable}
          className="rounded border border-gold px-4 py-2 font-display text-sm tracking-widest text-parchment uppercase disabled:border-line disabled:text-faint"
        >
          {busy ? 'Changing…' : 'Change name'}
        </button>

        {!affordable ? (
          <p className="text-xs text-faint">Not enough shards for a paid change.</p>
        ) : null}

        {message ? (
          <p
            role="status"
            className={`text-xs ${message.tone === 'ok' ? 'text-gold' : 'text-muted'}`}
          >
            {message.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}
