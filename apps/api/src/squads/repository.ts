/**
 * Reading and writing squads.
 *
 * **Every write is one transaction and replaces the whole squad.** A squad is
 * six seats that only make sense together — a partial write leaves a formation
 * that is not 2/3/1, which every reader downstream assumes it can rely on. So
 * seats are deleted and reinserted rather than diffed: the diff is more code, it
 * is the code that gets the edge cases wrong, and there are six rows.
 *
 * The streak decision happens **inside** the transaction, against the rows as
 * they are at that moment. Computing it outside would race a second editor tab.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  SQUAD_SIZE,
  squadMemberConfig,
  squadSeats,
  squads,
  type SquadZone,
} from '../db/schema/squads.js';
import { streakResets, type CanonicalSeat, type SeatConfig } from './canonical.js';
import { type Seat, type SquadShape } from './allocation.js';

export interface SeatInput {
  readonly row: 'front' | 'middle' | 'back';
  readonly index: number;
  readonly heroId: string;
  /** Defense only. Absent on offense — the player commands offense. */
  readonly config?: SeatConfig;
}

export interface StoredSquad extends SquadShape {
  readonly holdStreak: number;
  readonly editedAt: Date;
  readonly valid: boolean | null;
  readonly configs: ReadonlyMap<string, SeatConfig>;
}

/** Every squad an account owns, both kinds, seats and config included. */
export async function loadSquads(accountId: string): Promise<StoredSquad[]> {
  const rows = await db().select().from(squads).where(eq(squads.accountId, accountId));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [seatRows, configRows] = await Promise.all([
    db().select().from(squadSeats).where(inArray(squadSeats.squadId, ids)),
    db().select().from(squadMemberConfig).where(inArray(squadMemberConfig.squadId, ids)),
  ]);

  return rows.map((row) => {
    const seats: Seat[] = seatRows
      .filter((s) => s.squadId === row.id)
      .map((s) => ({ row: s.row, index: s.index, heroId: s.heroId }));

    const configs = new Map<string, SeatConfig>(
      configRows
        .filter((c) => c.squadId === row.id)
        .map((c) => [
          c.heroId,
          {
            targetPrimary: c.targetPrimary,
            targetFallback: c.targetFallback,
            allyRule: c.allyRule,
            powerRanking: c.powerRanking.split('.').map(Number),
          },
        ]),
    );

    return {
      id: row.id,
      kind: row.kind,
      zone: row.zone ?? undefined,
      slotIndex: row.slotIndex ?? undefined,
      name: row.name ?? undefined,
      seats,
      holdStreak: row.holdStreak,
      editedAt: row.editedAt,
      valid: row.valid,
      configs,
    };
  });
}

/** The canonical view of a stored squad — seats joined to their config. */
export function canonicalSeatsOf(squad: StoredSquad): CanonicalSeat[] {
  return squad.seats.map((seat) => ({
    row: seat.row,
    index: seat.index,
    heroId: seat.heroId,
    config: squad.configs.get(seat.heroId) ?? {
      targetPrimary: '',
      targetFallback: '',
      allyRule: null,
      powerRanking: [],
    },
  }));
}

export interface SaveDefenseResult {
  readonly squadId: string;
  readonly holdStreak: number;
  readonly streakReset: boolean;
}

/**
 * Replace a defense zone.
 *
 * **The streak comparison happens here, inside the transaction**, between the
 * rows as they exist right now and the rows about to replace them. Outside, two
 * editor tabs saving at once would each compare against a state neither ends up
 * in.
 */
export async function saveDefenseSquad(
  accountId: string,
  zone: SquadZone,
  seats: readonly SeatInput[],
): Promise<SaveDefenseResult> {
  return db().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(squads)
      .where(and(eq(squads.accountId, accountId), eq(squads.kind, 'defense'), eq(squads.zone, zone)))
      .limit(1);

    const next: CanonicalSeat[] = seats.map((s) => ({
      row: s.row,
      index: s.index,
      heroId: s.heroId,
      config: s.config ?? {
        targetPrimary: '',
        targetFallback: '',
        allyRule: null,
        powerRanking: [],
      },
    }));

    let squadId: string;
    let previous: CanonicalSeat[] = [];
    let streak = 0;

    if (existing) {
      squadId = existing.id;
      streak = existing.holdStreak;

      const [oldSeats, oldConfigs] = await Promise.all([
        tx.select().from(squadSeats).where(eq(squadSeats.squadId, squadId)),
        tx.select().from(squadMemberConfig).where(eq(squadMemberConfig.squadId, squadId)),
      ]);
      const byHero = new Map(oldConfigs.map((c) => [c.heroId, c]));
      previous = oldSeats.map((s) => {
        const c = byHero.get(s.heroId);
        return {
          row: s.row,
          index: s.index,
          heroId: s.heroId,
          config: {
            targetPrimary: c?.targetPrimary ?? '',
            targetFallback: c?.targetFallback ?? '',
            allyRule: c?.allyRule ?? null,
            powerRanking: c?.powerRanking.split('.').map(Number) ?? [],
          },
        };
      });

      await tx.delete(squadSeats).where(eq(squadSeats.squadId, squadId));
      await tx.delete(squadMemberConfig).where(eq(squadMemberConfig.squadId, squadId));
    } else {
      // A zone that has never been saved has no streak to lose. `previous` stays
      // empty, so `streakResets` is true and the reset is a no-op from 0.
      const [created] = await tx
        .insert(squads)
        .values({ accountId, kind: 'defense', zone, holdStreak: 0 })
        .returning({ id: squads.id });
      squadId = created!.id;
    }

    const reset = streakResets(previous, next);

    /**
     * **Guarded, because a defense zone can now be saved empty.**
     *
     * `INSERT ... VALUES ()` with nothing in it is not a query, and the driver
     * raises rather than inserting zero rows — so clearing a zone returned a
     * `500` while every earlier step had already succeeded. It was unreachable
     * until the size rule moved out of the save path; it is the ordinary way to
     * empty a zone now.
     */
    if (seats.length > 0) {
      await tx.insert(squadSeats).values(
        seats.map((s) => ({ squadId, row: s.row, index: s.index, heroId: s.heroId })),
      );
    }

    const withConfig = seats.filter((s) => s.config);
    if (withConfig.length > 0) {
      await tx.insert(squadMemberConfig).values(
        withConfig.map((s) => ({
          squadId,
          heroId: s.heroId,
          targetPrimary: s.config!.targetPrimary,
          targetFallback: s.config!.targetFallback,
          allyRule: s.config!.allyRule,
          powerRanking: s.config!.powerRanking.join('.'),
        })),
      );
    }

    const holdStreak = reset ? 0 : streak;
    await tx
      .update(squads)
      .set({ holdStreak, editedAt: new Date() })
      .where(eq(squads.id, squadId));

    return { squadId, holdStreak, streakReset: reset };
  });
}

/** Replace an offense slot. No config — the player commands offense. */
export async function saveOffenseSquad(
  accountId: string,
  slotIndex: number,
  name: string | null,
  seats: readonly SeatInput[],
): Promise<{ squadId: string; complete: boolean }> {
  return db().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(squads)
      .where(
        and(
          eq(squads.accountId, accountId),
          eq(squads.kind, 'offense'),
          eq(squads.slotIndex, slotIndex),
        ),
      )
      .limit(1);

    let squadId: string;
    if (existing) {
      squadId = existing.id;
      await tx.delete(squadSeats).where(eq(squadSeats.squadId, squadId));
    } else {
      const [created] = await tx
        .insert(squads)
        .values({ accountId, kind: 'offense', slotIndex, name, valid: true })
        .returning({ id: squads.id });
      squadId = created!.id;
    }

    await tx.insert(squadSeats).values(
      seats.map((s) => ({ squadId, row: s.row, index: s.index, heroId: s.heroId })),
    );

    const complete = seats.length === SQUAD_SIZE;
    await tx
      .update(squads)
      .set({ name, valid: complete, editedAt: new Date() })
      .where(eq(squads.id, squadId));

    return { squadId, complete };
  });
}

/**
 * **Eviction: remove a hero from every offense squad and mark each invalid.**
 *
 * One statement for the seats and one for the flags, so there is no loop that
 * can stop halfway. `valid = false` is a stored fact rather than a derived view,
 * because the player needs to see *which* squads a defensive change broke — a
 * squad that is merely incomplete looks the same as one they never finished.
 */
export async function evictFromOffense(accountId: string, heroIds: readonly string[]): Promise<string[]> {
  /* Nobody committed, nobody evicted — and `inArray(col, [])` is not a
     predicate the driver will build. This guard predates 019 and was dead
     until then; clearing a zone is the first call that reaches it. */
  if (heroIds.length === 0) return [];

  return db().transaction(async (tx) => {
    const offense = await tx
      .select({ id: squads.id })
      .from(squads)
      .where(and(eq(squads.accountId, accountId), eq(squads.kind, 'offense')));
    if (offense.length === 0) return [];

    const ids = offense.map((o) => o.id);
    const hit = await tx
      .select({ squadId: squadSeats.squadId })
      .from(squadSeats)
      .where(and(inArray(squadSeats.squadId, ids), inArray(squadSeats.heroId, [...heroIds])));

    const affected = [...new Set(hit.map((h) => h.squadId))];
    if (affected.length === 0) return [];

    await tx
      .delete(squadSeats)
      .where(and(inArray(squadSeats.squadId, affected), inArray(squadSeats.heroId, [...heroIds])));

    await tx.update(squads).set({ valid: false }).where(inArray(squads.id, affected));

    return affected;
  });
}
