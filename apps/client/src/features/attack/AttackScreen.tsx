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
import { api, ApiError } from '../../lib/api.js';
import { ScoutPanel } from './ScoutPanel.js';
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
      <div className="mx-auto max-w-[1600px] px-8 py-12">
        <p role="alert" className="text-slash-lit">
          {error}
        </p>
      </div>
    );
  }

  if (!list || !standing) {
    return (
      <div className="mx-auto max-w-[1600px] px-8 py-12">
        <p className="text-faint">Finding opponents…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-8 px-8 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-6">
        <h2 className="font-display text-xl tracking-widest uppercase text-parchment">Attack</h2>

        <p className="font-mono text-xs text-faint">
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
        <p className="font-mono text-xs">
          <span className="text-faint">Ambush </span>
          <span className="text-gold">{list.ambushChance}%</span>
          <span className="text-faint"> · {list.consecutiveWins} wins in a row</span>
        </p>
      </header>

      {/**
       * **A widened match is disclosed, because it breaks a stated promise.** The
       * 1.67× gear guarantee holds inside a league and does not hold here — this is
       * what a thin league looks like from the inside.
       */}
      {list.widened && (
        <p role="status" className="font-mono text-sm text-gold">
          Your league is thin, so this list reaches a band either side. These opponents may be
          better geared than the usual guarantee allows.
        </p>
      )}

      {standing.starter.active && (
        <p role="status" className="font-mono text-sm text-faint">
          You are in the starter league. Every opponent here is an authored bot, and nobody can
          attack your defense until it ends.
        </p>
      )}

      {problem && (
        <p role="alert" className="font-mono text-sm text-slash-lit">
          {problem}
        </p>
      )}

      {ready.length === 0 && (
        <p role="status" className="font-mono text-sm text-slash-lit">
          None of your attack squads is ready. A squad needs six champions, and one that lost a
          champion to defense cannot attack until it is refilled.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
        <section aria-label="Opponents">
          {list.candidates.length === 0 ? (
            <p className="font-mono text-sm text-faint">
              Nobody in your league has a full Visible squad to attack yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.candidates.map((candidate) => (
                <li key={candidate.playerId}>
                  <button
                    type="button"
                    aria-pressed={target === candidate.playerId}
                    onClick={() => void openScout(candidate.playerId)}
                    className={[
                      'w-full rounded border px-3 py-2 text-left transition-colors',
                      target === candidate.playerId
                        ? 'border-gold bg-raised'
                        : 'border-line bg-surface hover:border-faint',
                    ].join(' ')}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-sm tracking-wide text-parchment">
                        {candidate.username}
                      </span>
                      <span className="font-mono text-[11px] text-faint">
                        rating {candidate.rating}
                      </span>
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-faint">
                      hold {candidate.visibleHoldStreak} visible · {candidate.hiddenHoldStreak}{' '}
                      hidden
                      {/* Disclosed rather than hidden: a hold against a bot and a
                          hold against a person are different facts. */}
                      {candidate.isBot && <span className="ml-2 text-dark-lit">bot</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {scout ? (
          <ScoutPanel scout={scout}>
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {ready.length > 1 && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="radiogroup"
                  aria-label="Attack squad"
                >
                  {ready.map((squad) => (
                    <button
                      key={squad.slot}
                      type="button"
                      role="radio"
                      aria-checked={slot === squad.slot}
                      onClick={() => setSlot(squad.slot)}
                      className={[
                        'rounded border px-3 py-1 font-mono text-xs',
                        slot === squad.slot
                          ? 'border-gold bg-raised text-parchment'
                          : 'border-line text-faint',
                      ].join(' ')}
                    >
                      {squad.name ?? `Attack ${squad.slot + 1}`}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={slot === null || starting}
                onClick={() => void attack()}
                className={[
                  'rounded border px-4 py-2 font-display text-sm tracking-widest uppercase',
                  slot !== null && !starting
                    ? 'border-gold bg-raised text-parchment hover:bg-gold/20'
                    : 'border-line text-faint',
                ].join(' ')}
              >
                {starting ? 'Starting…' : `Attack ${scout.username}`}
              </button>

              <p className="font-mono text-[11px] text-faint">
                {/* Stated before the choice, never computed here. */}
                {list.ambushChance}% chance this becomes a Hidden battle instead, which pays more.
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
                  className="self-start font-mono text-[11px] text-faint underline underline-offset-4"
                >
                  View {scout.username}&rsquo;s record
                </button>
              ) : null}
            </div>
          </ScoutPanel>
        ) : (
          <p className="font-mono text-sm text-faint">
            {target ? 'Scouting…' : 'Choose somebody to scout their Visible squad.'}
          </p>
        )}
      </div>
    </div>
  );
}
