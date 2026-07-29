/**
 * Roster and squad routes (T014–T016).
 *
 * **`accountId` comes from the verified session on every route here** — see
 * `auth/context.ts`. None of these takes a player id from the body or the path;
 * the scout view in US4 is the one that names another player, and it uses
 * `targetId`.
 *
 * ### One editor for both defense zones
 *
 * `PUT /v1/squads/defense/:zone` takes the zone as a **parameter**, not as two
 * routes. Visible and Hidden differ in exactly two ways — who can see them and
 * what they pay — and in nothing this code touches. Two handlers would be two
 * validators that drift, and the one that drifts is Hidden, because it is the
 * one nobody looks at.
 */

import { Hono } from 'hono';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { apiError } from '../errors.js';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { SQUAD_ZONES, type SquadZone } from '../db/schema/squads.js';
import {
  HeroUnavailableError,
  InvalidSquadError,
  assertAvailableForOffense,
  availableForOffense,
  defenseReadiness,
  isPowerRanking,
  validateSquadShape,
  type SquadShape,
} from './allocation.js';
import { loadSquads, saveDefenseSquad, saveOffenseSquad, type SeatInput } from './repository.js';

export const squadRoutes = new Hono<AuthedEnv>();

squadRoutes.use('/roster', requireSession);
squadRoutes.use('/squads/*', requireSession);

const isZone = (value: string): value is SquadZone => (SQUAD_ZONES as readonly string[]).includes(value);

/**
 * Parse the seat array. **`config` is required on defense and forbidden on
 * offense**, which is the shape difference between the two and the only one.
 */
function parseSeats(body: unknown, kind: 'defense' | 'offense'): SeatInput[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { seats?: unknown }).seats)) {
    throw new InvalidSquadError('wrong-size', 'A `seats` array is required.');
  }

  return ((body as { seats: unknown[] }).seats).map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new InvalidSquadError('wrong-size', `Seat ${i} is not an object.`);
    }
    const seat = raw as Record<string, unknown>;
    const row = seat['row'];
    const index = seat['index'];
    const heroId = seat['heroId'];

    if (typeof row !== 'string' || typeof index !== 'number' || typeof heroId !== 'string') {
      throw new InvalidSquadError('wrong-size', `Seat ${i} needs a row, an index and a heroId.`);
    }

    if (kind === 'offense') {
      // No per-champion config: the player commands offense, so there is
      // nothing to configure. Accepting and ignoring one would be worse than
      // rejecting it — the player would believe it applied.
      return { row: row as SeatInput['row'], index, heroId };
    }

    const config = seat['config'] as Record<string, unknown> | undefined;
    if (!config) {
      throw new InvalidSquadError('wrong-size', `Seat ${i} needs a config on a defense squad.`);
    }

    const targeting = config['targeting'];
    if (!Array.isArray(targeting) || targeting.length !== 2 || targeting.some((t) => typeof t !== 'string')) {
      throw new InvalidSquadError(
        'wrong-size',
        `Seat ${i} needs a targeting pair: a primary rule and a fallback.`,
      );
    }

    const ranking = config['ranking'];
    if (!isPowerRanking(ranking)) {
      // Not a length check. `[0,1,2,3,4,4]` is six entries in range and leaves
      // one power unreachable and another ranked twice.
      throw new InvalidSquadError(
        'wrong-size',
        `Seat ${i}: \`ranking\` must be a permutation of 0-5, each exactly once.`,
      );
    }

    const allyRule = config['allyRule'];
    if (allyRule !== null && allyRule !== undefined && typeof allyRule !== 'string') {
      throw new InvalidSquadError('wrong-size', `Seat ${i}: \`allyRule\` must be a string or null.`);
    }

    return {
      row: row as SeatInput['row'],
      index,
      heroId,
      config: {
        targetPrimary: targeting[0] as string,
        targetFallback: targeting[1] as string,
        allyRule: (allyRule as string | null | undefined) ?? null,
        powerRanking: ranking,
      },
    };
  });
}

const seatsToShape = (id: string, kind: 'defense' | 'offense', seats: readonly SeatInput[]): SquadShape => ({
  id,
  kind,
  seats: seats.map((s) => ({ row: s.row, index: s.index, heroId: s.heroId })),
});

// ---------------------------------------------------------------------------
// T014 — GET /v1/roster
// ---------------------------------------------------------------------------

squadRoutes.get('/roster', async (c) => {
  const { accountId } = requireContext(c);
  const stored = await loadSquads(accountId);
  const roster = getAllHeroes();

  const zoneOf = (zone: SquadZone) => stored.find((s) => s.kind === 'defense' && s.zone === zone);

  const defense = Object.fromEntries(
    SQUAD_ZONES.map((zone) => {
      const squad = zoneOf(zone);
      const readiness = defenseReadiness(zone, squad);
      return [
        zone,
        {
          seats: squad?.seats ?? [],
          holdStreak: squad?.holdStreak ?? 0,
          editedAt: squad?.editedAt ?? null,
          // FR-011: an incomplete zone is a stated state, never a squad that
          // quietly fights a man down.
          canDefend: readiness.canDefend,
          ...(readiness.reason ? { reason: readiness.reason } : {}),
        },
      ];
    }),
  );

  const offense = stored
    .filter((s) => s.kind === 'offense')
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
    .map((s) => ({
      slot: s.slotIndex ?? 0,
      name: s.name ?? null,
      seats: s.seats,
      complete: s.seats.length === 6,
      valid: s.valid ?? true,
    }));

  return c.json({
    heroes: roster,
    assignments: { defense, offense },
    available: {
      // **Every hero, deliberately.** Moving one off an attack squad onto
      // defense is legal — that is what the eviction warning covers.
      forDefense: roster.map((h) => h.id),
      forOffense: availableForOffense(
        roster.map((h) => h.id),
        stored,
      ),
    },
  });
});

// ---------------------------------------------------------------------------
// T015 — PUT /v1/squads/defense/:zone
// ---------------------------------------------------------------------------

squadRoutes.put('/squads/defense/:zone', async (c) => {
  const { accountId } = requireContext(c);
  const zone = c.req.param('zone');
  if (!isZone(zone)) {
    return c.json(apiError('not_found', `There is no "${zone}" zone.`), 404);
  }

  let seats: SeatInput[];
  try {
    seats = parseSeats(await c.req.json().catch(() => null), 'defense');
    validateSquadShape(seatsToShape('pending', 'defense', seats).seats);
  } catch (err) {
    if (err instanceof InvalidSquadError) {
      return c.json(apiError(err.code, err.detail), 422);
    }
    throw err;
  }

  // **A hero may not hold a seat in both zones.** Checked against the OTHER
  // zone only — a hero staying in the zone being saved is the ordinary case.
  const stored = await loadSquads(accountId);
  const other = stored.find((s) => s.kind === 'defense' && s.zone !== zone);
  if (other) {
    const held = new Set(other.seats.map((s) => s.heroId));
    const clash = seats.find((s) => held.has(s.heroId));
    if (clash) {
      return c.json(
        {
          ...apiError('hero_on_other_zone', `${clash.heroId} is already defending your ${other.zone} zone.`),
          heroId: clash.heroId,
          zone: other.zone,
        },
        409,
      );
    }
  }

  const result = await saveDefenseSquad(accountId, zone, seats);

  return c.json({
    holdStreak: result.holdStreak,
    streakReset: result.streakReset,
    // US5 fills this with the reach and firing-profile notes. It is present and
    // empty now so a client written today does not branch on its absence.
    warnings: [],
  });
});

// ---------------------------------------------------------------------------
// T016 — PUT /v1/squads/offense/:slot
// ---------------------------------------------------------------------------

squadRoutes.put('/squads/offense/:slot', async (c) => {
  const { accountId } = requireContext(c);
  const slot = Number(c.req.param('slot'));
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
    return c.json(apiError('not_found', 'Attack squad slots are 0, 1 and 2.'), 404);
  }

  const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;

  let seats: SeatInput[];
  try {
    seats = parseSeats(body, 'offense');
    validateSquadShape(seatsToShape('pending', 'offense', seats).seats);
  } catch (err) {
    if (err instanceof InvalidSquadError) {
      return c.json(apiError(err.code, err.detail), 422);
    }
    throw err;
  }

  for (const seat of seats) getHero(seat.heroId);

  const stored = await loadSquads(accountId);
  try {
    // **Overlap with the other attack squads is not checked, on purpose.**
    // 3 x 6 = 18 seats drawn from 15 heroes, so it is forced.
    assertAvailableForOffense(
      seats.map((s) => s.heroId),
      stored,
    );
  } catch (err) {
    if (err instanceof HeroUnavailableError) {
      return c.json(
        { ...apiError(err.code, err.message), heroId: err.heroId, zone: err.zone },
        409,
      );
    }
    throw err;
  }

  const name = typeof body?.name === 'string' ? body.name : null;
  const result = await saveOffenseSquad(accountId, slot, name, seats);

  return c.json({ slot, name, complete: result.complete, valid: result.complete });
});
