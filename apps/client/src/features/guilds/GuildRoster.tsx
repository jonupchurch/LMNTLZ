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
import { api, ApiError } from '../../lib/api.js';
import { EmblemDesigner } from './EmblemDesigner.js';
import type { Emblem, GuildView } from './types.js';

export function GuildRoster({
  guild,
  role,
  accountId,
  onViewProfile,
  onChanged,
  onUnauthenticated,
}: {
  guild: GuildView;
  role: 'master' | 'officer' | 'member' | null;
  accountId: string;
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
          <h2 className="text-2xl font-semibold">{guild.name}</h2>
          <p className="text-sm text-stone-400">
            {guild.memberCount} of {guild.capacity} · founded{' '}
            {new Date(guild.foundedAt).toLocaleDateString()}
          </p>
          {guild.pitch ? <p className="mt-2 max-w-2xl text-sm text-stone-300">{guild.pitch}</p> : null}
        </div>

        {isMaster ? (
          <button
            type="button"
            className="rounded border border-stone-700 px-3 py-1 text-sm"
            onClick={() => setEditingEmblem((v) => !v)}
          >
            {editingEmblem ? 'Done' : 'Change emblem'}
          </button>
        ) : null}
      </header>

      {guild.motd ? (
        <p className="rounded border border-stone-800 bg-stone-900/60 p-3 text-sm text-stone-200">
          {guild.motd}
        </p>
      ) : null}

      {editingEmblem ? (
        <div className="grid gap-3 rounded-lg border border-stone-800 p-4">
          <EmblemDesigner emblem={emblem} onChange={setEmblem} />
          <button
            type="button"
            className="justify-self-start rounded bg-amber-700 px-4 py-2 text-sm"
            onClick={() =>
              void call(
                `/guilds/${guild.id}/emblem`,
                { method: 'PUT', body: JSON.stringify({ emblem }) },
                'Could not save the emblem.',
              )
            }
          >
            Save emblem
          </button>
        </div>
      ) : null}

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="py-1">Member</th>
            <th className="py-1">Role</th>
            <th className="py-1">Joined</th>
            {canManage ? <th className="py-1">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {guild.members.map((m) => (
            <tr key={m.playerId} className="border-t border-stone-800">
              <td className="py-2">
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => onViewProfile(m.playerId)}
                >
                  {m.username ?? m.playerId}
                </button>
              </td>
              <td className="py-2 capitalize text-stone-300">{m.role}</td>
              <td className="py-2 text-stone-400">
                {new Date(m.joinedAt).toLocaleDateString()}
              </td>
              {canManage ? (
                <td className="py-2">
                  {m.playerId === accountId || m.role === 'master' ? null : (
                    <span className="flex gap-2">
                      {isMaster ? (
                        <button
                          type="button"
                          className="text-xs underline"
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
                        className="text-xs text-red-400 underline"
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

      <footer className="flex gap-3">
        <button
          type="button"
          className="rounded border border-stone-700 px-3 py-1 text-sm"
          onClick={() =>
            void call(`/guilds/${guild.id}/leave`, { method: 'POST' }, 'Could not leave.')
          }
        >
          Leave guild
        </button>
        {isMaster ? (
          <button
            type="button"
            className="rounded border border-red-900 px-3 py-1 text-sm text-red-400"
            onClick={() =>
              void call(`/guilds/${guild.id}`, { method: 'DELETE' }, 'Could not disband.')
            }
          >
            Disband — the 650 is not returned
          </button>
        ) : null}
      </footer>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
