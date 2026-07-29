/**
 * The frozen squads a battle is fought against (007 T018, feeding T020).
 *
 * ### Why a snapshot exists at all
 *
 * PvP here is asynchronous: you attack a *record* of somebody's defense, not the
 * player. FR-001 says a defender editing their squad mid-battle must not reach a
 * fight already in progress — and the only way to guarantee that is for the
 * battle to hold its own copy and for nothing downstream to be able to ask the
 * live table anything. So `battles.defender_snapshot` carries the six seats
 * **and their per-champion configuration**, and `battle/board.ts` and
 * `battle/act.ts` read from here and from nowhere else.
 *
 * ### The parse is not paranoia — `jsonb` has no type
 *
 * Feature 006 validated this squad on the way *in*, and that validation does not
 * survive the round trip: what comes back out of a `jsonb` column is `unknown`,
 * and a shape drift between the writer and the reader would surface as a battle
 * with five heroes or a defender whose ranking is `undefined` — **a fight that is
 * wrong rather than a request that failed.** Parsing at the boundary turns that
 * into a loud error at exactly one place.
 *
 * The same instinct as `board.ts` re-checking the formation, for the same
 * reason, and worth the duplication both times.
 */

import { isPowerRanking } from '@lmntlz/sim/rules';
import { TARGET_RULES, type SquadMemberConfig, type TargetRule } from '@lmntlz/sim/ai';
import { instanceIdOf, type SeatRow, type SnapshotSeat } from './board.js';
import type { DefenderConfigs } from './packet.js';

/** A defending seat carries the configuration the engine plays it with. */
export interface DefenderSeat extends SnapshotSeat {
  readonly config: SquadMemberConfig;
}

export interface AttackerSnapshot {
  readonly seats: readonly SnapshotSeat[];
}

export interface DefenderSnapshot {
  readonly seats: readonly DefenderSeat[];
}

export class MalformedSnapshotError extends Error {
  constructor(side: 'attacker' | 'defender', detail: string) {
    super(`the ${side} snapshot on this battle is unusable: ${detail}`);
    this.name = 'MalformedSnapshotError';
  }
}

const SEAT_ROWS: readonly SeatRow[] = ['front', 'middle', 'back'];

const isSeatRow = (value: unknown): value is SeatRow =>
  typeof value === 'string' && (SEAT_ROWS as readonly string[]).includes(value);

const isTargetRule = (value: unknown): value is TargetRule =>
  typeof value === 'string' && (TARGET_RULES as readonly string[]).includes(value);

function seatArray(side: 'attacker' | 'defender', raw: unknown): readonly Record<string, unknown>[] {
  const seats = (raw as { seats?: unknown } | null)?.seats;
  if (!Array.isArray(seats)) throw new MalformedSnapshotError(side, 'no `seats` array');

  return seats.map((seat, i) => {
    if (!seat || typeof seat !== 'object') {
      throw new MalformedSnapshotError(side, `seat ${i} is not an object`);
    }
    return seat as Record<string, unknown>;
  });
}

function baseSeat(side: 'attacker' | 'defender', raw: Record<string, unknown>, i: number): SnapshotSeat {
  const { row, index, heroId } = raw;

  if (!isSeatRow(row)) throw new MalformedSnapshotError(side, `seat ${i} has row "${String(row)}"`);
  if (!Number.isInteger(index)) throw new MalformedSnapshotError(side, `seat ${i} has no index`);
  if (typeof heroId !== 'string' || heroId === '') {
    throw new MalformedSnapshotError(side, `seat ${i} has no heroId`);
  }

  return { row, index: index as number, heroId };
}

export function parseAttackerSnapshot(raw: unknown): AttackerSnapshot {
  return { seats: seatArray('attacker', raw).map((seat, i) => baseSeat('attacker', seat, i)) };
}

export function parseDefenderSnapshot(raw: unknown): DefenderSnapshot {
  const seats = seatArray('defender', raw).map((seat, i) => {
    const base = baseSeat('defender', seat, i);
    const config = seat['config'];

    if (!config || typeof config !== 'object') {
      throw new MalformedSnapshotError('defender', `seat ${i} (${base.heroId}) has no config`);
    }

    const { targeting, ranking, allyRule } = config as Record<string, unknown>;

    if (!Array.isArray(targeting) || targeting.length !== 2 || !targeting.every(isTargetRule)) {
      throw new MalformedSnapshotError(
        'defender',
        `seat ${i} (${base.heroId}) needs a targeting pair of known rules`,
      );
    }

    /**
     * **Not a length check.** `[0,1,2,3,4,4]` is six entries in range with one
     * power unreachable and another ranked twice — a defender that silently
     * never fires its ultimate, which nobody would report as a bug.
     */
    if (!isPowerRanking(ranking)) {
      throw new MalformedSnapshotError(
        'defender',
        `seat ${i} (${base.heroId}): ranking must be a permutation of 0-5`,
      );
    }

    if (allyRule !== undefined && allyRule !== null && !isTargetRule(allyRule)) {
      throw new MalformedSnapshotError('defender', `seat ${i} (${base.heroId}): unknown allyRule`);
    }

    return {
      ...base,
      config: {
        targeting: [targeting[0], targeting[1]] as SquadMemberConfig['targeting'],
        ranking,
        /**
         * **Omitted rather than set to null when absent.** `SquadMemberConfig`
         * makes `allyRule` optional precisely so the type says which champions
         * face the decision; writing `allyRule: null` onto every seat would
         * erase that distinction on the way back out of storage.
         */
        ...(isTargetRule(allyRule) ? { allyRule } : {}),
      },
    };
  });

  return { seats };
}

/**
 * The per-instance configuration map the fold needs.
 *
 * **Keyed by instance id, not hero id.** Two copies of the same champion are two
 * defenders in two seats, and they may be configured differently; a hero-keyed
 * map would silently make the second one play like the first.
 */
export function configsOf(snapshot: DefenderSnapshot): DefenderConfigs {
  return Object.fromEntries(
    snapshot.seats.map((seat) => [instanceIdOf('defender', seat), seat.config]),
  );
}
