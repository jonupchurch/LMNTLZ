/**
 * The screen that composes the squad builder.
 *
 * **Not in any task, and that is worth recording.** T018–T020 and T047–T048 each
 * say "build this component"; nothing says "put them on a page". The components
 * were complete and unit-tested while being unreachable from the running app —
 * which is invisible in a component suite and obvious the moment anybody tries
 * to click something. Feature 007 inherits this file rather than rediscovering
 * the gap.
 *
 * Everything authoritative happens on the server. This holds selection state and
 * renders what it is told.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hero } from '@lmntlz/content';
import type { SquadRow } from '@lmntlz/sim/rules';
import { api, ApiError } from '../../lib/api.js';
import { RosterView } from './RosterView.js';
import { SquadBuilder } from './SquadBuilder.js';
import { EvictionWarning } from './EvictionWarning.js';
import { useAllocation } from './hooks/useAllocation.js';
import type { EvictionPreview, RosterResponse, Zone } from './types.js';

const ZONE_LABEL: Readonly<Record<Zone, string>> = { visible: 'Zone I', hidden: 'Zone II' };

export interface SquadsScreenProps {
  /**
   * Called when the roster comes back `401`.
   *
   * **Not signed in is not a failure**, it is the ordinary state of every
   * visitor, and this screen is the wrong place to decide what to show them —
   * so it reports upward rather than rendering an error. Before this existed,
   * the site's homepage was the API's own sentence *"This endpoint requires a
   * session token."*, which is true, unhelpful, and the first thing anybody
   * judging the product saw.
   */
  readonly onUnauthenticated?: () => void;
}

export function SquadsScreen({ onUnauthenticated }: SquadsScreenProps = {}) {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone>('visible');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ heroId: string; preview: EvictionPreview } | null>(null);
  /** The seat the confirm interrupted, so it can finish the placement. */
  const pendingSeat = useRef<{ row: SquadRow; index: number } | null>(null);

  const allocation = useAllocation(roster, zone);

  const load = useCallback(async () => {
    try {
      setRoster(await api<RosterResponse>('/roster'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated?.();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load your roster.');
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const heroName = useCallback(
    (id: string) => roster?.heroes.find((h: Hero) => h.id === id)?.name ?? id,
    [roster],
  );

  /**
   * **The eviction check runs before the seat is filled, not after.**
   *
   * A champion already on defense, or on no attack squad, needs no confirm — an
   * empty warning dialog is worse than none. So the preview is fetched first and
   * the confirm only appears when it says something.
   */
  const seatActivate = useCallback(
    async (row: SquadRow, index: number) => {
      if (!selected || !roster) return;

      const alreadyHere = allocation.seats.some((s) => s.heroId === selected);
      if (alreadyHere) {
        allocation.place(selected, row, index);
        return;
      }

      try {
        const preview = await api<EvictionPreview>(`/squads/defense/${zone}/preview-move`, {
          method: 'POST',
          body: JSON.stringify({ heroId: selected }),
        });

        if (preview.evicts.length === 0 && preview.streakAtRisk === 0) {
          allocation.place(selected, row, index);
          return;
        }
        setPending({ heroId: selected, preview });
        // Remembered so the confirm can complete the placement it interrupted.
        pendingSeat.current = { row, index };
      } catch {
        // A failed preview must not silently place — the player would commit a
        // move whose cost was never shown.
        setError('Could not check what this move would break. Nothing was changed.');
      }
    },
    [selected, roster, zone, allocation],
  );

  const confirmMove = useCallback(() => {
    const seat = pendingSeat.current;
    if (pending && seat) allocation.place(pending.heroId, seat.row, seat.index);
    setPending(null);
  }, [pending, allocation]);

  if (error) {
    return (
      <main className="mx-auto max-w-[1600px] px-8 py-12">
        <p role="alert" className="text-slash-lit">
          {error}
        </p>
      </main>
    );
  }

  if (!roster) {
    return (
      <main className="mx-auto max-w-[1600px] px-8 py-12">
        <p className="text-faint">Loading your champions…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-8 py-10">
      <div className="flex items-center gap-2" role="tablist" aria-label="Defense zone">
        {(['visible', 'hidden'] as const).map((z) => (
          <button
            key={z}
            role="tab"
            aria-selected={zone === z}
            /**
             * **Explicit, because the computed name runs the words together.**
             * The label and the streak are adjacent elements with no whitespace
             * between them, so the accessible name computed from the content is
             * `"Zone Ihold 14"` — announced as one nonsense word. Caught by an
             * e2e locator failing to match, which is a fair way to find it.
             */
            aria-label={`${ZONE_LABEL[z]}, hold streak ${roster.assignments.defense[z].holdStreak}`}
            onClick={() => setZone(z)}
            className={[
              'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
              zone === z ? 'border-gold bg-raised text-parchment' : 'border-line text-faint',
            ].join(' ')}
          >
            {ZONE_LABEL[z]}
            <span className="ml-2 font-mono text-[11px] text-faint">
              hold {roster.assignments.defense[z].holdStreak}
            </span>
          </button>
        ))}
      </div>

      {/* FR-011 — an incomplete zone says so rather than defending a man down. */}
      {!roster.assignments.defense[zone].canDefend && (
        <p role="status" className="font-mono text-sm text-slash-lit">
          {roster.assignments.defense[zone].reason}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
        <RosterView roster={roster} selectedHeroId={selected} onSelect={setSelected} />
        <SquadBuilder
          allocation={allocation}
          heroName={heroName}
          kind="defense"
          selectedHeroId={selected}
          onSeatActivate={(row, index) => void seatActivate(row, index)}
        />
      </div>

      {pending && (
        <EvictionWarning
          heroName={heroName(pending.heroId)}
          zoneLabel={ZONE_LABEL[zone]}
          preview={pending.preview}
          onConfirm={confirmMove}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
