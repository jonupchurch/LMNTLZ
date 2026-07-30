/**
 * The guild screen — **the caller** (013 T058, T061, T062, T064).
 *
 * ### This file is the point of the wiring pass
 *
 * 013's generated task list built `ApplicationForm` and `EmblemDesigner` and named
 * no screen, no nav entry and no `lib/api.ts` call. That is the same shape that
 * left feature 006 with a complete, unit-tested, unreachable squad builder, and
 * feature 012 with a profile nothing rendered. **Seven times across five features,
 * and it has never once announced itself** — an uncalled seam does not error, does
 * not log, and does not fail a test.
 *
 * So this component does the one thing no task list writes down: *call the thing.*
 * It is the only mount point for the designer, the roster, the application form and
 * the invitation list, and `tests/guilds/wiring.test.tsx` fails if it stops
 * requesting any of them.
 *
 * ### One screen, three states
 *
 * In a guild → roster and management. Not in one → invitations, applications and a
 * founding flow. Founding → the designer. They are states rather than routes
 * because the client has no router (see `App.tsx`), and because *which* of them you
 * see is a server fact, not a navigation choice.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { EmblemDesigner } from './EmblemDesigner.js';
import { GuildRoster } from './GuildRoster.js';
import { ApplicationForm } from './ApplicationForm.js';
import { InviteList } from './InviteList.js';
import { StarterWarningNotice, bothAcknowledged } from './StarterWarningNotice.js';
import type { Emblem, FoundingInfo, MyGuildState } from './types.js';

type Load<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'failed'; readonly message: string };

const BLANK: Emblem = { icon: 0, ink: 0, ground: 0 };

export function GuildScreen({
  accountId,
  onViewProfile,
  onUnauthenticated,
}: {
  accountId: string;
  onViewProfile: (targetId: string) => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [state, setState] = useState<Load<MyGuildState>>({ kind: 'loading' });
  const [founding, setFounding] = useState<FoundingInfo | null>(null);
  const [shards, setShards] = useState<number | null>(null);
  const [showFound, setShowFound] = useState(false);

  const unauthenticated = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthenticated();
        return true;
      }
      return false;
    },
    [onUnauthenticated],
  );

  /** **The wire.** `GET /v1/me/guild` is this screen's reason to exist. */
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', value: await api<MyGuildState>('/me/guild') });
    } catch (error) {
      if (unauthenticated(error)) return;
      setState({ kind: 'failed', message: 'Could not load your guild.' });
    }
  }, [unauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The founding prerequisites, **including the starter warning**.
   *
   * Fetched rather than computed: the client must never decide for itself whether
   * to warn. `GET /v1/guilds/new` returns 009's payload or `null`, and the screen
   * renders on its presence.
   */
  const loadFounding = useCallback(async () => {
    try {
      const [info, balance] = await Promise.all([
        api<FoundingInfo>('/guilds/new'),
        api<{ balance: number }>('/me/shards').catch(() => ({ balance: -1 })),
      ]);
      setFounding(info);
      setShards(balance.balance >= 0 ? balance.balance : null);
    } catch (error) {
      if (unauthenticated(error)) return;
    }
  }, [unauthenticated]);

  if (state.kind === 'loading') {
    return <p className="mx-auto max-w-[1600px] px-8 py-10 text-stone-400">Loading…</p>;
  }

  if (state.kind === 'failed') {
    return <p className="mx-auto max-w-[1600px] px-8 py-10 text-red-400">{state.message}</p>;
  }

  const { guild, role, invites, applications, applicationBudget } = state.value;

  return (
    <section className="mx-auto grid max-w-[1600px] gap-6 px-8 py-8">
      {guild ? (
        <GuildRoster
          guild={guild}
          role={role}
          accountId={accountId}
          onViewProfile={onViewProfile}
          onChanged={load}
          onUnauthenticated={onUnauthenticated}
        />
      ) : (
        <>
          <InviteList invites={invites} onChanged={load} onUnauthenticated={onUnauthenticated} />

          <ApplicationForm
            applications={applications}
            budget={applicationBudget}
            onChanged={load}
            onUnauthenticated={onUnauthenticated}
          />

          <div className="rounded-lg border border-stone-800 p-5">
            <h2 className="mb-2 text-lg font-semibold">Found your own</h2>
            {showFound && founding ? (
              <FoundingFlow
                info={founding}
                shards={shards}
                onFounded={() => {
                  setShowFound(false);
                  void load();
                }}
                onUnauthenticated={onUnauthenticated}
              />
            ) : (
              <button
                type="button"
                className="rounded bg-amber-700 px-4 py-2 text-sm font-medium"
                onClick={() => {
                  setShowFound(true);
                  void loadFounding();
                }}
              >
                Found a guild
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function FoundingFlow({
  info,
  shards,
  onFounded,
  onUnauthenticated,
}: {
  info: FoundingInfo;
  shards: number | null;
  onFounded: () => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [emblem, setEmblem] = useState<Emblem>(BLANK);
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Both, when the warning is present. `bothAcknowledged` is the single rule. */
  const warned = info.starterWarning !== null;
  const ready = name.trim().length >= 3 && (!warned || bothAcknowledged(acknowledged));
  const affordable = shards === null || shards >= info.cost;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/guilds', {
        method: 'POST',
        body: JSON.stringify({ name, pitch, emblem, acknowledged }),
      });
      onFounded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError(
        err instanceof ApiError && err.status === 402
          ? `Founding costs ${info.cost} shards.`
          : err instanceof ApiError && err.status === 409
            ? 'That name is taken, or you are already in a guild.'
            : 'Could not found the guild.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-stone-400">
        {info.cost} shards — one full rune.{' '}
        {shards === null ? null : <span>You have {shards}.</span>}{' '}
        <strong className="text-stone-200">The name is permanent.</strong>
      </p>

      <label className="grid gap-1 text-sm">
        <span className="text-stone-300">Name</span>
        <input
          className="rounded border border-stone-700 bg-stone-900 px-3 py-2"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-stone-300">Recruiting pitch</span>
        <textarea
          className="rounded border border-stone-700 bg-stone-900 px-3 py-2"
          value={pitch}
          maxLength={500}
          rows={3}
          onChange={(e) => setPitch(e.currentTarget.value)}
        />
      </label>

      <EmblemDesigner emblem={emblem} onChange={setEmblem} />

      <StarterWarningNotice
        warning={info.starterWarning}
        acknowledged={acknowledged}
        onToggle={(key, on) =>
          setAcknowledged((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
        }
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="button"
        disabled={!ready || !affordable || busy}
        className="justify-self-start rounded bg-amber-700 px-4 py-2 text-sm font-medium disabled:opacity-40"
        onClick={() => void submit()}
      >
        Found for {info.cost} shards
      </button>
    </div>
  );
}
