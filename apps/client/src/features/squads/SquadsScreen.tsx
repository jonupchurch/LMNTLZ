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
import { ROW_CAPACITY, SQUAD_ROWS, type PowerRanking, type SquadRow } from '@lmntlz/sim/rules';
import { Panel } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { DefenseConfig } from './DefenseConfig.js';
import { RosterView } from './RosterView.js';
import { SquadBuilder } from './SquadBuilder.js';
import { SquadHeader, isAttack, labelOf, type Editing } from './SquadHeader.js';
import { SquadReadout } from './SquadReadout.js';

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
 * `Editing`, `isAttack` and `labelOf` moved to `SquadHeader.js` (019 US2).
 *
 * **One discriminant across five squads rather than a mode plus a selection.**
 * `useAllocation` already takes exactly this union, because there is exactly one
 * squad on screen at a time — and a separate "Defense / Attack" toggle would add
 * a second piece of state that has to agree with the first. The two nested
 * selections would then have a state nobody wants: attack mode with a zone
 * selected. The design's two-level control derives its upper level from this one
 * rather than storing a second; see that file's header.
 */

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
  /**
   * Leave for matchmaking with the squad on screen.
   *
   * **Optional, and the button is absent without it** — the design's primary
   * action on an attack squad is `FIND BATTLE`, and a primary action that
   * cannot navigate is a button that lies about what it does.
   */
  readonly onFindBattle?: () => void;
}

export function SquadsScreen({ onUnauthenticated, onFindBattle }: SquadsScreenProps = {}) {
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
  /**
   * The seat waiting for a champion.
   *
   * **Placement worked in one direction only, and the screen said the other.**
   * The board's own instruction reads *"click a seat, then a champion"*, and
   * clicking a seat with nobody selected returned silently — so the honest
   * report from a player was *"you can't change any heroes"*. Both orders work
   * now, and this is the state the seat-first one needs.
   *
   * It cannot disagree with `selected`: arming only happens when nothing is
   * selected, and committing clears it.
   */
  const [armed, setArmed] = useState<{ row: SquadRow; index: number } | null>(null);
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
   * `id -> Hero`, built once per roster rather than scanned per card.
   *
   * The picker draws 27 of these and the board six; a `find()` inside each
   * would be 33 linear scans of the roster on every keystroke in the search
   * box.
   */
  const heroIndex = useMemo(() => {
    const map = new Map<string, Hero>();
    for (const hero of roster?.heroes ?? []) map.set(hero.id, hero);
    return map;
  }, [roster]);

  const heroById = useCallback((id: string) => heroIndex.get(id), [heroIndex]);

  /** The seated champions, in seat order, for the readout. */
  const squadHeroes = useMemo(
    () =>
      allocation.seats
        .map((seat) => heroIndex.get(seat.heroId))
        .filter((hero): hero is Hero => hero !== undefined),
    [allocation.seats, heroIndex],
  );

  const seatedIds = useMemo(
    () => new Set(allocation.seats.map((s) => s.heroId)),
    [allocation.seats],
  );

  const backSeat = useMemo(() => {
    const seat = allocation.seats.find((s) => s.row === 'back');
    return seat ? (heroIndex.get(seat.heroId) ?? null) : null;
  }, [allocation.seats, heroIndex]);

  /**
   * Fill the empty seats from whoever is free.
   *
   * **Offense only, and that is a safety rule rather than a scope cut.** Seating
   * a champion on *defense* evicts her from every attack squad she is in, and
   * `seatActivate` blocks on a confirm that names which squads break. An
   * auto-fill on a zone would perform up to six of those moves without showing
   * one of them — the most destructive action on the screen, run silently.
   *
   * A reach-2 champion is preferred for the back seat because the server warns
   * about the alternative (`reach-1-back-seat`): the single protected seat is
   * the one place reach 1 reaches nobody at all. Beyond that the order is the
   * roster's, which is stable and therefore predictable.
   */
  const autoFill = useCallback(() => {
    if (!roster || !isAttack(editing)) return;

    const taken = new Set(allocation.seats.map((s) => s.heroId));
    const free = roster.available.forOffense
      .map((id) => heroIndex.get(id))
      .filter((hero): hero is Hero => hero !== undefined && !taken.has(hero.id));

    for (const row of SQUAD_ROWS) {
      for (let index = 0; index < ROW_CAPACITY[row]; index += 1) {
        if (allocation.seats.some((s) => s.row === row && s.index === index)) continue;
        const wants = row === 'back' ? 2 : 0;
        const pick = free.findIndex((hero) => hero.reach >= wants);
        const chosen = free.splice(pick === -1 ? 0 : pick, 1)[0];
        if (!chosen) return;
        allocation.place(chosen.id, row, index);
      }
    }
  }, [roster, editing, allocation, heroIndex]);

  /**
   * **The eviction check runs before the seat is filled, not after.**
   *
   * A champion already on defense, or on no attack squad, needs no confirm — an
   * empty warning dialog is worse than none. So the preview is fetched first and
   * the confirm only appears when it says something.
   */
  const commit = useCallback(
    async (heroId: string, row: SquadRow, index: number) => {
      if (!roster) return;
      setArmed(null);

      const alreadyHere = allocation.seats.some((s) => s.heroId === heroId);
      if (alreadyHere) {
        allocation.place(heroId, row, index);
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
          roster.assignments.defense[z].seats.some((s) => s.heroId === heroId),
        );
        if (zone) {
          setProblem(
            `${heroName(heroId)} is defending your ${ZONE_LABEL[zone]} and cannot attack. Move her off defense first.`,
          );
          return;
        }
        allocation.place(heroId, row, index);
        return;
      }

      try {
        const preview = await api<EvictionPreview>(`/squads/defense/${editing}/preview-move`, {
          method: 'POST',
          body: JSON.stringify({ heroId: heroId }),
        });

        if (preview.evicts.length === 0 && preview.streakAtRisk === 0) {
          allocation.place(heroId, row, index);
          return;
        }
        setPending({ heroId: heroId, preview });
        // Remembered so the confirm can complete the placement it interrupted.
        pendingSeat.current = { row, index };
      } catch {
        // A failed preview must not silently place — the player would commit a
        // move whose cost was never shown.
        setProblem('Could not check what this move would break. Nothing was changed.');
      }
    },
    [roster, editing, allocation, heroName],
  );

  /**
   * A click on a seat.
   *
   * With a champion in hand it places her. With empty hands it **arms** the
   * seat and waits — clicking the armed seat again puts it down. That second
   * branch is the one that did not exist, and its absence was indistinguishable
   * from a broken screen.
   */
  const seatActivate = useCallback(
    async (row: SquadRow, index: number) => {
      if (selected) {
        await commit(selected, row, index);
        return;
      }
      setArmed((a) => (a && a.row === row && a.index === index ? null : { row, index }));
    },
    [selected, commit],
  );

  /**
   * A click on a champion in the picker.
   *
   * Into the armed seat if there is one; otherwise she is picked up, and
   * clicking her again puts her down. **Toggling matters**: without it there is
   * no way to cancel a selection, and a stray click leaves every later seat
   * click placing somebody the player forgot they were holding.
   */
  const heroActivate = useCallback(
    (heroId: string) => {
      if (armed) {
        void commit(heroId, armed.row, armed.index);
        return;
      }
      setSelected((current) => (current === heroId ? null : heroId));
    },
    [armed, commit],
  );

  /** Take the armed champion off the board. The only single-seat removal. */
  const removeArmed = useCallback(() => {
    if (!armed) return;
    const seat = allocation.seats.find((s) => s.row === armed.row && s.index === armed.index);
    if (seat) allocation.remove(seat.heroId);
    setArmed(null);
  }, [armed, allocation]);

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
    /**
     * **An attack squad needs six; a defense zone needs only to be legal.**
     *
     * The same split the server draws, and it has to be drawn here too or the
     * button the header enables would be one this function silently ignores —
     * which is the shape of the *"you can't change any heroes"* defect: a
     * control that looks live and returns without doing anything.
     */
    const allowed = isAttack(editing) ? allocation.isComplete : allocation.isStorable;
    if (!allowed || saving) return;

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
      <Panel span={12}>
        <p role="alert" className="text-slash-lit">
          {error}
        </p>
      </Panel>
    );
  }

  if (!roster) {
    return (
      <Panel span={12}>
        <p className="text-faint">Loading your champions…</p>
      </Panel>
    );
  }

  /**
   * **The board, the picker, and a readout rail beside them** (019 US2).
   *
   * 017 T049 put this screen on the shell's 12-column grid as `SPAN 8` beside
   * `SPAN 4`, quoting the Design System export's worked example — *squad board*
   * beside *inspector*. The squad screen's right-hand column is not an
   * inspector: it is a fixed readout rail carrying four stacked panels of text,
   * which wants a narrower column than a panel that has to hold hero detail.
   * `9 / 3` is ~350px at the 1400 cap, which is what the design draws.
   *
   * The main column stacks header → board → picker rather than putting the
   * picker beside the board, because the picker is 27 cards and the board is
   * six: side by side, one of them is always the wrong width.
   */
  return (
    <>
      <Panel span={9}>
        <div className="flex flex-col gap-4">
          <SquadHeader
            roster={roster}
            editing={editing}
            onEdit={setEditing}
            placed={allocation.seats.length}
            isComplete={allocation.isComplete}
            isStorable={allocation.isStorable}
            saving={saving}
            name={attackName}
            onName={setAttackName}
            onSave={() => void save()}
            onClear={allocation.clear}
            onAutoFill={isAttack(editing) ? autoFill : undefined}
            {...(onFindBattle ? { onFindBattle } : {})}
          />

      {/* FR-011 — an incomplete zone says so rather than defending a man down. */}
      {!isAttack(editing) && !roster.assignments.defense[editing].canDefend && (
        <p role="status" className="font-mono text-body text-slash-lit">
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
          <p role="status" className="font-mono text-body text-slash-lit">
            {labelOf(editing)} lost a champion to defense and cannot attack until it is back to
            six.
          </p>
        )}

      {problem && (
        <p role="alert" className="font-mono text-body text-slash-lit">
          {problem}
        </p>
      )}

          {/**
           * **Sticky, because the picker is 27 cards and the board is six.**
           *
           * Side by side, one of them is always the wrong width — so the picker
           * sits underneath, and at 1600×900 that put the champion you were
           * choosing and the seat you were filling on different scroll
           * positions. Pinning the board means the six seats are on screen for
           * every one of the 27 choices, which is the whole interaction.
           */}
          <div className="sticky top-0 z-10 -mx-1 bg-bg/95 px-1 pb-3 backdrop-blur-sm">
            <SquadBuilder
              allocation={allocation}
              heroName={heroName}
              heroById={heroById}
              kind={isAttack(editing) ? 'offense' : 'defense'}
              selectedHeroId={selected}
              armedSeat={armed}
              onSeatActivate={(row, index) => void seatActivate(row, index)}
              {...(armed &&
              allocation.seats.some((s) => s.row === armed.row && s.index === armed.index)
                ? { onRemoveArmed: removeArmed }
                : {})}
            />
          </div>

          <RosterView
            roster={roster}
            selectedHeroId={selected}
            onSelect={heroActivate}
            seatedIds={seatedIds}
            awaitingSeat={armed !== null}
          />
        </div>
      </Panel>

      <Panel span={3}>
        <div className="flex flex-col gap-6">
          <SquadReadout squad={squadHeroes} backSeat={backSeat} />

          <section aria-label="Save this squad" className="flex flex-col gap-3">
            {savedAttack && (
              <p role="status" className="font-mono text-caption text-earth-lit">
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
              <div role="status" className="flex flex-col gap-2 font-mono text-caption">
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
              <p className="lz-surface p-4 font-mono text-caption text-faint">
                {configuring.hero.name} is playing her Role&rsquo;s defaults. Save this zone to
                see them and change them.
              </p>
            ))}
        </div>
      </Panel>

      {/* Reachable from a defense tab only — nothing is evicted by an attack save. */}
      {pending && !isAttack(editing) && (
        <Panel span={12}>
          <EvictionWarning
            heroName={heroName(pending.heroId)}
            zoneLabel={ZONE_LABEL[editing]}
            preview={pending.preview}
            onConfirm={confirmMove}
            onCancel={() => setPending(null)}
          />
        </Panel>
      )}
    </>
  );
}
