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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SQUAD_SIZE,
  validateFormation,
  validatePlacement,
  type FormationFault,
  type Seat,
  type SquadRow,
} from '@lmntlz/sim/rules';
import type { ConfiguredSeat, RosterResponse, SeatConfigWire, Zone } from '../types.js';

export const DEFENSE_TOTAL = 12;
export const ATTACK_SQUADS = 3;

export interface AllocationView {
  /** Seats currently placed in the squad being edited. */
  readonly seats: readonly Seat[];
  /** `null` when the six seats are a legal 2/3/1 formation. */
  readonly fault: FormationFault | null;
  readonly isComplete: boolean;
  /**
   * Legal enough to **store**, which is less than legal enough to fight.
   *
   * A defense zone saves at any size — empty included — so a player can shuffle
   * champions between two zones and three attack squads without finishing every
   * move in one sitting. `isComplete` is still what a battle needs; this is what
   * the Save button needs. Same distinction the server draws between
   * `validatePlacement` and `validateFormation`, from the same module, so the
   * button and the route cannot disagree about it.
   */
  readonly isStorable: boolean;
  /** Heroes committed to either defense zone, across the whole account. */
  readonly defending: ReadonlySet<string>;
  /** How many of the 27 remain for offense once defense is committed. */
  readonly poolForOffense: number;
  /**
   * The served behaviour for each seated champion, by hero id.
   *
   * **A champion seated in this session is deliberately absent** rather than given
   * a locally invented config. The save omits her `config`, the server resolves
   * her Role default — the one place that table exists — and the refetch brings it
   * back. Anything else here would be the client guessing at the engine.
   */
  readonly behaviour: ReadonlyMap<string, SeatConfigWire>;
  place(hero: string, row: SquadRow, index: number): void;
  remove(hero: string): void;
  clear(): void;
  reset(to: readonly Seat[]): void;
  configure(hero: string, next: SeatConfigWire): void;
}

export function useAllocation(roster: RosterResponse | null, editing: Zone | number): AllocationView {
  const initial = useMemo<readonly Seat[]>(() => {
    if (!roster) return [];
    return typeof editing === 'number'
      ? (roster.assignments.offense.find((o) => o.slot === editing)?.seats ?? [])
      : roster.assignments.defense[editing].seats;
  }, [roster, editing]);

  /**
   * The served config for each champion already seated in this zone.
   *
   * Offense has none by design — the player commands offense, so there is nothing
   * to configure — which is why this is keyed off the same `editing` discriminant
   * rather than fetched separately.
   */
  const initialBehaviour = useMemo<ReadonlyMap<string, SeatConfigWire>>(() => {
    if (!roster || typeof editing === 'number') return new Map();
    return new Map(
      (roster.assignments.defense[editing].seats as readonly ConfiguredSeat[])
        .filter((seat) => seat.config)
        .map((seat) => [seat.heroId, seat.config]),
    );
  }, [roster, editing]);

  const [seats, setSeats] = useState<readonly Seat[]>(initial);
  const [behaviour, setBehaviour] = useState<ReadonlyMap<string, SeatConfigWire>>(initialBehaviour);

  /**
   * **`useState(initial)` reads its argument once, on the first render only.**
   *
   * The screen's first render has `roster === null`, because the roster is
   * fetched — so `initial` is `[]`, and without this the squad stays empty after
   * the data arrives. Every component test passed a roster synchronously and so
   * never saw it; the end-to-end run found it immediately, which is the whole
   * reason that suite exists.
   *
   * **Keyed on the seats' *content*, not their identity.** Identity was the
   * first attempt and it spins forever the moment a parent rebuilds the roster
   * object on each render — which a component legitimately may, and which the
   * hook's own test does. The symptom is not a warning: it is the worker dying
   * with `JavaScript heap out of memory`, several files away from the cause.
   *
   * Content-keyed, a re-created-but-equal roster is a no-op, and edits in
   * progress survive a refetch that returned the same stored squad.
   */
  /**
   * **The served config is part of the signature, not only the seats.** The rule
   * this module opens with is that the response to `PUT` is the truth and replaces
   * the local view rather than merging with it — and a save that changed only a
   * ranking leaves the seats identical, so a seats-only signature would keep
   * showing the submitted value instead of the stored one. They agree in the
   * ordinary case; the case where they do not is the one worth being right about.
   */
  const signature = [
    String(editing),
    initial.map((s) => `${s.row}${s.index}${s.heroId}`).join(','),
    [...initialBehaviour]
      .map(([id, c]) => `${id}:${c.targeting.join('/')}:${c.ranking.join('.')}:${c.allyRule ?? '-'}`)
      .join(','),
  ].join('|');
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (seeded.current === signature) return;
    seeded.current = signature;
    setSeats(initial);
    /**
     * **Re-seeded with the seats, on the same signature.** A refetch after a save
     * is exactly when the server's newly resolved defaults arrive, and a behaviour
     * map that kept its old contents would leave a champion the player just seated
     * looking unconfigured forever.
     */
    setBehaviour(initialBehaviour);
    // `initial` is intentionally NOT a dependency: it is a fresh array whenever
    // the caller rebuilds the roster, and depending on it is the loop above.
    // (`react-hooks/exhaustive-deps` is not installed here, so there is no rule
    // to disable — this note is the record of the deliberate omission.)
  }, [signature]);

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

  const configure = useCallback((heroId: string, next: SeatConfigWire) => {
    setBehaviour((current) => new Map(current).set(heroId, next));
  }, []);

  const fault = useMemo(() => validateFormation(seats), [seats]);
  /* Everything except the count. An unfinished squad is not a broken one. */
  const placementFault = useMemo(() => validatePlacement(seats), [seats]);

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
    isStorable: placementFault === null,
    defending,
    poolForOffense: (roster?.heroes.length ?? 0) - defending.size,
    behaviour,
    place,
    remove,
    clear,
    reset,
    configure,
  };
}
