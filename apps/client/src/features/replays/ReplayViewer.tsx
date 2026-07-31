/**
 * Watching a battle back (018 T036, T037, T038 · FR-012, FR-013, FR-014).
 *
 * ### TL;DR
 *
 * Plays the stored event log, one recorded turn at a time. It reads what the
 * server wrote down and works nothing out.
 *
 * ### ⛔ There is no re-simulation path here, and that is the feature (T037)
 *
 * Constitution XVI and 008 T023. Every number on this screen is read out of the
 * log: damage is `outcome.damage`, a death is a name in `outcome.deaths`, a
 * crit is `outcome.crit`. Nothing multiplies a stat, rolls anything, or asks a
 * rule what should have happened — so **a balance patch cannot reach a past
 * battle**, because there is nothing here for a patch to change.
 *
 * The temptation arrives as a kindness and is worth naming: the record still
 * has the seed, so an expired replay *could* be recomputed and the player could
 * watch after all. The moment that exists, today's rules run over yesterday's
 * inputs, replays silently diverge from results already paid out, and the
 * divergence is invisible — both versions look like a perfectly ordinary
 * battle. Expiry is answered with `410` and nothing else.
 *
 * ### Why this does not drive `BattleScreen` and `TurnQueue`
 *
 * `research.md` R4 says to, and **the stored log cannot** — it carries
 * `{ events, conclusion }` and no `BattleState`. Both of those components take
 * a state: `TurnQueue` projects from `accumulator`, and the board needs `maxHp`
 * and a `heroId` per seat. None of the three is in the log, and an event names
 * its actor by *seat* because `instanceIdOf()` mints ids from side and seat and
 * deliberately not from the hero in one.
 *
 * So this screen shows what the log actually holds, and builds **no second
 * board and no second turn queue** — it builds neither. The upcoming turns are
 * not projected here, they are *known*: they are the rest of the list.
 *
 * Putting the opening `BattleState` into the log would restore the board and is
 * a server change with a disclosure consequence — see `README.md` beside this
 * file. It is Jon's call, not this screen's.
 *
 * ### Three refusals, kept apart (T038)
 *
 * `expired` · `unavailable` · not found. Collapsing the first two makes a
 * recording bug look like normal expiry forever; rendering the third as a
 * permission refusal would confirm a battle exists that the server answered
 * `404` precisely to avoid confirming.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';
import { Button, Panel } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import {
  fallenBy,
  labelFor,
  standing,
  type BattleRole,
  type ReplayLog,
  type TurnEvent,
} from './types.js';

export interface ReplayViewerProps {
  readonly battleId: string;
  /** Which side the viewer fought on, so seats read as *yours* and *theirs*. */
  readonly viewerRole: BattleRole;
  readonly onLeave: () => void;
  readonly onUnauthenticated: () => void;
}

type Gone = 'expired' | 'unavailable' | 'not-found' | 'failed';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly log: ReplayLog }
  | { readonly kind: 'gone'; readonly reason: Gone };

/**
 * How long each recorded turn is held on screen.
 *
 * **A presentation cadence, not game time.** Constitution XIII governs
 * *mechanisms* — a cooldown is counted in turns and never in milliseconds — and
 * nothing here is a mechanism: the battle is over, its turn count is fixed, and
 * this is only how fast a finished list is walked. The player can step it by
 * hand instead.
 */
const BEAT_MS = 900;

export function ReplayViewer({
  battleId,
  viewerRole,
  onLeave,
  onUnauthenticated,
}: ReplayViewerProps): JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  /** How many recorded turns have been played. 0 is the opening position. */
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const log = await api<ReplayLog>(`/replays/${battleId}`);
        if (!cancelled) setLoad({ kind: 'ready', log });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthenticated();
          return;
        }
        setLoad({ kind: 'gone', reason: reasonOf(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [battleId, onUnauthenticated]);

  const total = load.kind === 'ready' ? load.log.events.length : 0;

  useEffect(() => {
    if (!playing || load.kind !== 'ready') return;
    if (cursor >= total) {
      setPlaying(false);
      return;
    }

    const timer = setTimeout(() => setCursor((c) => Math.min(total, c + 1)), BEAT_MS);
    return () => clearTimeout(timer);
  }, [playing, cursor, total, load.kind]);

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setCursor((c) => Math.max(0, Math.min(total, c + delta)));
    },
    [total],
  );

  const back = (
    <Button variant="ghost" onClick={onLeave}>
      Back to your battles
    </Button>
  );

  if (load.kind === 'loading') {
    return (
      <Panel span={12}>
        <p role="status" className="text-body tracking-widest text-faint uppercase">
          Opening the replay…
        </p>
      </Panel>
    );
  }

  if (load.kind === 'gone') {
    return (
      <Panel span={12}>
        <div className="flex flex-col items-start gap-4">
          {/**
           * `role="status"` rather than `alert`. Expiry is the ordinary end of
           * every replay's life and the overwhelmingly common case here; an
           * assertive announcement would frame the expected as a fault.
           */}
          <p data-gone={load.reason} role="status" className="text-body text-muted max-w-2xl">
            {SENTENCE[load.reason]}
          </p>
          {back}
        </div>
      </Panel>
    );
  }

  const { log } = load;
  const played = log.events.slice(0, cursor);
  const current = cursor === 0 ? null : (log.events[cursor - 1] ?? null);
  const fallen = fallenBy(log.events, cursor);
  const finished = cursor >= total;

  return (
    <>
      <Panel span={12}>
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-h1 font-display uppercase tracking-wide">Replay</h1>
            <p className="text-caption font-mono text-faint mt-1">
              {/**
               * **The versions it was fought under, which is the visible half of
               * Constitution XVI.** They are read from the log rather than from
               * the running build precisely so they can differ from it — a
               * replay recorded two engines ago still says so, and still plays
               * the same.
               */}
              Recorded under engine {log.engineVersion} · content {log.contentVersion}
            </p>
          </div>
          {back}
        </header>
      </Panel>

      <Panel span={8}>
        <section aria-label="Playback" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPlaying(false);
                setCursor(0);
              }}
              state={cursor === 0 ? 'disabled' : 'rest'}
            >
              Restart
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => step(-1)}
              state={cursor === 0 ? 'disabled' : 'rest'}
            >
              Back one turn
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => (finished ? undefined : setPlaying((p) => !p))}
              state={finished ? 'disabled' : 'rest'}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => step(1)}
              state={finished ? 'disabled' : 'rest'}
            >
              Forward one turn
            </Button>

            <p className="text-caption font-mono text-faint ml-auto tabular-nums">
              {/* Turns, which is how this game counts everything. */}
              Turn {cursor} of {total}
            </p>
          </div>

          <div
            aria-live="polite"
            data-cursor={cursor}
            className="rounded-lg border border-line bg-surface p-4"
          >
            {current === null ? (
              <p className="text-body text-faint">
                Before the first turn. Nothing has happened yet.
              </p>
            ) : (
              <Turn event={current} viewerRole={viewerRole} />
            )}
          </div>

          <ol aria-label="Turns" className="flex flex-col gap-1">
            {log.events.map((event, i) => (
              <li
                key={i}
                data-turn={i + 1}
                aria-current={i + 1 === cursor ? 'step' : undefined}
                className={[
                  'text-caption flex gap-3 rounded px-2 py-1 font-mono',
                  i + 1 === cursor
                    ? 'bg-raised text-parchment'
                    : i < cursor
                      ? 'text-muted'
                      : /* Not hidden. The rest of the list *is* the turn queue —
                           known, because it already happened, rather than
                           projected from an accumulator. */
                        'text-faint',
                ].join(' ')}
              >
                <span className="w-8 shrink-0 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">{summarise(event, viewerRole)}</span>
              </li>
            ))}
          </ol>
        </section>
      </Panel>

      <Panel span={4}>
        <div className="flex flex-col gap-4">
          <section aria-label="Still standing" className="rounded-lg border border-line bg-surface p-4">
            <h2 className="text-caption mb-2 font-mono tracking-[0.2em] uppercase text-faint">
              Still standing
            </h2>
            {/**
             * **Counted from `outcome.deaths` and nothing else.** No HP is shown
             * because none is in the log: the events carry damage, not health,
             * and a bar drawn from a `maxHp` this screen invented would be a
             * number the battle never had.
             */}
            <dl className="text-body flex flex-col gap-1">
              <Side label="Yours" count={standing(log.events, cursor, viewerRole)} />
              <Side
                label="Theirs"
                count={standing(
                  log.events,
                  cursor,
                  viewerRole === 'attacker' ? 'defender' : 'attacker',
                )}
              />
            </dl>
            {fallen.size > 0 && (
              <p className="text-caption font-mono text-faint mt-3">
                Fallen: {[...fallen].map((id) => labelFor(id, viewerRole)).join(' · ')}
              </p>
            )}
          </section>

          {finished && log.conclusion ? (
            <section
              aria-label="Result"
              className={`rounded-lg border p-4 ${
                log.conclusion.winner === viewerRole ? 'border-gold bg-raised' : 'border-line bg-surface'
              }`}
            >
              <h2 className="text-h3 font-display uppercase tracking-widest text-parchment">
                {log.conclusion.winner === viewerRole ? 'Victory' : 'Defeat'}
              </h2>
              <p className="text-caption font-mono text-faint mt-1">{log.conclusion.reason}</p>
            </section>
          ) : null}

          <p className="text-caption text-faint">
            {played.length} of {total} turns played.
          </p>
        </div>
      </Panel>
    </>
  );
}

function Side({ label, count }: { readonly label: string; readonly count: number }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-parchment tabular-nums">{count}</dd>
    </div>
  );
}

function Turn({
  event,
  viewerRole,
}: {
  readonly event: TurnEvent;
  readonly viewerRole: BattleRole;
}): JSX.Element {
  const actor = labelFor(event.actorInstanceId, viewerRole);

  if (event.powerId === null) {
    return (
      <p className="text-body text-muted">
        <span className="text-parchment">{actor}</span> passed — nothing it owned had a legal
        target.
      </p>
    );
  }

  const target = labelFor(event.targetInstanceId, viewerRole);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-parchment">
        {actor} → {target}
      </p>
      <p className="text-caption font-mono text-muted">
        {event.outcome.hit ? (
          <>
            {event.outcome.damage > 0 && (
              <span className="text-slash-lit">{event.outcome.damage} damage</span>
            )}
            {event.outcome.healing > 0 && (
              <span className="text-earth-lit">{event.outcome.healing} healed</span>
            )}
            {event.outcome.crit && <span className="text-gold"> · critical</span>}
          </>
        ) : (
          <span className="text-faint">missed</span>
        )}
      </p>

      {event.outcome.ridersLanded.length > 0 && (
        <p className="text-caption font-mono text-gold">
          Landed: {event.outcome.ridersLanded.join(', ')}
        </p>
      )}
      {event.outcome.ridersResisted.length > 0 && (
        <p className="text-caption font-mono text-faint">
          Resisted: {event.outcome.ridersResisted.join(', ')}
        </p>
      )}
      {event.outcome.deaths.length > 0 && (
        <p className="text-caption font-mono text-slash-lit">
          Fell: {event.outcome.deaths.map((id) => labelFor(id, viewerRole)).join(', ')}
        </p>
      )}
    </div>
  );
}

/** One line per turn for the list — the same facts, read out of the log. */
function summarise(event: TurnEvent, viewerRole: BattleRole): string {
  const actor = labelFor(event.actorInstanceId, viewerRole);
  if (event.powerId === null) return `${actor} passed`;

  const target = labelFor(event.targetInstanceId, viewerRole);
  if (!event.outcome.hit) return `${actor} → ${target}: missed`;

  const parts: string[] = [];
  if (event.outcome.damage > 0) parts.push(`${event.outcome.damage}`);
  if (event.outcome.healing > 0) parts.push(`+${event.outcome.healing}`);
  if (event.outcome.crit) parts.push('crit');
  if (event.outcome.deaths.length > 0) parts.push('fell');

  return `${actor} → ${target}: ${parts.join(' · ') || 'no effect'}`;
}

/**
 * The server's machine-readable reason, mapped to what the player is owed.
 *
 * A `410` carries `reason` beside the error body precisely so this mapping can
 * exist without parsing prose.
 */
function reasonOf(err: unknown): Gone {
  if (!(err instanceof ApiError)) return 'failed';
  if (err.status === 404) return 'not-found';
  if (err.status === 410) {
    const reason = err.body?.['reason'];
    return reason === 'unavailable' ? 'unavailable' : 'expired';
  }
  return 'failed';
}

const SENTENCE: Readonly<Record<Gone, string>> = {
  /* FR-012 — the *replay* is what is gone. The battle happened and its result
     stands; nothing here suggests a record was removed. */
  expired:
    'This replay is no longer watchable. Replays are held for seven days, and this battle is past its window — the result and the record are unchanged.',
  /* Kept apart from expiry deliberately: a recording that failed is a fault,
     and merging the two would make it look like a normal lifecycle forever. */
  unavailable:
    'This battle was never recorded. Something went wrong when the replay was written, so there is nothing to play — the result and the record are unchanged.',
  /**
   * **Constitution XVII.** The server answers `404` for a battle that is not
   * yours *and* for one that does not exist, so that existence is never
   * confirmed. This sentence must not distinguish them either: any hint of
   * permission would tell the caller there is something to have permission for.
   */
  'not-found': 'No such replay was found.',
  failed: 'The replay could not be reached. Try again in a moment.',
};
