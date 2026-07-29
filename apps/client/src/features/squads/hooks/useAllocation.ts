/**
 * Local allocation state for the squad builder (T020).
 *
 * ### What this mirrors and what it must not decide
 *
 * The builder needs an answer on every drag — *is this legal, who is already
 * committed, how many are left* — and a round trip per pointer move is not an
 * option. So the **shape** rules run locally, from `@lmntlz/sim/rules`, which is
 * the same module the server validates with rather than a copy of it.
 *
 * **Two things are never decided here, and both are server-authoritative:**
 *
 * | Decision | Why not local |
 * |---|---|
 * | **eviction** | it depends on all three attack squads as they exist *on the server*; a stale client would under-report, and under-reporting is how a player finds the third squad mid-battle |
 * | **the streak reset** | it is a hash comparison against the *stored* squad. A client that computed it would be computing it about state it might not have. |
 *
 * The local result is feedback. The response to `PUT` is the truth, and where
 * they disagree the server's answer replaces the local one — never merges with
 * it.
 */

import { useCallback, useMemo, useState } from 'react';
import { SQUAD_SIZE, validateFormation, type FormationFault, type Seat, type SquadRow } from '@lmntlz/sim/rules';
import type { RosterResponse, Zone } from '../types.js';

export const DEFENSE_TOTAL = 12;
export const ATTACK_SQUADS = 3;

export interface AllocationView {
  /** Seats currently placed in the squad being edited. */
  readonly seats: readonly Seat[];
  /** `null` when the six seats are a legal 2/3/1 formation. */
  readonly fault: FormationFault | null;
  readonly isComplete: boolean;
  /** Heroes committed to either defense zone, across the whole account. */
  readonly defending: ReadonlySet<string>;
  /** How many of the 27 remain for offense once defense is committed. */
  readonly poolForOffense: number;
  place(hero: string, row: SquadRow, index: number): void;
  remove(hero: string): void;
  clear(): void;
  reset(to: readonly Seat[]): void;
}

export function useAllocation(roster: RosterResponse | null, editing: Zone | number): AllocationView {
  const initial = useMemo<readonly Seat[]>(() => {
    if (!roster) return [];
    return typeof editing === 'number'
      ? (roster.assignments.offense.find((o) => o.slot === editing)?.seats ?? [])
      : roster.assignments.defense[editing].seats;
  }, [roster, editing]);

  const [seats, setSeats] = useState<readonly Seat[]>(initial);

  const place = useCallback((heroId: string, row: SquadRow, index: number) => {
    setSeats((current) => {
      const from = current.find((s) => s.heroId === heroId);
      const occupant = current.find((s) => s.row === row && s.index === index);

      /**
       * **Two different gestures that look like one drop.**
       *
       * Moving an *already-seated* hero onto an occupied seat is a **swap** —
       * the two exchange positions and the squad still has six. Dropping a hero
       * from the bench onto an occupied seat is a **replacement** — the occupant
       * leaves.
       *
       * Treating both as "remove the occupant" silently shrinks a full squad to
       * five every time a player reorders their formation, which is the single
       * most common thing they will do on this screen.
       */
      if (from && occupant && occupant.heroId !== heroId) {
        return current.map((s) => {
          if (s.heroId === heroId) return { row, index, heroId };
          if (s.heroId === occupant.heroId) return { row: from.row, index: from.index, heroId: s.heroId };
          return s;
        });
      }

      const without = current.filter(
        (s) => s.heroId !== heroId && !(s.row === row && s.index === index),
      );
      return [...without, { row, index, heroId }];
    });
  }, []);

  const remove = useCallback((heroId: string) => {
    setSeats((current) => current.filter((s) => s.heroId !== heroId));
  }, []);

  const clear = useCallback(() => setSeats([]), []);
  const reset = useCallback((to: readonly Seat[]) => setSeats(to), []);

  const fault = useMemo(() => validateFormation(seats), [seats]);

  const defending = useMemo(() => {
    const committed = new Set<string>();
    if (!roster) return committed;
    for (const zone of ['visible', 'hidden'] as const) {
      for (const seat of roster.assignments.defense[zone].seats) committed.add(seat.heroId);
    }
    // The zone being edited right now is the in-progress version, not the
    // stored one — otherwise removing a hero locally still shows her committed.
    if (typeof editing !== 'number') {
      for (const seat of roster.assignments.defense[editing].seats) committed.delete(seat.heroId);
      for (const seat of seats) committed.add(seat.heroId);
    }
    return committed;
  }, [roster, editing, seats]);

  return {
    seats,
    fault,
    isComplete: seats.length === SQUAD_SIZE && fault === null,
    defending,
    poolForOffense: (roster?.heroes.length ?? 0) - defending.size,
    place,
    remove,
    clear,
    reset,
  };
}
