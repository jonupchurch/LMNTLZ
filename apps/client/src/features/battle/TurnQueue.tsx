/**
 * Who acts next, projected locally (007 T029, FR-006).
 *
 * ### This makes no request, and that is the requirement
 *
 * `turnQueue` is a pure function of the board the client already has. Asking the
 * server would be a round trip per turn to compute something both sides can
 * derive from the same state — and it would make the queue arrive *after* the
 * player had already been asked to choose, which is precisely when they need it.
 *
 * **It is the same function the engine orders turns with.** `nextActor` on the
 * server and `turnQueue` here are checked against each other for twenty
 * consecutive turns in `turnLoop.test.ts`, because a queue that ordered ties
 * differently would be quietly lying on every screen the player plans against.
 *
 * ### A tick is internal; a queue is what the player sees
 *
 * Every standing hero gains `50 + Speed` per tick and acts at 100. Nobody should
 * ever have to know that. The accumulator is not shown, the tick is not shown,
 * and what is rendered is the ordered list the arithmetic produces.
 *
 * ### The export draws a rail; its node numbers are ticks, and those do not come
 *
 * `LMNTLZ Turn Sequence.dc.html` renders the order as connected nodes down a
 * rail — a numbered disc per entry, a 2px line joining them — and that reads
 * far better than a flat list, so it is what this draws now (017 T051).
 *
 * **The number inside the disc is `{{ f.tick }}` in the export, and it is not
 * here.** Constitution XIII and `CLAUDE.md` both settle it in the same words:
 * *a tick is internal — the player sees a projected turn queue*. Putting the
 * tick on screen would make the accumulator part of the interface, and then
 * every future change to `50 + Speed` becomes a visible change to a number
 * players have learned to read. The disc carries the **position in the queue**:
 * 1 is next, 2 is after that, and nothing about how the engine got there.
 */

import { turnQueue, type BattleState } from '@lmntlz/sim/rules';

export interface TurnQueueProps {
  readonly state: BattleState;
  /** How far ahead to project. Beyond ~8 the projection is noise, not a plan. */
  readonly lookahead?: number;
  readonly heroName: (heroId: string) => string;
}

/**
 * **Eight, and the number has a reason.** The queue is a plan, and a plan long
 * enough to include a turn that a single kill will reorder is worse than no plan
 * — it reads as the game changing its mind. Eight covers roughly one round and a
 * half at typical Speed spreads.
 */
const DEFAULT_LOOKAHEAD = 8;

export function TurnQueue({ state, lookahead = DEFAULT_LOOKAHEAD, heroName }: TurnQueueProps) {
  const queue = turnQueue(state, lookahead);
  const heroOf = (instanceId: string) => state.heroes.find((h) => h.instanceId === instanceId);

  return (
    <section aria-label="Turn order" className="rounded border border-line bg-surface p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-caption font-display tracking-widest uppercase text-parchment">Turn order</h3>
        <span className="font-mono text-caption text-faint">projected</span>
      </header>

      <ol className="flex flex-col">
        {queue.map((instanceId, i) => {
          const hero = heroOf(instanceId);
          const mine = hero?.side === 'attacker';
          const last = i === queue.length - 1;

          return (
            <li
              /**
               * **Keyed by position, not by instance.** A hero fast enough to
               * appear twice in one projection is the normal case at a wide
               * Speed spread, so an instance id is not unique here.
               */
              key={`${i}-${instanceId}`}
              className="grid grid-cols-[26px_1fr] gap-3"
            >
              {/* The rail: a numbered disc, and a line down to the next one. */}
              <span aria-hidden className="flex flex-col items-center">
                <span
                  className={[
                    'text-caption flex size-6.5 shrink-0 items-center justify-center rounded-full border-2 font-mono',
                    i === 0
                      ? 'border-gold bg-gold text-void'
                      : 'border-line bg-surface text-faint',
                  ].join(' ')}
                >
                  {/* Position in the queue. Never the tick — see the note above. */}
                  {i + 1}
                </span>
                {!last && <span className="w-0.5 flex-1 bg-line" />}
              </span>

              <span
                className={[
                  'text-caption flex items-baseline justify-between gap-3 pb-2 font-mono',
                  i === 0 ? 'text-parchment' : 'text-muted',
                ].join(' ')}
              >
                <span className="truncate">{hero ? heroName(hero.heroId) : instanceId}</span>
                <span className={mine ? 'shrink-0 text-gold' : 'shrink-0 text-faint'}>
                  {mine ? 'yours' : 'enemy'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {queue.length === 0 && (
        <p className="font-mono text-caption text-faint">No standing champions.</p>
      )}
    </section>
  );
}
