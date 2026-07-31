/**
 * Browsing and applying — **the screen that made applying possible**.
 *
 * The application form used to ask a human to type a guild UUID. Every route
 * worked; nobody could use one. This is the other half.
 *
 * ### Applying happens from the card, not from a separate form
 *
 * Because the decision *is* the card: this guild, this pitch, this many seats. A
 * separate form asks the player to carry an identifier across a screen, which is
 * the thing computers are for.
 *
 * ### The first-acceptance contract sits above the list (FR-011)
 *
 * *Where a player applies* — which is here, not on a confirmation dialog they will
 * meet after they have already decided.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { GROUNDS, ICONS, INKS } from './EmblemDesigner.js';
import { StarterWarningNotice, bothAcknowledged } from './StarterWarningNotice.js';
import type { ApplicationView, GuildView, StarterWarning } from './types.js';

interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly emblem: GuildView['emblem'];
  readonly pitch: string;
  readonly memberCount: number;
  readonly capacity: number;
  readonly hasRoom: boolean;
}

export function GuildBrowser({
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly DirectoryEntry[]>([]);
  const [warning, setWarning] = useState<StarterWarning | null>(null);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openIds = new Set(applications.filter((a) => a.state === 'open').map((a) => a.guildId));
  const full = budget.used >= budget.max;

  /** **The wire.** `GET /v1/guilds` — without it there is no way to reach a guild. */
  const search = useCallback(
    async (q: string) => {
      try {
        const body = await api<{ guilds: readonly DirectoryEntry[] }>(
          `/guilds?q=${encodeURIComponent(q)}`,
        );
        /** `?? []` because an unexpected shape must degrade to an empty list, not
         * throw inside render and take the whole Guild tab down with it. */
        setResults(body.guilds ?? []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onUnauthenticated();
          return;
        }
        setError('Could not load guilds.');
      }
    },
    [onUnauthenticated],
  );

  useEffect(() => {
    void search('');
  }, [search]);

  const applyTo = async (guildId: string): Promise<void> => {
    setError(null);
    try {
      await api(`/guilds/${guildId}/applications`, {
        method: 'POST',
        body: JSON.stringify({ acknowledged }),
      });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { starterWarning?: StarterWarning } | undefined;
        if (body?.starterWarning) {
          /** The server decides whether to warn; this screen only renders it. */
          setWarning(body.starterWarning);
          return;
        }
        setError('That application was refused — check your budget and any cooldown.');
        return;
      }
      setError('Could not apply.');
    }
  };

  return (
    <div className="rounded-lg border border-line p-5">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="text-h2 font-semibold">Find a guild</h2>
        <span className="text-body text-faint" data-testid="application-budget">
          {budget.used} of {budget.max} open
        </span>
      </div>

      <p className="mb-3 text-body text-faint">
        Applications are free and you can hold {budget.max} at once.{' '}
        <strong className="text-parchment">
          The first guild to accept you takes you, and the rest are withdrawn
          automatically.
        </strong>{' '}
        One you never hear back about expires after seven days.
      </p>

      <input
        aria-label="Search guilds"
        placeholder="Search by name"
        className="mb-4 w-full rounded border border-line bg-void px-3 py-2 text-body"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          void search(e.currentTarget.value);
        }}
      />

      <StarterWarningNotice
        warning={warning}
        acknowledged={acknowledged}
        onToggle={(key, on) =>
          setAcknowledged((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
        }
      />

      <ul className="mt-3 grid gap-2">
        {results.map((guild) => {
          const applied = openIds.has(guild.id);
          const blocked = warning !== null && !bothAcknowledged(acknowledged);

          return (
            <li
              key={guild.id}
              className="flex items-start justify-between gap-4 rounded border border-line p-3"
            >
              <span className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded"
                  style={{
                    background: GROUNDS[guild.emblem.ground],
                    color: INKS[guild.emblem.ink],
                  }}
                >
                  <span className="text-xl leading-none">{ICONS[guild.emblem.icon]}</span>
                </span>
                <span>
                  <span className="block font-medium text-parchment">{guild.name}</span>
                  <span className="block text-caption text-faint">
                    {guild.memberCount} of {guild.capacity}
                    {guild.hasRoom ? '' : ' · full'}
                  </span>
                  {guild.pitch ? (
                    <span className="mt-1 block max-w-xl text-body text-muted">
                      {guild.pitch}
                    </span>
                  ) : null}
                </span>
              </span>

              <button
                type="button"
                disabled={applied || full || !guild.hasRoom || blocked}
                className="shrink-0 rounded bg-gold text-void px-3 py-1 text-body disabled:opacity-40"
                onClick={() => void applyTo(guild.id)}
              >
                {applied ? 'Applied' : 'Apply'}
              </button>
            </li>
          );
        })}
      </ul>

      {results.length === 0 ? (
        <p className="mt-3 text-body text-faint">
          {query === '' ? 'No guilds yet — found the first one.' : 'Nothing by that name.'}
        </p>
      ) : null}

      {full ? (
        <p className="mt-2 text-body text-crush-lit">
          All {budget.max} are open. Withdraw one to apply somewhere else.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-body text-slash-lit">{error}</p> : null}
    </div>
  );
}
