/**
 * The profile screen — **the caller** (012 T038–T043).
 *
 * ### Why this file is the point of Phase 7
 *
 * `PublicProfile.tsx` and `BattleRecord.tsx` were complete, typed and correct
 * before this file existed, and **not one of them could be reached from the
 * running app**. Nothing rendered them, and nothing requested a single one of
 * the four routes feature 012 registered. Every gate was green.
 *
 * That has now happened six times in this project. So this component exists to
 * do the one thing no task list ever writes down: *call the thing*.
 *
 * ### It also closes half of a known gap
 *
 * `GET /v1/me/shards` has existed since feature 010 with **no client caller at
 * all** — shards were earned, spent on runes and capped entirely out of sight.
 * The rename price is 325 shards, so this screen has to show a balance, and that
 * makes it the first browser surface in the game to read any progression route.
 *
 * Runes and entitlements still have none. Named, not folded in.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { PublicProfile } from './PublicProfile.js';
import { AvatarPicker } from './AvatarPicker.js';
import { RenamePanel } from './RenamePanel.js';
import { ExportPanel } from './ExportPanel.js';
import type { AvatarState, PublicProfileData, ShardState } from './types.js';

type Load<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'failed'; readonly message: string };

export function ProfileScreen({
  targetId,
  isSelf,
  onUnauthenticated,
}: {
  targetId: string;
  /** Own-profile controls — rename, avatar, export — only on your own page. */
  isSelf: boolean;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [profile, setProfile] = useState<Load<PublicProfileData>>({ kind: 'loading' });
  const [shards, setShards] = useState<ShardState | null>(null);
  const [avatars, setAvatars] = useState<AvatarState | null>(null);

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

  const loadProfile = useCallback(async () => {
    setProfile({ kind: 'loading' });
    try {
      setProfile({
        kind: 'ready',
        value: await api<PublicProfileData>(`/players/${targetId}/profile`),
      });
    } catch (error) {
      if (unauthenticated(error)) return;
      setProfile({
        kind: 'failed',
        message:
          error instanceof ApiError && error.status === 404
            ? 'No such player.'
            : 'That profile could not be loaded.',
      });
    }
  }, [targetId, unauthenticated]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /**
   * **The two own-account reads, and they are deliberately not fatal.** A
   * profile still renders completely without a shard balance; failing the whole
   * screen because a price could not be fetched would make a secondary read
   * outrank the primary one.
   */
  const loadOwn = useCallback(async () => {
    if (!isSelf) return;
    try {
      const [balance, avatarState] = await Promise.all([
        api<ShardState>('/me/shards'),
        api<AvatarState>('/me/avatar'),
      ]);
      setShards(balance);
      setAvatars(avatarState);
    } catch (error) {
      if (unauthenticated(error)) return;
      // Left null. The panels below render their own "unavailable" state.
    }
  }, [isSelf, unauthenticated]);

  useEffect(() => {
    void loadOwn();
  }, [loadOwn]);

  if (profile.kind === 'loading') {
    return (
      <main className="mx-auto max-w-[1600px] px-8 py-10">
        <p className="text-sm tracking-widest text-faint uppercase" role="status">
          Loading profile…
        </p>
      </main>
    );
  }

  if (profile.kind === 'failed') {
    return (
      <main className="mx-auto max-w-[1600px] px-8 py-10">
        <p className="text-sm text-muted" role="alert">
          {profile.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-8 py-10">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PublicProfile profile={profile.value} />

        {isSelf ? (
          <aside className="space-y-10">
            <ShardBalance shards={shards} />
            <RenamePanel
              currentUsername={profile.value.username}
              shards={shards}
              onRenamed={() => {
                void loadProfile();
                void loadOwn();
              }}
              onUnauthenticated={onUnauthenticated}
            />
            <AvatarPicker
              state={avatars}
              onChanged={() => {
                void loadProfile();
                void loadOwn();
              }}
              onUnauthenticated={onUnauthenticated}
            />
            <ExportPanel onUnauthenticated={onUnauthenticated} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}

/**
 * **The first thing in this game to put a shard balance on a screen.**
 *
 * The cap is shown as runes as well as shards because feature 010's contract
 * requires the cap be *presented* as ten full runes — a client cannot derive
 * that from 6,500 without hard-coding the rune price it was told not to.
 */
function ShardBalance({ shards }: { shards: ShardState | null }): JSX.Element {
  return (
    <section aria-labelledby="shards-heading">
      <h2 id="shards-heading" className="font-display text-sm tracking-widest text-faint uppercase">
        Shards
      </h2>
      {shards ? (
        <>
          <p className="mt-2 font-display text-2xl text-gold tabular-nums">
            {shards.balance.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-faint">
            Cap {shards.cap.shards.toLocaleString()} — {shards.cap.runes} full runes
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-faint">Balance unavailable.</p>
      )}
    </section>
  );
}
