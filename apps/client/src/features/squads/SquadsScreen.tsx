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
  SaveOffenseResponse,
  SeatConfigWire,
  Zone,
} from './types.js';

const ZONE_LABEL: Readonly<Record<Zone, string>> = { visible: 'Zone I', hidden: 'Zone II' };

/**
 * Which squad the builder is editing: a defense zone, or an attack slot.
 *
 * **One discriminant across five tabs rather than a mode plus a selection.**
 * `useAllocation` already takes exactly this union, because there is exactly one
 * squad on screen at a time — and a separate "Defense / Attack" toggle would add a
 * second piece of state that has to agree with the first. The two nested selections
 * would then have a state nobody wants: attack mode with a zone selected.
 */
type Editing = Zone | number;

const ATTACK_SLOTS = [0, 1, 2] as const;
const isAttack = (editing: Editing): editing is number => typeof editing === 'number';
const labelOf = (editing: Editing): string =>
  isAttack(editing) ? `Attack ${editing + 1}` : ZONE_LABEL[editing];

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
  const [editing, setEditing] = useState<Editing>('visible');
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ heroId: string; preview: EvictionPreview } | null>(null);
  /** The seat the confirm interrupted, so it can finish the placement. */
  const pendingSeat = useRef<{ row: SquadRow; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveDefenseResponse | null>(null);
  const [savedAttack, setSavedAttack] = useState<SaveOffenseResponse | null>(null);
  /** The squad's name, which is offense-only — a zone's name is its zone. */
  const [attackName, setAttackName] = useState('');

  const allocation = useAllocation(roster, editing);

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

      /**
       * **An attack squad seats nobody who is defending, and it is refused here
       * rather than by the server** (`409 hero_on_other_zone`). The refusal is
       * cheap to make locally and the roster already says which zone she is in —
       * and a player who has to press Save to find out has already composed a
       * squad around somebody who cannot be in it.
       *
       * There is no eviction preview in this direction: moving a hero *to* attack
       * costs nothing, and overlap between the three attack squads is forced.
       */
      if (isAttack(editing)) {
        const zone = (['visible', 'hidden'] as const).find((z) =>
          roster.assignments.defense[z].seats.some((s) => s.heroId === selected),
        );
        if (zone) {
          setProblem(
            `${heroName(selected)} is defending your ${ZONE_LABEL[zone]} and cannot attack. Move her off defense first.`,
          );
          return;
        }
        allocation.place(selected, row, index);
        return;
      }

      try {
        const preview = await api<EvictionPreview>(`/squads/defense/${editing}/preview-move`, {
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
    [selected, roster, editing, allocation, heroName],
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
      if (isAttack(editing)) {
        /**
         * **No `config` on an attack squad, and the server rejects one.** The
         * player commands offense, so there is nothing to configure — and a field
         * that were accepted and ignored would be worse than a refusal, because
         * the player would believe it applied.
         */
        const result = await api<SaveOffenseResponse>(`/squads/offense/${editing}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: attackName.trim() === '' ? null : attackName.trim(),
            seats: allocation.seats.map((seat) => ({
              row: seat.row,
              index: seat.index,
              heroId: seat.heroId,
            })),
          }),
        });

        setSavedAttack(result);
        await load();
        return;
      }

      const result = await api<SaveDefenseResponse>(`/squads/defense/${editing}`, {
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
      setSavedAttack(null);
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
  }, [allocation, saving, editing, attackName, load]);

  /**
   * Cleared when the tab changes, so a Zone I result never reads as a Zone II one.
   *
   * **Depends on `editing` alone, and that is not an oversight.** The save refetches
   * the roster, so a `roster` dependency here would clear the result the save had
   * just set — the screen would flash a success message and lose it.
   */
  useEffect(() => {
    setSaved(null);
    setSavedAttack(null);
    setProblem(null);
  }, [editing]);

  /**
   * The name box, seeded from the squad being opened.
   *
   * An attack squad's name is part of it, so blanking the box on every tab change
   * would rename the squad to nothing the next time Save was pressed. Content-keyed
   * for the same reason `useAllocation` is: a refetch that returned the same name
   * must not interrupt somebody mid-word.
   */
  const servedName = isAttack(editing)
    ? (roster?.assignments.offense.find((o) => o.slot === editing)?.name ?? '')
    : '';
  const nameKey = `${String(editing)}|${servedName}`;
  const seededName = useRef<string | null>(null);
  useEffect(() => {
    if (seededName.current === nameKey) return;
    seededName.current = nameKey;
    setAttackName(servedName);
    // `servedName` is intentionally not a dependency — it is derived from
    // `nameKey`, and depending on both says the same thing twice.
  }, [nameKey]);

  /**
   * The champion whose behaviour the editor is showing.
   *
   * **Only ever a seated one.** The controls decide what the engine does with a
   * champion *in this squad*; offering them for somebody on the bench would be
   * configuring a seat that does not exist.
   */
  const configuring = useMemo(() => {
    // Defense only: **the player commands offense**, so an attack squad has
    // nothing to configure and a panel here would imply otherwise.
    if (!roster || !selected || isAttack(editing)) return null;
    if (!allocation.seats.some((s) => s.heroId === selected)) return null;
    const hero = roster.heroes.find((h) => h.id === selected);
    if (!hero) return null;
    return { hero, behaviour: allocation.behaviour.get(selected) ?? null };
  }, [roster, selected, editing, allocation.seats, allocation.behaviour]);

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
      {/**
       * **Five tabs on one row, because there are five squads.** Two defense zones
       * and three attack slots, and exactly one is open at a time. A "Defense /
       * Attack" toggle above a second selection would be two pieces of state that
       * have to agree, with a combination — attack mode, zone selected — that means
       * nothing.
       *
       * The 12/15 split is stated beside them: it is why the three attack squads
       * overlap, and no per-squad message conveys it.
       */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Squad">
        {(['visible', 'hidden'] as const).map((z) => (
          <button
            key={z}
            role="tab"
            aria-selected={editing === z}
            /**
             * **Explicit, because the computed name runs the words together.**
             * The label and the streak are adjacent elements with no whitespace
             * between them, so the accessible name computed from the content is
             * `"Zone Ihold 14"` — announced as one nonsense word. Caught by an
             * e2e locator failing to match, which is a fair way to find it.
             */
            aria-label={`${ZONE_LABEL[z]}, hold streak ${roster.assignments.defense[z].holdStreak}`}
            onClick={() => setEditing(z)}
            className={[
              'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
              editing === z ? 'border-gold bg-raised text-parchment' : 'border-line text-faint',
            ].join(' ')}
          >
            {ZONE_LABEL[z]}
            <span className="ml-2 font-mono text-[11px] text-faint">
              hold {roster.assignments.defense[z].holdStreak}
            </span>
          </button>
        ))}

        <span aria-hidden className="mx-2 h-6 w-px bg-line" />

        {ATTACK_SLOTS.map((slot) => {
          const squad = roster.assignments.offense.find((o) => o.slot === slot);
          /**
           * **"Broken" and "unfinished" are different states and both are shown.**
           * A squad our own eviction rule emptied a seat in did not get that way
           * through anything the player did deliberately, and it cannot attack until
           * it is refilled — so it says so rather than reading as a squad nobody
           * has got round to.
           */
          const state = !squad || squad.seats.length === 0
            ? 'empty'
            : !squad.valid
              ? 'broken'
              : squad.complete
                ? 'ready'
                : `${squad.seats.length}/6`;

          return (
            <button
              key={slot}
              role="tab"
              aria-selected={editing === slot}
              aria-label={`Attack ${slot + 1}${squad?.name ? `, ${squad.name}` : ''}, ${state}`}
              onClick={() => setEditing(slot)}
              className={[
                'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
                editing === slot ? 'border-gold bg-raised text-parchment' : 'border-line text-faint',
              ].join(' ')}
            >
              Attack {slot + 1}
              <span
                className={[
                  'ml-2 font-mono text-[11px]',
                  state === 'broken' ? 'text-slash-lit' : 'text-faint',
                ].join(' ')}
              >
                {state}
              </span>
            </button>
          );
        })}
      </div>

      {/* FR-011 — an incomplete zone says so rather than defending a man down. */}
      {!isAttack(editing) && !roster.assignments.defense[editing].canDefend && (
        <p role="status" className="font-mono text-sm text-slash-lit">
          {roster.assignments.defense[editing].reason}
        </p>
      )}

      {/**
       * **SC-009: an invalidated squad cannot attack until it is refilled**, and the
       * server refuses it with `squad_incomplete`. Said here so the player finds out
       * on the builder rather than when they try to start a battle.
       */}
      {isAttack(editing) &&
        roster.assignments.offense.find((o) => o.slot === editing)?.valid === false && (
          <p role="status" className="font-mono text-sm text-slash-lit">
            {labelOf(editing)} lost a champion to defense and cannot attack until it is back to
            six.
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
            kind={isAttack(editing) ? 'offense' : 'defense'}
            selectedHeroId={selected}
            onSeatActivate={(row, index) => void seatActivate(row, index)}
          />

          {/* Offense only. A zone's name is its zone; there is nothing to call it. */}
          {isAttack(editing) && (
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] tracking-widest uppercase text-faint">
                Squad name
              </span>
              <input
                type="text"
                value={attackName}
                maxLength={40}
                placeholder={`Attack ${editing + 1}`}
                onChange={(e) => setAttackName(e.target.value)}
                className="rounded border border-line bg-void px-2 py-1 text-sm text-parchment"
              />
            </label>
          )}

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
              {saving ? 'Saving…' : `Save ${labelOf(editing)}`}
            </button>

            {savedAttack && (
              <p role="status" className="font-mono text-xs text-earth-lit">
                Saved. {savedAttack.name ?? `Attack ${savedAttack.slot + 1}`} is{' '}
                {savedAttack.complete ? 'ready to attack' : 'not yet six champions'}.
              </p>
            )}

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

      {/* Reachable from a defense tab only — nothing is evicted by an attack save. */}
      {pending && !isAttack(editing) && (
        <EvictionWarning
          heroName={heroName(pending.heroId)}
          zoneLabel={ZONE_LABEL[editing]}
          preview={pending.preview}
          onConfirm={confirmMove}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
