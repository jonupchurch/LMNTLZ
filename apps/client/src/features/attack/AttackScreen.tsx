/**
 * Choosing somebody to attack, and starting the battle.
 *
 * ### The last unwired route, and the one that made the game unplayable
 *
 * `GET /v1/matchmaking/candidates` (009), `GET /v1/players/:targetId/scout` (006)
 * and `POST /v1/battles` (007) were all shipped and tested, and **nothing called
 * any of them**. `ResumeBattle.tsx` says so plainly: *"There is no 'attack' button
 * yet: choosing an opponent needs the candidate set, which is feature 009."* 009
 * shipped. This is the button.
 *
 * ### Three decisions this screen does not make
 *
 * | Decision | Whose |
 * |---|---|
 * | **which zone is fought** | the server's — `POST /battles` reads it from the attack streak, and a `zone` in the body is ignored |
 * | **whether the ambush fires** | the server's, rolled after the choice; the odds are displayed beforehand and never computed here |
 * | **who is offered** | the server's — there is no filter, no page and no exclusion, because a rule restricting *who* you may attack restricts the playing itself |
 *
 * The last one is why the list is rendered whole. `candidates.ts` takes one
 * argument on purpose: *"every eligible defender in the league is present, every
 * time: no slate, no rotation, no cooldown on re-attacking someone."*
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Hero } from '@lmntlz/content';
import { Panel } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { CandidateRail } from './CandidateRail.js';
import { ScoutPanel } from './ScoutPanel.js';
import { StrikingSix } from './StrikingSix.js';
import type { CandidateList, ScoutView, Standing } from './types.js';
import type { StartedBattle } from '../battle/types.js';
import type { RosterResponse } from '../squads/types.js';

export interface AttackScreenProps {
  readonly onBattleStarted: (started: StartedBattle) => void;
  /** Optional so existing tests that mount this screen alone still compile. */
  readonly onViewProfile?: (targetId: string) => void;
  readonly onUnauthenticated?: () => void;
}

export function AttackScreen({
  onBattleStarted,
  onViewProfile,
  onUnauthenticated,
}: AttackScreenProps) {
  const [list, setList] = useState<CandidateList | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [squads, setSquads] = useState<RosterResponse['assignments']['offense']>([]);
  /**
   * The 27, for the squad thumbs and the fit reading.
   *
   * **Served, not imported from `@lmntlz/content` directly.** The roster route
   * is what the rest of this app reads a champion through, and a screen that
   * bypassed it would keep rendering after a content change the server had not
   * shipped yet.
   */
  const [heroes, setHeroes] = useState<readonly Hero[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [scout, setScout] = useState<ScoutView | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  /**
   * **Only a squad that is six and valid can attack**, and the server refuses the
   * rest with `squad_incomplete`. Offered here rather than refused there, because
   * the most likely reason a squad is short is *our own eviction rule*, not
   * anything the player did — so a battle lost to it would be a loss caused by the
   * game.
   */
  const ready = useMemo(() => squads.filter((s) => s.complete && s.valid), [squads]);

  const heroesById = useMemo(
    () => new Map(heroes.map((hero) => [hero.id, hero])),
    [heroes],
  );

  /** The chosen squad, resolved to champions. Empty until both halves arrive. */
  const chosenSix = useMemo(() => {
    const squad = ready.find((s) => s.slot === slot);
    if (!squad) return [];
    return squad.seats
      .map((seat) => heroesById.get(seat.heroId))
      .filter((hero): hero is Hero => hero !== undefined);
  }, [ready, slot, heroesById]);

  const chosenName = useMemo(
    () => ready.find((s) => s.slot === slot)?.name ?? null,
    [ready, slot],
  );

  /**
   * Their rating, taken from the candidate row rather than the scout payload.
   *
   * `ScoutView` does not carry one and should not start: the scout route's job
   * is the wall, and rating is a matchmaking fact the list already served. Two
   * routes serving the same number is how they end up disagreeing.
   */
  const targetRating = useMemo(
    () => list?.candidates.find((c) => c.playerId === target)?.rating,
    [list, target],
  );

  useEffect(() => {
    // The first ready squad, so a player with one squad never has to pick it.
    if (slot === null && ready.length > 0) setSlot(ready[0]!.slot);
  }, [ready, slot]);

  const load = useCallback(async () => {
    try {
      /**
       * **Three requests rather than one**, because they answer different questions
       * and `standing` is the one that survives an empty pool: a player in a league
       * with nobody in it still needs to see their own rating and their starter
       * countdown. In parallel, since none of them depends on another.
       *
       * The roster is read for the **attack squads only** — which of the three are
       * six and valid, and what they are called. It is fetched here rather than
       * threaded down from the shell so this screen is reachable on its own, at the
       * cost of one request the squad screen also makes.
       */
      const [candidates, own, roster] = await Promise.all([
        api<CandidateList>('/matchmaking/candidates'),
        api<Standing>('/me/standing'),
        api<RosterResponse>('/roster'),
      ]);
      setList(candidates);
      setStanding(own);
      setSquads(roster.assignments.offense);
      /* Absent is empty, never guessed — a squad card with no faces says the
         roster has not arrived, which is true. */
      setHeroes(roster.heroes ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated?.();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load the opponent list.');
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const openScout = useCallback(
    async (playerId: string) => {
      setTarget(playerId);
      setScout(null);
      setProblem(null);
      try {
        setScout(await api<ScoutView>(`/players/${playerId}/scout`));
      } catch (err) {
        setProblem(
          err instanceof ApiError ? err.message : 'Could not scout this player right now.',
        );
      }
    },
    [],
  );

  const attack = useCallback(async () => {
    if (!target || slot === null || starting) return;

    setStarting(true);
    setProblem(null);
    try {
      /**
       * **No `zone` in the body, and there is no code path that could read one.**
       * The server decides it from the caller's own attack streak; a client that
       * sent one would be ignored, which is the intended shape of enforcement by
       * absence.
       */
      const started = await api<StartedBattle>('/battles', {
        method: 'POST',
        body: JSON.stringify({ opponentId: target, attackSquadSlot: slot }),
      });
      onBattleStarted(started);
    } catch (err) {
      /**
       * **A `409` carries the open battle's id**, which is why resume needs no
       * separate concept — but this screen cannot navigate there on its own, so it
       * says what happened and lets the shell's next load land the player back in
       * the fight.
       */
      setProblem(
        err instanceof ApiError ? err.message : 'Could not start the battle. Nothing was spent.',
      );
    } finally {
      setStarting(false);
    }
  }, [target, slot, starting, onBattleStarted]);

  if (error) {
    return (
      <Panel span={12}>
        <p role="alert" className="text-slash-lit">
          {error}
        </p>
      </Panel>
    );
  }

  if (!list || !standing) {
    return (
      <Panel span={12}>
        <p className="text-faint">Finding opponents…</p>
      </Panel>
    );
  }

  /**
   * **Opponents beside the scout, on the shell's grid** (017 T052).
   *
   * `LMNTLZ Matchmaking and Results.dc.html` splits `minmax(0,1.5fr)
   * minmax(0,1fr)` — 60/40, which is 7 and 5 of twelve. The screen already
   * drew two columns; what it also drew was a `max-w-[1600px]` page container
   * of its own, competing with `AppShell`'s, which is what this removes.
   *
   * **The scout disclosure boundary is untouched by any of it.** `ScoutPanel`
   * renders what the scout serialiser sends and this file adds no field to it;
   * moving a region cannot widen disclosure, and `tests/attack/` still holds
   * that line (Constitution XVII).
   */
  return (
    <>
      <Panel span={12}>
        <header className="flex flex-wrap items-baseline justify-between gap-6">
        <h2 className="font-display text-xl tracking-widest uppercase text-parchment">Attack</h2>

        <p className="font-mono text-caption text-faint">
          <span className="text-parchment uppercase">{standing.league}</span> · rating{' '}
          <span className="text-parchment">{standing.rating}</span>
          {/* Named, not the K value: the constant moves and the name does not. */}
          {standing.band !== 'established' && <span> · {standing.band}</span>}
        </p>

        {/**
         * **The ambush odds, always displayed** (FR-015/FR-017). They are the odds
         * of being put into somebody's Hidden squad, they rise with every attack win
         * taken, and the client does no arithmetic on them.
         */}
        <p className="font-mono text-caption">
          <span className="text-faint">Ambush </span>
          <span className="text-gold">{list.ambushChance}%</span>
          <span className="text-faint"> · {list.consecutiveWins} wins in a row</span>
          </p>
        </header>

        <div className="mt-4 flex flex-col gap-3 empty:mt-0">
          {/**
           * **A widened match is disclosed, because it breaks a stated promise.** The
           * 1.67× gear guarantee holds inside a league and does not hold here — this is
           * what a thin league looks like from the inside.
           */}
          {list.widened && (
            <p role="status" className="font-mono text-body text-gold">
              Your league is thin, so this list reaches a band either side. These opponents may be
              better geared than the usual guarantee allows.
            </p>
          )}

          {standing.starter.active && (
            <p role="status" className="font-mono text-body text-faint">
              You are in the starter league. Every opponent here is an authored bot, and nobody can
              attack your defense until it ends.
            </p>
          )}

          {problem && (
            <p role="alert" className="font-mono text-body text-slash-lit">
              {problem}
            </p>
          )}

          {ready.length === 0 && (
            <p role="status" className="font-mono text-body text-slash-lit">
              None of your attack squads is ready. A squad needs six champions, and one that lost a
              champion to defense cannot attack until it is refilled.
            </p>
          )}
        </div>
      </Panel>

      {/**
       * **A narrow rail and a wide stage**, which is the export's 300px column
       * against everything else. The choice of opponent is a short list of
       * names; the reading of one is six portraits, two zones and a verdict, and
       * the previous 7/5 split had them the wrong way round.
       */}
      <Panel span={3}>
        <CandidateRail
          candidates={list.candidates}
          selected={target}
          onSelect={(playerId) => void openScout(playerId)}
        />
      </Panel>

      <Panel span={9}>
        {scout ? (
          <div className="flex flex-col gap-4">
            <ScoutPanel
              scout={scout}
              {...(targetRating !== undefined ? { rating: targetRating } : {})}
              ambushChance={list.ambushChance}
              consecutiveWins={list.consecutiveWins}
              squad={chosenSix}
              squadName={chosenName}
            >
              <button
                type="button"
                disabled={slot === null || starting}
                onClick={() => void attack()}
                className={[
                  'rounded-lg px-6 py-3 text-h3 font-display tracking-widest uppercase transition-shadow duration-(--duration-fast)',
                  slot !== null && !starting
                    ? 'bg-gold text-void shadow-(--shadow-glow-gold-strong) hover:brightness-110'
                    : 'text-faint ring-1 ring-line ring-inset',
                ].join(' ')}
              >
                {starting ? 'Starting…' : `Attack ${scout.username}`}
              </button>
            </ScoutPanel>

            {/**
             * **The dock sits under the reading, not beside it.** Which squad to
             * send is the last decision on the screen and it is the one the
             * readout above is an argument about — putting it first would ask
             * the question before showing the evidence.
             */}
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {ready.length > 0 && (
                <StrikingSix
                  squads={ready}
                  heroesById={heroesById}
                  wall={scout.visible.seats}
                  chosen={slot}
                  onChoose={setSlot}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption font-mono text-faint">
                  {/* Stated before the choice, never computed here. */}
                  {list.ambushChance}% chance this becomes a Hidden battle instead, which pays
                  more.
                </p>

                {/**
                 * **The profile link, 012 T040.** Scouting shows the Visible
                 * squad; the profile shows the record. They are two routes with
                 * two disclosure rules and deliberately no shared serialiser, so
                 * this is a navigation, not an expansion of the panel.
                 */}
                {onViewProfile && target ? (
                  <button
                    type="button"
                    onClick={() => onViewProfile(target)}
                    className="text-caption font-mono text-faint underline underline-offset-4 hover:text-parchment"
                  >
                    View {scout.username}&rsquo;s record
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-body font-mono text-faint">
            {target ? 'Scouting…' : 'Choose somebody to scout their Visible squad.'}
          </p>
        )}
      </Panel>
    </>
  );
}
