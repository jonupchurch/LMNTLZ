/**
 * The curated avatar set (012 T027, T042).
 *
 * **Curated avatars need no review**, which is the whole reason this ships ahead
 * of the custom upload path: no queue, no fee, no moderator, and therefore no
 * dependency on feature 016 existing.
 *
 * The custom option is **shown and disabled rather than hidden**, because the
 * price is part of what a player is deciding between. Hiding it would make the
 * curated set look like the only option there will ever be. The server reports
 * `customAvailable: false` in the payload rather than only in copy, so this
 * component never has to guess.
 */

import { useState, type JSX } from 'react';
import { api, ApiError } from '../../lib/api.js';
import type { AvatarChoice, AvatarState } from './types.js';

const LABEL: Record<string, string> = {
  earth: 'Earth',
  air: 'Air',
  fire: 'Fire',
  water: 'Water',
  light: 'Light',
  dark: 'Dark',
  slash: 'Slash',
  pierce: 'Pierce',
  crush: 'Crush',
  arcane: 'Arcane',
  martial: 'Martial',
};

export function AvatarPicker({
  state,
  onChanged,
  onUnauthenticated,
}: {
  state: AvatarState | null;
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [current, setCurrent] = useState<AvatarChoice | null>(null);

  const chosen = current ?? state?.current ?? null;

  async function choose(key: string): Promise<void> {
    if (busy) return;
    setBusy(key);
    try {
      const result = await api<{ current: AvatarChoice }>('/me/avatar', {
        method: 'PUT',
        body: JSON.stringify({ avatarKey: key }),
      });
      setCurrent(result.current);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthenticated();
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <section aria-labelledby="avatar-heading">
        <h2
          id="avatar-heading"
          className="text-h3 font-display tracking-widest text-faint uppercase"
        >
          Avatar
        </h2>
        <p className="mt-2 text-body text-faint">Avatars unavailable.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="avatar-heading">
      <h2 id="avatar-heading" className="text-h3 font-display tracking-widest text-faint uppercase">
        Avatar
      </h2>

      <ul className="mt-3 grid grid-cols-4 gap-2" role="list">
        {state.curated.map((key) => {
          const selected = chosen?.kind === 'curated' && chosen.value === key;

          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={busy !== null}
                onClick={() => void choose(key)}
                className={[
                  'w-full rounded border px-2 py-3 text-caption tracking-widest uppercase',
                  selected ? 'border-gold bg-raised shadow-(--shadow-glow-gold) text-parchment' : 'border-line text-faint',
                ].join(' ')}
              >
                {LABEL[key] ?? key}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-caption text-faint">
        A custom image costs ${(state.customPrice.cents / 100).toFixed(2)} or{' '}
        {state.customPrice.shards.toLocaleString()} shards, charged per change, and is
        reviewed before anyone sees it.
      </p>
      <button
        type="button"
        disabled
        className="mt-2 rounded border border-line px-4 py-2 text-h3 font-display tracking-widest text-faint uppercase"
      >
        {state.customAvailable ? 'Upload an image' : 'Custom images — not yet open'}
      </button>
    </section>
  );
}
