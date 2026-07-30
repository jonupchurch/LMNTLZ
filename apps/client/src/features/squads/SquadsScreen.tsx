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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Hero } from '@lmntlz/content';
import type { PowerRanking, SquadRow } from '@lmntlz/sim/rules';
import { api, ApiError } from '../../lib/api.js';
import { DefenseConfig } from './DefenseConfig.js';
import { RosterView } from './RosterView.js';
import { SquadBuilder } from './SquadBuilder.js';
import { EvictionWarning } from './EvictionWarning.js';
import { useAllocation } from './hooks/useAllocation.js';
import type {
  EvictionPreview,
  RosterResponse,
  SaveDefenseResponse,
  SeatConfigWire,
  Zone,
} from './types.js';

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
  /**
   * **Two failure states, because they deserve different screens.**
   *
   * `error` is *the roster would not load* — there is nothing to render, so it
   * replaces the page. `problem` is *this action failed* — a refused save, a
   * preview that did not answer — and the squad is still on screen and still
   * editable, so replacing the page with a sentence would throw away work the
   * player can retry in one click. One state served both, and the result was that
   * a rejected save blanked the builder.
   */
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone>('visible');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ heroId: string; preview: EvictionPreview } | null>(null);
  /** The seat the confirm interrupted, so it can finish the placement. */
  const pendingSeat = useRef<{ row: SquadRow; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveDefenseResponse | null>(null);

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
        setProblem('Could not check what this move would break. Nothing was changed.');
      }
    },
    [selected, roster, zone, allocation],
  );

  const confirmMove = useCallback(() => {
    const seat = pendingSeat.current;
    if (pending && seat) allocation.place(pending.heroId, seat.row, seat.index);
    setPending(null);
  }, [pending, allocation]);

  /**
   * ### The save, which is the whole point of the screen and was missing
   *
   * Every component here was built, unit-tested and reachable — and **nothing
   * called `PUT /v1/squads/defense/:zone`**, so a player could compose a squad,
   * reload, and find it gone. 006's tasks each say "build this component"; none
   * says "wire the save", and a component suite cannot see the difference.
   *
   * **No dirty flag, and the button is not gated on one.** `canonical.ts` decides
   * whether a save cost a streak by hashing the stored form against the submitted
   * one, precisely so a client cannot nudge it — and it makes a no-op save free, so
   * "did anything change?" is not a question this screen has to answer. It is
   * gated on the formation being *legal*, which is the one thing the server would
   * refuse.
   *
   * **A champion seated in this session is sent without a `config`.** That is not
   * an omission: the role-default table is server-only, the server fills it in, and
   * the refetch below brings back what it chose. The alternative is the client
   * inventing a configuration and calling it the player's.
   */
  const save = useCallback(async () => {
    if (!allocation.isComplete || saving) return;

    setSaving(true);
    setProblem(null);
    try {
      const result = await api<SaveDefenseResponse>(`/squads/defense/${zone}`, {
        method: 'PUT',
        body: JSON.stringify({
          seats: allocation.seats.map((seat) => {
            const config = allocation.behaviour.get(seat.heroId);
            return {
              row: seat.row,
              index: seat.index,
              heroId: seat.heroId,
              ...(config ? { config } : {}),
            };
          }),
        }),
      });

      setSaved(result);
      /**
       * **Refetched rather than patched from the response.** The response says what
       * the save cost; it does not say what the account now looks like — eviction
       * has just changed up to three attack squads, and `forOffense` is recomputed
       * from the defense rows. Reconstructing that here would be a second
       * implementation of the server's own bookkeeping.
       */
      await load();
    } catch (err) {
      setSaved(null);
      /**
       * **The server's own sentence, when there is one.** A `409` here names the
       * champion and the zone she is already defending, and a `422` names the
       * formation fault — both more useful than anything this screen could invent,
       * and both already written for a player rather than a developer.
       */
      setProblem(
        err instanceof ApiError ? err.message : 'Could not save this squad. Nothing was changed.',
      );
    } finally {
      setSaving(false);
    }
  }, [allocation, saving, zone, load]);

  /** Cleared on a zone switch, so a Zone I result never reads as a Zone II one. */
  useEffect(() => {
    setSaved(null);
    setProblem(null);
  }, [zone]);

  /**
   * The champion whose behaviour the editor is showing.
   *
   * **Only ever a seated one.** The controls decide what the engine does with a
   * champion *in this squad*; offering them for somebody on the bench would be
   * configuring a seat that does not exist.
   */
  const configuring = useMemo(() => {
    if (!roster || !selected) return null;
    if (!allocation.seats.some((s) => s.heroId === selected)) return null;
    const hero = roster.heroes.find((h) => h.id === selected);
    if (!hero) return null;
    return { hero, behaviour: allocation.behaviour.get(selected) ?? null };
  }, [roster, selected, allocation.seats, allocation.behaviour]);

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

      {problem && (
        <p role="alert" className="font-mono text-sm text-slash-lit">
          {problem}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
        <RosterView roster={roster} selectedHeroId={selected} onSelect={setSelected} />
        <div className="flex flex-col gap-6">
          <SquadBuilder
            allocation={allocation}
            heroName={heroName}
            kind="defense"
            selectedHeroId={selected}
            onSeatActivate={(row, index) => void seatActivate(row, index)}
          />

          <section aria-label="Save this squad" className="flex flex-col gap-3">
            <button
              type="button"
              disabled={!allocation.isComplete || saving}
              onClick={() => void save()}
              className={[
                'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
                allocation.isComplete && !saving
                  ? 'border-gold bg-raised text-parchment hover:bg-gold/20'
                  : 'border-line text-faint',
              ].join(' ')}
            >
              {saving ? 'Saving…' : `Save ${ZONE_LABEL[zone]}`}
            </button>

            {/**
             * **The streak cost, stated after the fact because it is decided
             * server-side** (FR-014). The confirm before an *eviction* is the one
             * thing this screen blocks on; a streak reset is disclosed as part of
             * what a save did, which is what `streakAtRisk` warns about beforehand.
             */}
            {saved && (
              <div role="status" className="flex flex-col gap-2 font-mono text-xs">
                <p className={saved.streakReset ? 'text-slash-lit' : 'text-earth-lit'}>
                  {saved.streakReset
                    ? `Saved. The hold streak reset to ${saved.holdStreak} — the squad changed.`
                    : `Saved. Hold streak ${saved.holdStreak} is intact — nothing changed.`}
                </p>

                {saved.evictedSquadIds.length > 0 && (
                  <p className="text-slash-lit">
                    {saved.evictedSquadIds.length === 1
                      ? '1 attack squad lost a champion to this zone and needs refilling.'
                      : `${saved.evictedSquadIds.length} attack squads lost champions to this zone and need refilling.`}
                  </p>
                )}

                {/* Surfaced, never blocking — the save already happened. */}
                {saved.warnings.map((warning) => (
                  <p key={`${warning.code}-${warning.heroId}`} className="text-gold">
                    {warning.message}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/**
           * **Offered only for a seated champion, and only once the server has said
           * what she is doing.** A champion seated in this session has no config
           * yet — the role-default table is server-only, so there is nothing honest
           * to show until a save comes back with it.
           */}
          {configuring &&
            (configuring.behaviour ? (
              <DefenseConfig
                hero={configuring.hero}
                behaviour={{
                  targeting: configuring.behaviour.targeting,
                  ranking: configuring.behaviour.ranking as PowerRanking,
                  allyRule: configuring.behaviour.allyRule,
                }}
                targetRules={roster.rules.target}
                allyRules={roster.rules.ally}
                needsAllyRule={roster.rules.needsAllyRule.includes(configuring.hero.id)}
                onChange={(next) =>
                  allocation.configure(configuring.hero.id, {
                    targeting: next.targeting,
                    ranking: next.ranking,
                    allyRule: next.allyRule,
                  } satisfies SeatConfigWire)
                }
              />
            ) : (
              <p className="rounded border border-line bg-surface p-4 font-mono text-xs text-faint">
                {configuring.hero.name} is playing her Role&rsquo;s defaults. Save this zone to
                see them and change them.
              </p>
            ))}
        </div>
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
