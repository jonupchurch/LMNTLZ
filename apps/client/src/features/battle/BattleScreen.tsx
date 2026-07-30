/**
 * The battle screen (007 T028, FR-004).
 *
 * ### It renders what the server sent and decides nothing
 *
 * The server resolves; this displays. There is no local damage arithmetic, no
 * local hit roll, no local guess at what a move will do — the packet arrives
 * with every turn already resolved, and this walks it.
 *
 * **The one thing computed locally is what to OFFER**, and that is not the same
 * as deciding. `availablePowers` and `legalTargets` come from
 * `@lmntlz/sim/rules` — the same module the server refuses illegal intents with
 * — so the set the player is shown and the set the server accepts are the same
 * set by construction rather than by two implementations agreeing. A client that
 * offered a move the server rejects is a client that looks broken; a client that
 * hid a legal move is worse, because nobody reports it.
 *
 * ### One request per choice, not one per turn
 *
 * A packet folds every forced turn and **every defender turn** into the
 * response. So the loop here is: show the board, wait for a choice, send it, get
 * back several turns, show the board. A battle is ~60–85 of these, not ~250.
 *
 * ### What this file deliberately does not do yet
 *
 * US3 (T031–T034) adds the latency-hiding layer — the wind-up starting on the
 * click rather than on the response, and the packet playing out at its own pace.
 * This renders the *end state* of each packet directly, which is correct and
 * abrupt. Building the animation first would have meant animating against a
 * contract nothing had exercised.
 */

import { useCallback, useState } from 'react';
import { getHero } from '@lmntlz/content';
import {
  availablePowers,
  isStanding,
  legalTargets,
  type BattleState,
  type Conclusion,
} from '@lmntlz/sim/rules';
import { api, ApiError } from '../../lib/api.js';
import { TurnQueue } from './TurnQueue.js';
import { useIntent, type IntentPhase } from './useIntent.js';
import type { ActionPacket, BattleView, StartedBattle, TurnEvent } from './types.js';

export interface BattleScreenProps {
  readonly started: StartedBattle;
  /** Called when the battle concludes, so the shell can move on. */
  readonly onConcluded?: (conclusion: Conclusion) => void;
  /**
   * **The way out, and without it there is not one.**
   *
   * While a battle is open the shell hides the tab bar deliberately — the
   * one-at-a-time rule means every other screen would refuse the player anyway.
   * But it never gave the tab bar back when the battle *ended*, so the result
   * screen was terminal: no button, no nav, and the only exit was reloading the
   * browser. `onConcluded` reasoned that "the next load lands them on the squad
   * screen", which is true and is not a way out of the current one.
   *
   * Called by an explicit control on the result, never automatically — going
   * straight back to a list would animate over the outcome the player just
   * fought for.
   */
  readonly onLeave?: () => void;
  readonly onUnauthenticated?: () => void;
}

const heroName = (heroId: string): string => {
  try {
    return getHero(heroId).name;
  } catch {
    return heroId;
  }
};

export function BattleScreen({
  started,
  onConcluded,
  onLeave,
  onUnauthenticated,
}: BattleScreenProps) {
  const [state, setState] = useState<BattleState>(started.packet.state);
  const [sequence, setSequence] = useState(started.sequence);
  const [events, setEvents] = useState(started.packet.events);
  const [conclusion, setConclusion] = useState(started.packet.conclusion);
  const [powerId, setPowerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const up = state.turnOfInstance;
  const actor = up === null ? undefined : state.heroes.find((h) => h.instanceId === up);

  /**
   * **Powers that are off cooldown, past their tier gate, and have somewhere to
   * point.** A power with no legal target is not an option — offering it and
   * then presenting an empty target list is the shape of a UI that looks broken
   * while being technically correct.
   */
  const offered =
    up === null
      ? []
      : availablePowers(state, up).filter(
          (power) => legalTargets(state, up, power.id).candidates.length > 0,
        );

  const chosen = powerId ?? offered[0]?.id ?? null;
  const targeting = up !== null && chosen !== null ? legalTargets(state, up, chosen) : null;

  /**
   * **A compelled target is not a choice.** A taunt collapses the list to one,
   * and showing six with five that will be refused would read as the taunt
   * having failed rather than having worked.
   */
  const targets = targeting
    ? targeting.compelled !== null
      ? [targeting.compelled]
      : targeting.candidates
    : [];

  const apply = useCallback(
    (packet: ActionPacket, next: number) => {
      setState(packet.state);
      setEvents(packet.events);
      setSequence(next);
      setPowerId(null);
      setConclusion(packet.conclusion);
      if (packet.conclusion) onConcluded?.(packet.conclusion);
    },
    [onConcluded],
  );

  const onFailed = useCallback(
    async (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated?.();
        return;
      }

      /**
       * **A `409` is recoverable and is recovered from here, silently.**
       *
       * It means the server's history and this client's disagree — a retry that
       * landed after a timeout, or two tabs. The contract's answer is to
       * re-read, and re-reading is a complete fix: state is re-derived from the
       * log on every call, so there is nothing stale left to reconcile. Showing
       * the player an error for something the client can resolve on its own
       * would be the wrong half of server authority.
       */
      if (err instanceof ApiError && err.status === 409) {
        const view = await api<BattleView>(`/battles/${started.battleId}`);
        setState(view.state);
        setSequence(view.sequence);
        setEvents([]);
        setConclusion(view.conclusion);
        setPowerId(null);
        return;
      }

      setError(
        err instanceof ApiError
          ? err.body?.error.message ?? 'That move was refused.'
          : 'The battle could not be reached.',
      );
    },
    [onUnauthenticated, started.battleId],
  );

  const { phase, busy, commit } = useIntent({
    battleId: started.battleId,
    onResolved: apply,
    onFailed: (err) => void onFailed(err),
  });

  /**
   * **Nothing is awaited in the click path.** `commit` sets the wind-up phase
   * synchronously and fires the request in the same tick; everything after that
   * happens on the hook's own clock. A handler that awaited here would put the
   * round trip back between the click and the first frame of motion.
   */
  const send = useCallback(
    (targetInstanceId: string) => {
      if (up === null || chosen === null || busy) return;
      setError(null);
      commit({ sequence, actorInstanceId: up, powerId: chosen, targetInstanceId });
    },
    [busy, chosen, commit, sequence, up],
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl tracking-widest uppercase text-parchment">
          {started.zone === 'hidden' ? 'Hidden Zone' : 'Visible Zone'}
        </h2>
        {started.ambushed && (
          /**
           * **The player is owed the reason.** The ambush chance is displayed
           * everywhere and rolled where nobody can see it, so a Hidden battle
           * arriving unannounced would read as a bug in the one number the
           * design asks players to trust without being able to verify.
           */
          <p className="font-mono text-xs text-gold">Ambushed — their Hidden squad</p>
        )}
      </header>

      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-4">
          <Board state={state} activeInstanceId={up} targets={targets} onTarget={send} busy={busy} />

          {conclusion ? (
            <Outcome conclusion={conclusion} onLeave={onLeave} />
          ) : busy ? (
            /**
             * **The move panel is replaced, not disabled.** A greyed-out panel
             * during a resolution invites the player to keep aiming at controls
             * that will not answer; the resolution is what they should be
             * watching, so it is what occupies the space.
             */
            <Resolving phase={phase} />
          ) : (
            <Choice
              actorName={actor ? heroName(actor.heroId) : null}
              offered={offered}
              chosen={chosen}
              onChoose={setPowerId}
              busy={busy}
            />
          )}

          {error && (
            <p role="alert" className="font-mono text-sm text-slash-lit">
              {error}
            </p>
          )}
        </div>

        <aside className="flex w-72 shrink-0 flex-col gap-4">
          <TurnQueue state={state} heroName={heroName} />
          <EventLog events={events} />
        </aside>
      </div>
    </main>
  );
}

/**
 * What the player looks at while the round trip happens (T032, T034).
 *
 * Three states, and the middle one is the whole point. `winding` is motion the
 * player was going to watch anyway; **`holding` is the natural wait point** —
 * a champion at the top of its swing, which reads as anticipation rather than
 * as a stall, because it is a pose the animation was designed to reach.
 * `playing` walks the folded turns on the client's own clock, touching nothing.
 */
function Resolving({ phase }: { readonly phase: IntentPhase }) {
  const label =
    phase.kind === 'holding'
      ? 'Held…'
      : phase.kind === 'playing'
        ? `${phase.index + 1} of ${phase.total}`
        : 'Committing…';

  return (
    <section
      aria-label="Resolving"
      aria-busy="true"
      data-phase={phase.kind}
      className="rounded border border-gold/40 bg-surface p-4"
    >
      <p className="font-mono text-xs text-gold">{label}</p>

      {phase.kind === 'playing' && (
        <p className="mt-2 font-mono text-[0.7rem] text-muted">{describe(phase.event)}</p>
      )}
    </section>
  );
}

const describe = (event: TurnEvent): string =>
  event.powerId === null
    ? `${event.actorInstanceId} passed`
    : `${event.actorInstanceId} → ${event.targetInstanceId ?? '—'}: ${
        event.outcome.hit ? `${event.outcome.damage}${event.outcome.crit ? ' crit' : ''}` : 'miss'
      }`;

interface BoardProps {
  readonly state: BattleState;
  readonly activeInstanceId: string | null;
  readonly targets: readonly string[];
  readonly onTarget: (instanceId: string) => void;
  readonly busy: boolean;
}

/** Rows 1–3 are the player's, 4–6 the enemy's, on one shared axis. */
function Board({ state, activeInstanceId, targets, onTarget, busy }: BoardProps) {
  const side = (which: 'attacker' | 'defender') =>
    state.heroes.filter((h) => h.side === which).sort((a, b) => a.row - b.row);

  const legal = new Set(targets);

  const cell = (instanceId: string) => {
    const hero = state.heroes.find((h) => h.instanceId === instanceId)!;
    const selectable = legal.has(instanceId);
    const down = !isStanding(hero);

    return (
      <button
        key={instanceId}
        type="button"
        disabled={!selectable || busy}
        onClick={() => onTarget(instanceId)}
        aria-label={`${heroName(hero.heroId)}, ${hero.hp} of ${hero.maxHp} health${
          selectable ? ', targetable' : ''
        }`}
        className={`w-32 rounded border p-2 text-left transition-colors ${
          down
            ? 'border-line bg-bg opacity-40'
            : instanceId === activeInstanceId
              ? 'border-gold bg-raised'
              : selectable
                ? 'border-gold/60 bg-surface hover:bg-raised'
                : 'border-line bg-surface'
        } ${selectable && !busy ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="block truncate font-display text-xs tracking-wide text-parchment">
          {heroName(hero.heroId)}
        </span>
        <span className="mt-1 block font-mono text-[0.65rem] text-faint">
          {hero.hp} / {hero.maxHp}
        </span>
        <span aria-hidden className="mt-1 block h-1 w-full rounded bg-void">
          <span
            className="block h-1 rounded bg-gold"
            style={{ width: `${Math.max(0, Math.round((hero.hp / hero.maxHp) * 100))}%` }}
          />
        </span>
      </button>
    );
  };

  return (
    <section aria-label="Battle board" className="flex flex-col gap-6 rounded border border-line bg-surface p-6">
      <div>
        <h3 className="mb-2 font-display text-xs tracking-widest uppercase text-faint">Defenders</h3>
        <div className="flex flex-wrap gap-2">{side('defender').map((h) => cell(h.instanceId))}</div>
      </div>
      <div>
        <h3 className="mb-2 font-display text-xs tracking-widest uppercase text-faint">Your squad</h3>
        <div className="flex flex-wrap gap-2">{side('attacker').map((h) => cell(h.instanceId))}</div>
      </div>
    </section>
  );
}

interface ChoiceProps {
  readonly actorName: string | null;
  readonly offered: readonly { readonly id: string; readonly name: string }[];
  readonly chosen: string | null;
  readonly onChoose: (powerId: string) => void;
  readonly busy: boolean;
}

function Choice({ actorName, offered, chosen, onChoose, busy }: ChoiceProps) {
  return (
    <section aria-label="Your move" className="rounded border border-line bg-surface p-4">
      <p className="mb-3 font-mono text-xs text-faint">
        {actorName ? `${actorName} is up — choose a power, then a target.` : 'Waiting…'}
      </p>

      <div className="flex flex-wrap gap-2">
        {offered.map((power) => (
          <button
            key={power.id}
            type="button"
            disabled={busy}
            onClick={() => onChoose(power.id)}
            aria-pressed={power.id === chosen}
            className={`rounded border px-3 py-2 font-display text-xs tracking-wide uppercase transition-colors ${
              power.id === chosen
                ? 'border-gold bg-raised text-gold'
                : 'border-line bg-bg text-muted hover:bg-raised'
            }`}
          >
            {power.name}
          </button>
        ))}
      </div>

      {offered.length === 0 && (
        <p className="font-mono text-xs text-faint">Nothing in reach — the turn will pass.</p>
      )}
    </section>
  );
}

function Outcome({
  conclusion,
  onLeave,
}: {
  readonly conclusion: Conclusion;
  readonly onLeave?: (() => void) | undefined;
}) {
  const won = conclusion.winner === 'attacker';

  return (
    <section
      aria-label="Result"
      className={`rounded border p-6 ${won ? 'border-gold bg-raised' : 'border-line bg-surface'}`}
    >
      <h3 className="font-display text-xl tracking-widest uppercase text-parchment">
        {won ? 'Victory' : 'Defeat'}
      </h3>
      <p className="mt-1 font-mono text-xs text-faint">{conclusion.reason}</p>

      {onLeave ? (
        <button
          type="button"
          onClick={onLeave}
          className="mt-4 rounded border border-gold bg-raised px-4 py-2 font-display text-xs tracking-widest uppercase text-parchment hover:bg-surface"
        >
          Choose another target
        </button>
      ) : null}
    </section>
  );
}

function EventLog({ events }: { readonly events: ActionPacket['events'] }) {
  return (
    <section aria-label="What just happened" className="rounded border border-line bg-surface p-4">
      <h3 className="mb-3 font-display text-xs tracking-widest uppercase text-parchment">
        Last exchange
      </h3>

      <ol className="flex flex-col gap-1 font-mono text-[0.7rem] text-muted">
        {events.map((event, i) => (
          <li key={`${i}-${event.actorInstanceId}`}>
            {event.powerId === null
              ? `${event.actorInstanceId} passed`
              : `${event.actorInstanceId} → ${event.targetInstanceId ?? '—'}: ${
                  event.outcome.hit ? `${event.outcome.damage}${event.outcome.crit ? ' crit' : ''}` : 'miss'
                }`}
          </li>
        ))}
      </ol>

      {events.length === 0 && <p className="font-mono text-xs text-faint">Nothing yet.</p>}
    </section>
  );
}
