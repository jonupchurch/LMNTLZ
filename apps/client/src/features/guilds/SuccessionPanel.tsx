/**
 * Succession, from the guild's side (013 T068).
 *
 * ### Three audiences, three completely different messages
 *
 * - **An officer of a guild whose master has gone quiet** needs the button, the
 *   price, and the fact that it takes another week.
 * - **The master it is filed against** needs to be told they have *already* stopped
 *   it by being here. Anything less certain is cruel — they arrived to find someone
 *   asking for their guild.
 * - **Everyone else** needs the countdown, because a guild changing hands is not a
 *   secret from the people in it.
 *
 * The master's message is the one worth getting right. **They have already won by
 * loading this screen**, so the copy says so in the past tense: *"that has already
 * been cancelled"*, not *"signing in will cancel it"*.
 */

import { useState, type JSX } from 'react';
import { Button } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import type { SuccessionView } from './types.js';

export function SuccessionPanel({
  guildId,
  role,
  succession,
  costShards,
  onChanged,
  onUnauthenticated,
}: {
  guildId: string;
  role: 'master' | 'officer' | 'member' | null;
  succession: SuccessionView | null;
  /**
   * **Inheriting costs exactly what founding costs**, and the server says so
   * from one constant — `POST /guilds/:id/succession` quotes
   * `FOUNDING_COST_SHARDS` in its own `402`. Three sentences below used to
   * write `650` out by hand (017 T057).
   */
  costShards: number;
  onChanged: () => void;
  onUnauthenticated: () => void;
}): JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * **The master sees this only when one is pending**, and by then it is already
   * lapsed — `POST /v1/auth/google` cancels it on the way in, so the request this
   * component is describing no longer exists by the time it renders.
   */
  if (succession && role === 'master') {
    return (
      <div className="text-body rounded-lg border border-earth bg-earth-deep/25 p-4">
        <p className="font-medium text-earth-lit">Welcome back — your guild is yours.</p>
        <p className="mt-1 text-muted">
          While you were away an officer asked to take over.{' '}
          <strong className="text-parchment">That has already been cancelled</strong> —
          signing in was all it took, and it is why we never put a link in that email.
          Nothing else is needed from you.
        </p>
      </div>
    );
  }

  if (succession) {
    const completes = new Date(succession.completesAt);
    return (
      <div className="text-body rounded-lg border border-crush bg-crush-deep/25 p-4">
        <p className="font-medium text-crush-lit">A succession is pending</p>
        <p className="mt-1 text-muted">
          An officer has asked to become master. It completes on{' '}
          <strong className="text-parchment">{completes.toLocaleString()}</strong> unless
          the master signs in before then — which cancels it outright.
        </p>
      </div>
    );
  }

  /** Officers only. The master cannot file a petition about themselves. */
  if (role !== 'officer') return null;

  const request = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/guilds/${guildId}/succession`, { method: 'POST' });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return;
      }
      setError(
        err instanceof ApiError && err.status === 402
          ? `Inheriting costs ${costShards} shards, and you need them at the end as well as now.`
          : err instanceof ApiError && err.status === 409
            ? 'The master has played recently, so this is not available.'
            : 'Could not request succession.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="text-body rounded-lg border border-line p-4">
      <summary className="cursor-pointer text-muted">The master has stopped playing</summary>
      <p className="mt-2 text-faint">
        If the master has not played for 14 days you can ask to take over. They then get 7
        days, and <strong className="text-muted">signing in once cancels it</strong> — so
        this is slow on purpose. If it completes you pay {costShards} shards and the former
        master is refunded {costShards} and stays on as a member.
      </p>
      <div className="mt-3">
        <Button
          variant="secondary"
          size="sm"
          state={busy ? 'pending' : 'rest'}
          onClick={() => void request()}
        >
          Request succession
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-slash-lit">
          {error}
        </p>
      ) : null}
    </details>
  );
}
