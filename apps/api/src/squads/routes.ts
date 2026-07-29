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
import { asTargetId, requireContext, type AuthedEnv } from '../auth/context.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { SQUAD_ZONES, type SquadZone } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { accounts } from '../db/schema/accounts.js';
import { serializeScoutView } from './scoutSerializer.js';
import { ambushChance, ambushConfig } from './ambush.js';
import { warningsFor } from './warnings.js';
import {
  HeroUnavailableError,
  InvalidSquadError,
  assertAvailableForOffense,
  availableForOffense,
  defenseReadiness,
  evictionImpact,
  isPowerRanking,
  validateSquadShape,
  type SquadShape,
} from './allocation.js';
import {
  evictFromOffense,
  loadSquads,
  saveDefenseSquad,
  saveOffenseSquad,
  type SeatInput,
} from './repository.js';

export const squadRoutes = new Hono<AuthedEnv>();

squadRoutes.use('/roster', requireSession);
squadRoutes.use('/squads/*', requireSession);
squadRoutes.use('/players/*', requireSession);

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

  const [streakRow] = await db()
    .select()
    .from(playerStreaks)
    .where(eq(playerStreaks.accountId, accountId))
    .limit(1);
  const attackStreak = streakRow?.attackStreak ?? 0;

  return c.json({
    heroes: roster,
    assignments: { defense, offense },
    /**
     * **Three streaks, and they are named apart in the payload too** (FR-012).
     * `attackStreak` sits here at the top level because there is exactly one and
     * it belongs to the player; the two `holdStreak`s sit inside their zones
     * because there is one each. A client cannot accidentally read the wrong one
     * without changing which object it reached into.
     */
    streaks: {
      attack: attackStreak,
      hold: { visible: defense['visible']?.holdStreak ?? 0, hidden: defense['hidden']?.holdStreak ?? 0 },
    },
    /**
     * **Served, never compiled in** (FR-017, SC-008). The client renders
     * `chance` and does no arithmetic — if 2% turns out to put nobody into a
     * Hidden battle, the fix is a config change rather than a Steam update that
     * leaves the two builds disagreeing for a week.
     */
    ambush: { chance: ambushChance(attackStreak), ...ambushConfig() },
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

  /**
   * **Eviction on commit (T025).** Anyone newly committed to defense leaves
   * every attack squad containing them, and each of those is marked invalid.
   *
   * After the save rather than before, and in its own transaction: the save is
   * the thing that must not half-apply. If eviction failed here the squads would
   * be stale rather than corrupt, and the next `GET /v1/roster` recomputes
   * `forOffense` from the defense rows regardless — so the player still cannot
   * attack with a defender.
   */
  const evicted = await evictFromOffense(
    accountId,
    seats.map((s) => s.heroId),
  );

  return c.json({
    holdStreak: result.holdStreak,
    streakReset: result.streakReset,
    evictedSquadIds: evicted,
    /**
     * **`warnings` never blocks** (T050, Constitution XVIII). Both of these are
     * taste rather than harm: a reach-1 back seat is a priced decision and a
     * self-defeating ranking is a lever. The save above already succeeded.
     */
    warnings: warningsFor(
      seats.map((s) => ({ row: s.row, index: s.index, heroId: s.heroId })),
      new Map(seats.filter((s) => s.config).map((s) => [s.heroId, s.config!])),
    ),
  });
});

// ---------------------------------------------------------------------------
// T041 — GET /v1/players/:targetId/scout
// ---------------------------------------------------------------------------

/**
 * **The parameter is `targetId`, not `accountId`** — feature 005's convention.
 * This is one of the few routes that legitimately names another player, and the
 * distinct name is what makes that intent visible at the call site rather than
 * something a reviewer has to trace.
 */
squadRoutes.get('/players/:targetId/scout', async (c) => {
  requireContext(c); // scouting requires a session; the caller is not otherwise used
  const targetId = asTargetId(c.req.param('targetId'));

  const [target] = await db()
    .select({ id: accounts.id, username: accounts.username })
    .from(accounts)
    .where(eq(accounts.id, targetId))
    .limit(1);

  if (!target) {
    return c.json(apiError('not_found', 'No such player.'), 404);
  }

  const squads = await loadSquads(targetId);

  return c.json(
    serializeScoutView({
      targetId: target.id,
      username: target.username,
      // Feature 009 owns rating and league. Stated rather than omitted so the
      // shape does not change under clients when it arrives.
      league: 'unranked',
      squads,
    }),
  );
});

// ---------------------------------------------------------------------------
// T024 — POST /v1/squads/defense/:zone/preview-move
// ---------------------------------------------------------------------------

/**
 * **Called before committing, and it commits nothing.**
 *
 * Eviction is the one thing this feature blocks with a confirm, because it is
 * destructive and non-obvious — unlike a self-defeating power ranking, which is
 * surfaced and permitted because reopening a dropdown undoes it.
 *
 * A `POST` rather than a `GET` because it takes a body and is not cacheable;
 * nothing is written.
 */
squadRoutes.post('/squads/defense/:zone/preview-move', async (c) => {
  const { accountId } = requireContext(c);
  const zone = c.req.param('zone');
  if (!isZone(zone)) {
    return c.json(apiError('not_found', `There is no "${zone}" zone.`), 404);
  }

  const body = (await c.req.json().catch(() => null)) as { heroId?: unknown } | null;
  const heroId = body?.heroId;
  if (typeof heroId !== 'string') {
    return c.json(apiError('malformed_request', 'A `heroId` is required.'), 400);
  }

  try {
    getHero(heroId);
  } catch {
    return c.json(apiError('unknown-hero', `There is no champion "${heroId}".`), 422);
  }

  const stored = await loadSquads(accountId);
  const impact = evictionImpact(heroId, stored, getAllHeroes().length);

  const current = stored.find((s) => s.kind === 'defense' && s.zone === zone);

  return c.json({
    heroId,
    // **Never truncated.** Every affected squad, named, in slot order.
    evicts: impact.squads.map((s) => ({
      slot: s.slotIndex ?? 0,
      name: s.name,
      wasComplete: s.wasReady,
      wouldBe: s.remaining,
    })),
    // The sentence no per-squad message conveys: why this keeps happening.
    poolAfter: {
      heroes: impact.poolAfter,
      squads: impact.squadsNeeded,
      seatsNeeded: impact.squadsNeeded * impact.squadSize,
    },
    // FR-014 — the streak cost is stated BEFORE the player commits. Any change
    // to a defense squad's membership changes its canonical form, so a move
    // into a zone that has a streak will always cost it.
    streakAtRisk: current?.holdStreak ?? 0,
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
