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

import { useCallback, useMemo, useState } from 'react';
import { getHero } from '@lmntlz/content';
import {
  availablePowers,
  distance,
  legalTargets,
  type BattleState,
  type Conclusion,
} from '@lmntlz/sim/rules';
import { api, ApiError } from '../../lib/api.js';
import { BattleBoard } from './BattleBoard.js';
import { PowerDetail } from '../../components/index.js';
import { PowerDock } from './PowerDock.js';
import { SquadRail } from './SquadRail.js';
import { TargetRead } from './TargetRead.js';
import { TurnQueue } from './TurnQueue.js';
import { readTarget } from './read.js';
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
  /** Whatever is under the cursor, for the read. Purely presentational. */
  const [hovered, setHovered] = useState<string | null>(null);
  /** Likewise for the power detail — the one being peeked at, not chosen. */
  const [peeked, setPeeked] = useState<string | null>(null);

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

  /**
   * Enemies the chosen power cannot reach, and how far away each one is.
   *
   * **Drawn rather than omitted.** An enemy that is simply not clickable looks
   * like a bug; one hatched with `3 rows away` is the reach rule explaining
   * itself — and reach opens up as rows empty, so the same champion becomes
   * available later in the same battle without anything else changing.
   *
   * Only ever computed for the *other* side. An ally is not a target and is not
   * out of reach either, and hatching six of your own champions every time you
   * pick an attack would be nonsense.
   */
  const unreachable = useMemo(() => {
    const out = new Map<string, number>();
    if (actor === undefined || chosen === null) return out;

    const legal = new Set(targets);
    const friendly = getHero(actor.heroId).powers.find((p) => p.id === chosen)?.friendly ?? false;
    const wanted = friendly ? actor.side : actor.side === 'attacker' ? 'defender' : 'attacker';

    for (const hero of state.heroes) {
      if (hero.side !== wanted || hero.hp <= 0 || legal.has(hero.instanceId)) continue;
      out.set(hero.instanceId, distance(state, actor.row, hero.row));
    }
    return out;
  }, [actor, chosen, state, targets]);

  /**
   * **Recomputed from the live state every render, never stored.** A read held
   * in state would go stale the moment a packet landed and would then be
   * describing a champion at the health they had a second ago.
   */
  const read = useMemo(
    () =>
      up === null || chosen === null || hovered === null
        ? null
        : readTarget(state, up, chosen, hovered),
    [state, up, chosen, hovered],
  );

  /**
   * The power the detail panel describes: whichever is being peeked at, else
   * the one actually chosen — so the panel is never empty once a turn starts,
   * and pointing at an alternative shows it without committing to it.
   */
  const detailed = useMemo(
    () => offered.find((p) => p.id === peeked) ?? offered.find((p) => p.id === chosen) ?? null,
    [offered, peeked, chosen],
  );

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

  /**
   * **Three regions, and the middle one is the battle** — the export's 266px
   * rail, a fluid field, and a 300px rail. The screen used to be a single
   * centred column with a board of bordered boxes in it, and the two things a
   * player checks constantly, *how is my squad* and *what will this do*, had
   * nowhere to live.
   */
  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-3 p-4">
      <header className="lz-surface flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div>
          <h2 className="text-h2 font-display tracking-widest text-parchment uppercase">
            {started.zone === 'hidden' ? 'Hidden zone' : 'Visible zone'}
          </h2>
          {started.ambushed && (
            /**
             * **The player is owed the reason.** The ambush chance is displayed
             * everywhere and rolled where nobody can see it, so a Hidden battle
             * arriving unannounced would read as a bug in the one number the
             * design asks players to trust without being able to verify.
             */
            <p className="text-caption font-mono text-gold">Ambushed — their Hidden squad</p>
          )}
        </div>

        <div className="flex items-center gap-5">
          <div className="text-center">
            {/**
             * **Turns, not rounds.** The export's header says `ROUND`, and the
             * engine has no such unit: `heroTurn` counts *hero* turns, which is
             * what every cooldown and every tier gate is measured in. Printing
             * one word over the other number would make a player's mental model
             * of a cooldown wrong by a factor of the squad size.
             */}
            <p className="text-caption font-mono tracking-widest text-faint uppercase">Turn</p>
            <p className="text-h2 font-mono tabular-nums text-parchment">{state.heroTurn}</p>
          </div>

          <p
            data-turn={conclusion ? 'over' : up === null ? 'engine' : 'yours'}
            className={[
              'text-caption rounded-sm px-2.5 py-1 font-mono tracking-widest uppercase ring-1 ring-inset',
              conclusion
                ? 'text-faint ring-line'
                : up === null
                  ? 'text-slash-lit ring-slash/50'
                  : 'text-gold ring-gold/50',
            ].join(' ')}
          >
            {conclusion ? 'Battle over' : up === null ? 'Engine acting' : 'Your turn'}
          </p>
        </div>
      </header>

      {/* `items-start` so a short rail stays short. Stretching all three to the
          tallest left the squad rail as a 240×1000 box holding six 64px cards. */}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,19rem)]">
        {/**
         * The left column: your six, and under them the power you are holding.
         * That space was empty, and the detail had nowhere else it could go —
         * a power card is 180px wide and the Codex is a different screen.
         */}
        <div className="flex flex-col gap-3">
          <SquadRail
            state={state}
            side="attacker"
            activeInstanceId={up}
            targets={targets}
            unreachable={unreachable}
            onHover={setHovered}
            busy={busy}
          />
          <PowerDetail power={detailed} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <BattleBoard
            state={state}
            activeInstanceId={up}
            targets={targets}
            unreachable={unreachable}
            onTarget={send}
            onHover={setHovered}
            busy={busy}
          />

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
            <PowerDock
              actor={actor}
              offered={offered}
              chosen={chosen}
              onChoose={setPowerId}
              onHoverPower={setPeeked}
              busy={busy}
            />
          )}

          {error && (
            <p role="alert" className="text-body font-mono text-slash-lit">
              {error}
            </p>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <SquadRail
            state={state}
            side="defender"
            activeInstanceId={up}
            targets={targets}
            unreachable={unreachable}
            onHover={setHovered}
            busy={busy}
          />
          <TargetRead read={read} hasPower={chosen !== null} />
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
      <p className="font-mono text-caption text-gold">{label}</p>

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
      className={`rounded border p-6 ${won ? 'border-gold bg-raised shadow-(--shadow-glow-gold)' : 'border-line bg-surface'}`}
    >
      <h3 className="font-display text-xl tracking-widest uppercase text-parchment">
        {won ? 'Victory' : 'Defeat'}
      </h3>
      <p className="mt-1 font-mono text-caption text-faint">{conclusion.reason}</p>

      {onLeave ? (
        <button
          type="button"
          onClick={onLeave}
          className="mt-4 rounded border border-gold bg-raised shadow-(--shadow-glow-gold) px-4 py-2 text-caption font-display tracking-widest uppercase text-parchment hover:bg-surface"
        >
          Choose another target
        </button>
      ) : null}
    </section>
  );
}

function EventLog({ events }: { readonly events: ActionPacket['events'] }) {
  return (
    <section aria-label="What just happened" className="lz-surface p-4">
      <h3 className="mb-3 text-caption font-display tracking-widest uppercase text-parchment">
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

      {events.length === 0 && (
        <p className="lz-empty p-3 font-mono text-caption text-faint">Nothing yet.</p>
      )}
    </section>
  );
}
