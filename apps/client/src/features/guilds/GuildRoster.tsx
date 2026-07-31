/**
 * The roster and the management controls (013 T064).
 *
 * ### The client renders what it is allowed to; the server decides
 *
 * Constitution XII. Hiding a control is a courtesy, not a protection — every action
 * here is authorised server-side and `roles.test.ts` asserts the `403` rather than
 * the button's absence. So this file may safely show a member the roster and hide
 * the kick buttons: the hiding is for their benefit, not ours.
 *
 * ### Every member links to their profile
 *
 * Which is what makes the guild badge on a profile (T063) a round trip rather than
 * a dead end.
 */

import { useState, type JSX } from 'react';
import { Button } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { EmblemDesigner } from './EmblemDesigner.js';
import type { Emblem, GuildView } from './types.js';

export function GuildRoster({
  guild,
  role,
  accountId,
  foundingCostShards,
  onViewProfile,
  onChanged,
  onUnauthenticated,
}: {
  guild: GuildView;
  role: 'master' | 'officer' | 'member' | null;
  accountId: string;
  /** From `GET /me/guild`. Never written into a sentence here — see T057. */
  foundingCostShards: number;
  onViewProfile: (targetId: string) => void;
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [editingEmblem, setEditingEmblem] = useState(false);
  const [emblem, setEmblem] = useState<Emblem>(guild.emblem);

  const isMaster = role === 'master';
  const canManage = role === 'master' || role === 'officer';

  const call = async (path: string, init: RequestInit, message: string): Promise<void> => {
    setError(null);
    try {
      await api(path, init);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError(message);
    }
  };

  return (
    <div className="grid gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h1 font-display uppercase tracking-wide">{guild.name}</h2>
          <p className="text-caption font-mono text-faint">
            {guild.memberCount} of {guild.capacity} · founded{' '}
            {new Date(guild.foundedAt).toLocaleDateString()}
          </p>
          {guild.pitch ? (
            <p className="text-body text-muted mt-2 max-w-2xl">{guild.pitch}</p>
          ) : null}
        </div>

        {isMaster ? (
          <Button variant="secondary" size="sm" onClick={() => setEditingEmblem((v) => !v)}>
            {editingEmblem ? 'Done' : 'Change emblem'}
          </Button>
        ) : null}
      </header>

      {guild.motd ? (
        <p className="text-body rounded border border-line bg-surface p-3 text-parchment">
          {guild.motd}
        </p>
      ) : null}

      {editingEmblem ? (
        <div className="grid gap-3 rounded-lg border border-line p-4">
          <EmblemDesigner emblem={emblem} onChange={setEmblem} />
          <span className="justify-self-start">
            <Button
              onClick={() =>
                void call(
                  `/guilds/${guild.id}/emblem`,
                  { method: 'PUT', body: JSON.stringify({ emblem }) },
                  'Could not save the emblem.',
                )
              }
            >
              Save emblem
            </Button>
          </span>
        </div>
      ) : null}

      {/**
       * **Two columns of members, which is what the export draws** (017 T055).
       *
       * `LMNTLZ Guild Roster.dc.html` splits the roster
       * `repeat(2, minmax(0,1fr))` with its own header row over each half, and
       * the reason is the cap: a guild holds **24**, so one column is a list
       * long enough that the bottom of it is off screen at the 1280 floor while
       * the right-hand two thirds of the row sit empty.
       *
       * Twelve rows a side at capacity. Below `md` it falls back to one column
       * rather than shrinking the columns — a 24-row list that scrolls is
       * readable, and two 4-word columns are not.
       */}
      <div className="grid gap-x-6 md:grid-cols-2">
        <table className="w-full text-body">
          <caption className="sr-only">Guild members</caption>
          <thead className="text-caption text-left font-mono tracking-widest uppercase text-faint">
            <tr>
              <th className="py-1">Member</th>
              <th className="py-1">Role</th>
              <th className="py-1">Joined</th>
              {canManage ? <th className="py-1">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {guild.members.map((m) => (
              <tr key={m.playerId} className="border-t border-line">
                <td className="py-2">
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => onViewProfile(m.playerId)}
                  >
                    {m.username ?? m.playerId}
                  </button>
                </td>
                <td className="py-2 capitalize text-muted">{m.role}</td>
                <td className="py-2 text-faint">{new Date(m.joinedAt).toLocaleDateString()}</td>
                {canManage ? (
                  <td className="py-2">
                    {m.playerId === accountId || m.role === 'master' ? null : (
                      <span className="flex gap-2">
                        {isMaster ? (
                          <button
                            type="button"
                            className="text-caption underline"
                            onClick={() =>
                              void call(
                                `/guilds/${guild.id}/members/${m.playerId}/role`,
                                {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    role: m.role === 'officer' ? 'member' : 'officer',
                                  }),
                                },
                                'Could not change that role.',
                              )
                            }
                          >
                            {m.role === 'officer' ? 'Demote' : 'Promote'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-caption text-slash-lit underline"
                          onClick={() =>
                            void call(
                              `/guilds/${guild.id}/members/${m.playerId}`,
                              { method: 'DELETE' },
                              'Could not remove them.',
                            )
                          }
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void call(`/guilds/${guild.id}/leave`, { method: 'POST' }, 'Could not leave.')
          }
        >
          Leave guild
        </Button>
        {isMaster ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() =>
              void call(`/guilds/${guild.id}`, { method: 'DELETE' }, 'Could not disband.')
            }
          >
            {/**
             * **The price comes off the payload** (017 T057, FR-019).
             *
             * This sentence used to read `Disband — the 650 is not returned`,
             * with the number typed in. It was right, and it was one edit to
             * `FOUNDING_COST_SHARDS` away from being a lie the player acts on
             * — and nothing anywhere would have caught it, because a wrong
             * number in a sentence compiles.
             */}
            Disband — the {foundingCostShards} is not returned
          </Button>
        ) : null}
      </footer>

      {error ? (
        <p role="alert" className="text-body text-slash-lit">
          {error}
        </p>
      ) : null}
    </div>
  );
}
