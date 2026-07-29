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
        <h3 className="font-display text-xs tracking-widest uppercase text-parchment">Turn order</h3>
        <span className="font-mono text-xs text-faint">projected</span>
      </header>

      <ol className="flex flex-col gap-1">
        {queue.map((instanceId, i) => {
          const hero = heroOf(instanceId);
          const mine = hero?.side === 'attacker';

          return (
            <li
              /**
               * **Keyed by position, not by instance.** A hero fast enough to
               * appear twice in one projection is the normal case at a wide
               * Speed spread, so an instance id is not unique here.
               */
              key={`${i}-${instanceId}`}
              className={`flex items-center justify-between gap-3 rounded px-2 py-1 font-mono text-xs ${
                i === 0 ? 'bg-raised text-parchment' : 'text-muted'
              }`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="w-4 text-right text-faint">
                  {i + 1}
                </span>
                <span>{hero ? heroName(hero.heroId) : instanceId}</span>
              </span>

              <span className={mine ? 'text-gold' : 'text-faint'}>
                {mine ? 'yours' : 'enemy'}
              </span>
            </li>
          );
        })}
      </ol>

      {queue.length === 0 && (
        <p className="font-mono text-xs text-faint">No standing champions.</p>
      )}
    </section>
  );
}
