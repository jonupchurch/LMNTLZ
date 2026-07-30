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
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { SQUAD_ZONES, type SquadZone } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { accounts } from '../db/schema/accounts.js';
import { playerRatings } from '../db/schema/ratings.js';
import { STARTER_GRANT_SCORE, leagueOf } from '../matchmaking/league.js';
import { serializeScoutView } from './scoutSerializer.js';
import { ambushChance, ambushConfig } from './ambush.js';
import { warningsFor } from './warnings.js';
import { needsAllyRule } from '@lmntlz/sim/ai';
import {
  HeroUnavailableError,
  InvalidSquadError,
  assertAvailableForOffense,
  availableForOffense,
  defenseReadiness,
  evictionImpact,
  isPowerRanking,
  isTargetRule,
  resolvedSeatConfig,
  targetRuleMenu,
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
import { touchActivity } from '../matchmaking/candidates.js';

export const squadRoutes = new Hono<AuthedEnv>();

squadRoutes.use('/roster', requireSession);
squadRoutes.use('/squads/*', requireSession);
squadRoutes.use('/players/*', requireSession);

const isZone = (value: string): value is SquadZone => (SQUAD_ZONES as readonly string[]).includes(value);

/**
 * Parse the seat array. **`config` is optional on defense and forbidden on
 * offense**, which is the shape difference between the two and the only one.
 *
 * ### Why optional rather than required
 *
 * It used to be required, and that made the builder impossible to finish. The
 * role-default table is **server-only** — `allocation.ts` says why: shipping it
 * would hand every player the exact ranking the engine plays against them — so a
 * client seating a champion for the first time has no config to send and no way
 * to derive one. Requiring the field meant the only legal save was one that
 * invented a configuration, which is worse than the default in every case.
 *
 * **Absent means "the Role default", stated once and resolved server-side** — the
 * same promise T049/FR-023 already makes about a squad saved without touching a
 * control. It deliberately does *not* mean "keep whatever is stored": this
 * endpoint replaces a whole squad, and a per-field merge is how a player ends up
 * with a configuration nobody chose.
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
      // Resolved to the champion's Role default below, once, where the squad is
      // saved — so the stored row and the streak hash both hold a real config
      // rather than the empty one `repository.ts` falls back to.
      return { row: row as SeatInput['row'], index, heroId };
    }

    const targeting = config['targeting'];
    /**
     * **Checked against the rules the engine actually has, not merely that they
     * are strings.** An unknown rule saved here is a squad `battle/snapshot.ts`
     * refuses to parse — so the failure landed on whoever attacked this player,
     * about a value this player supplied. Same predicate, both boundaries.
     */
    if (!Array.isArray(targeting) || targeting.length !== 2 || !targeting.every(isTargetRule)) {
      throw new InvalidSquadError(
        'wrong-size',
        `Seat ${i} needs a targeting pair of known rules: a primary and a fallback.`,
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
    if (allyRule !== null && allyRule !== undefined && !isTargetRule(allyRule)) {
      throw new InvalidSquadError(
        'wrong-size',
        `Seat ${i}: \`allyRule\` must be a known rule, or null.`,
      );
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

  /**
   * **Each seated champion's configuration, resolved** (T049, FR-023).
   *
   * The editor cannot function without this and cannot compute it: the
   * role-default table is server-only on purpose. So the seat arrives carrying
   * either the player's own stored choice or the Role default that is already
   * being played on their behalf — the same value either way, which is the point.
   * A player who never opened the controls sees what the engine is doing rather
   * than a set of empty dropdowns.
   *
   * **Only seated champions.** Resolving the other twenty-one would publish the
   * role-default table one champion at a time, which is the thing the server-only
   * import exists to prevent.
   */
  const seatsWithConfig = (squad: (typeof stored)[number] | undefined) =>
    (squad?.seats ?? []).map((seat) => {
      const config = resolvedSeatConfig(seat.heroId, squad?.configs.get(seat.heroId));
      return {
        ...seat,
        config: {
          targeting: [config.targetPrimary, config.targetFallback],
          ranking: config.powerRanking,
          allyRule: config.allyRule,
        },
      };
    });

  const defense = Object.fromEntries(
    SQUAD_ZONES.map((zone) => {
      const squad = zoneOf(zone);
      const readiness = defenseReadiness(zone, squad);
      return [
        zone,
        {
          seats: seatsWithConfig(squad),
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
    /**
     * **The two menus, served** (Constitution XII).
     *
     * The client holds no rule list of its own — it cannot, since
     * `@lmntlz/sim/ai` is unreachable from it by a purity test, and it should not,
     * since a Steam build compiling the menu in would disagree with the browser
     * for however long a patch takes. `ally` is the same list: the ally menu
     * discriminates *better* than the enemy one, not differently.
     *
     * `needsAllyRule` names the champions who own a friendly power, because the
     * third control is offered only to them (FR-004) — and the predicate for that
     * is also server-side.
     */
    rules: {
      target: targetRuleMenu(),
      ally: targetRuleMenu(),
      needsAllyRule: roster.filter((h) => needsAllyRule(h)).map((h) => h.id),
    },
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
    /**
     * **Materialised here rather than left to the repository's fallback.** That
     * fallback is empty strings and an empty ranking — enough to store a row, and
     * enough to make the streak hash of a defaulted squad differ from the hash of
     * the *same* squad saved again with its defaults spelled out. A player would
     * lose a hold streak by pressing Save twice.
     */
    seats = seats.map((seat) =>
      seat.config ? seat : { ...seat, config: resolvedSeatConfig(seat.heroId) },
    );
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

  /**
   * **Editing a defense squad is activity** (009 `candidates.ts`).
   *
   * The pool of defenders anybody can be offered requires activity inside thirty
   * days, and `touchActivity()` shipped with 009 with **no caller** — so
   * eligibility fell back to `accounts.created_at` and every account would have
   * quietly dropped out of every pool a month after signing up. This is one of the
   * two places it belongs; battle settlement is the other.
   *
   * **Awaited, and its failure swallowed** — which is not the same as fire-and-
   * forget. A floating promise is the obvious shape here and it is wrong on this
   * platform: the function is torn down when the response returns, so an unawaited
   * upsert may simply never run, and nothing would say so. Awaiting costs one
   * round trip; catching is what keeps a stamp failure from reporting a saved
   * squad as unsaved.
   */
  try {
    await touchActivity(accountId);
  } catch (err) {
    console.warn(`[squads] could not stamp activity for ${accountId}: ${String(err)}`);
  }

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

  /**
   * **The league is real now that 009 exists.** It was `'unranked'` for one
   * feature — stated rather than omitted so the shape would not change under
   * clients — and this is that placeholder coming out.
   *
   * `coalesce` to the starter grant for the same reason `candidates.ts` does it:
   * pre-010 nobody has a gear score, and an inner join on the standing row would
   * make every scout look up an unranked player forever.
   *
   * A league is not a disclosure question. Matchmaking offers same-league
   * defenders, so a player who can see this candidate already knows their band.
   */
  const [target] = await db()
    .select({
      id: accounts.id,
      username: accounts.username,
      gearScore: sql<number>`coalesce(${playerRatings.gearScore}, ${STARTER_GRANT_SCORE})`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
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
      league: leagueOf(Number(target.gearScore)),
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
