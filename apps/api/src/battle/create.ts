/**
 * Starting a battle (007 T018–T019).
 *
 * ### The defender is frozen, not referenced
 *
 * FR-001. Both squads are copied into the battle row at creation and nothing
 * downstream may consult the live tables — `act.ts` reads the snapshot and has
 * no route to anything else. A defender who edits mid-battle changes their *next*
 * fight, never the one in progress.
 *
 * That is not only fairness. Asynchronous PvP means the defender is asleep; a
 * battle that read the live squad would resolve differently depending on when
 * each request happened to arrive, and the same log would replay into a
 * different battle tomorrow.
 *
 * ### The zone is decided here and cannot be asked for
 *
 * The Visible squad is the only one anybody can *choose* to attack. A Hidden
 * battle happens only by ambush, rolled server-side against the displayed
 * chance — so `zone` is **absent from the request body**, and the enforcement is
 * that absence. There is no field to validate, no flag to forget, and no
 * privileged value a client could discover.
 */

import { randomInt } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { contentVersion } from '@lmntlz/content';
import { SQUAD_SIZE, engineVersion } from '@lmntlz/sim/rules';
import { createSeed } from '@lmntlz/sim/resolver';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { battles } from '../db/schema/battles.js';
import { playerRatings, STARTING_RATING } from '../db/schema/ratings.js';
import {
  SQUAD_ZONES,
  squads,
  squadSeats,
  squadMemberConfig,
  type SquadZone,
} from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { ambushChance, wasAmbushed } from '../squads/ambush.js';
import { runeLoadouts } from '../progression/read.js';
import { STARTER_GRANT_SCORE, leagueOf } from '../matchmaking/league.js';
import { buildInitialState } from './board.js';
import { openingPacket } from './packet.js';
import { encodeSeed } from './seedStore.js';
import {
  configsOf,
  parseAttackerSnapshot,
  parseDefenderSnapshot,
  type AttackerSnapshot,
  type DefenderSnapshot,
} from './snapshot.js';
import type { ActionPacket } from './idempotency.js';

export type CreateFailure =
  | 'no-attack-squad'
  | 'attack-squad-invalid'
  | 'defense-incomplete'
  | 'opponent-undefended'
  | 'opponent-is-self';

export class CannotStartBattleError extends Error {
  readonly reason: CreateFailure;

  constructor(reason: CreateFailure, message: string) {
    super(message);
    this.name = 'CannotStartBattleError';
    this.reason = reason;
  }
}

/**
 * A battle is already open (T043–T044).
 *
 * ### One at a time, and the reason is an exploit rather than tidiness
 *
 * Several open battles lets a player start against many opponents, look at how
 * each is going, and abandon the ones going badly. That turns the attack-income
 * tiers and the ambush counter — both of which reward *consecutive wins* — into
 * something farmed by selection rather than earned by playing well. The streak
 * would measure which battles somebody chose to finish.
 *
 * **Carrying the open battle's id means "resume" needs no separate concept.**
 * The client that gets this already knows where to go, so there is no
 * `GET /battles/current` to build, keep consistent, or forget to call.
 */
export class BattleAlreadyOpenError extends Error {
  readonly reason = 'battle-already-open';
  readonly openBattleId: string;

  constructor(openBattleId: string) {
    super('You already have a battle open. Finish or abandon it before starting another.');
    this.name = 'BattleAlreadyOpenError';
    this.openBattleId = openBattleId;
  }
}

/** The caller's unconcluded battle, if there is one. */
export async function openBattleFor(accountId: string): Promise<string | null> {
  const rows = await db()
    .select({ id: battles.id })
    .from(battles)
    .where(and(eq(battles.attackerId, accountId), sql`${battles.concludedAt} is null`))
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * **The roll, isolated from where the entropy comes from.**
 *
 * `roll` is a whole number in `[0, 100)`. Injected rather than drawn inside so
 * the boundary is testable at exactly 0, at `chance - 1`, at `chance` and at 99
 * — a `>=`/`>` slip here shifts every player's ambush rate by one percentage
 * point and nothing about the game would look wrong.
 *
 * **Not drawn from the battle's own seed.** The zone decides *which squad gets
 * snapshotted*, so it is settled before the battle exists; and consuming index 0
 * for it would put the ambush roll inside the draw ledger a replay re-derives,
 * making the battle's first recorded draw mean something other than a turn.
 */
export function decideZone(attackStreak: number, roll: number): SquadZone {
  return roll < ambushChance(attackStreak) ? 'hidden' : 'visible';
}

export interface CreatedBattle {
  readonly battleId: string;
  readonly zone: SquadZone;
  /** Always 0. The opening packet is re-derived, never written as a row. */
  readonly sequence: number;
  readonly packet: ActionPacket;
  readonly ambushed: boolean;
}

/** One squad's seats, joined to its per-hero configuration. */
async function loadSquadRow(
  accountId: string,
  where: 'defense' | 'offense',
  key: { readonly zone?: SquadZone; readonly slotIndex?: number },
) {
  const rows = await db()
    .select()
    .from(squads)
    .where(
      and(
        eq(squads.accountId, accountId),
        eq(squads.kind, where),
        where === 'defense'
          ? eq(squads.zone, key.zone!)
          : eq(squads.slotIndex, key.slotIndex!),
      ),
    )
    .limit(1);

  const squad = rows[0];
  if (!squad) return null;

  const [seats, configs] = await Promise.all([
    db().select().from(squadSeats).where(eq(squadSeats.squadId, squad.id)),
    db().select().from(squadMemberConfig).where(eq(squadMemberConfig.squadId, squad.id)),
  ]);

  return { squad, seats, configs };
}

/**
 * Snapshot both squads, mint a seed, stamp the versions, and fold the opening.
 *
 * **The opening packet is returned but not stored.** A battle does not begin
 * with the player acting — turn order may put several defenders first — and
 * those turns are a pure function of `(seed, snapshots)`. Writing them as a row
 * would store something derivable and leave action 0 with two meanings. `act.ts`
 * re-folds them on every request, which is why this and that must call the same
 * `openingPacket`.
 */
export async function createBattle(
  attackerId: string,
  opponentId: string,
  attackSquadSlot: number,
  now: Date = new Date(),
): Promise<CreatedBattle> {
  if (attackerId === opponentId) {
    throw new CannotStartBattleError('opponent-is-self', 'You cannot attack your own defense.');
  }

  /**
   * **Checked first, before any squad is read or any seed is minted.** A
   * refusal that had already done that work would be slower for no reason, and
   * the partial-index on `(attacker_id) WHERE concluded_at IS NULL` makes this
   * the cheapest question in the function.
   */
  const alreadyOpen = await openBattleFor(attackerId);
  if (alreadyOpen) throw new BattleAlreadyOpenError(alreadyOpen);

  const offense = await loadSquadRow(attackerId, 'offense', { slotIndex: attackSquadSlot });
  if (!offense) {
    throw new CannotStartBattleError(
      'no-attack-squad',
      `You have no attack squad in slot ${attackSquadSlot}.`,
    );
  }

  /**
   * **`valid === false` is refused; `null` is not.** Feature 006 marks a squad
   * invalid when a hero it holds was moved to defense, and fighting with five
   * heroes is not a fight. `null` means never evaluated, which is the state a
   * freshly saved squad is in.
   */
  if (offense.squad.valid === false) {
    throw new CannotStartBattleError(
      'attack-squad-invalid',
      'That attack squad is invalid — a hero in it has been moved to defense.',
    );
  }

  /**
   * **You cannot attack until both your zones can defend.**
   *
   * A defense zone is storable at any size, so a player can reorganise across
   * two zones and three attack squads without completing every move in one
   * sitting. This is the price of that: the shuffle is free, going to war on
   * the back of it is not.
   *
   * It is a rule about fairness rather than about tidiness. PvP here is
   * asynchronous — you attack a stored snapshot — so a player who kept an empty
   * Hidden zone would be taking Hidden-sized rewards from other people while
   * offering nothing back, and would be permanently un-ambushable, which is the
   * one mechanism that puts anybody into a Hidden battle at all.
   *
   * **Checked on the server, not by hiding a button.** The client greys out
   * `FIND BATTLE` and says why, but that is a courtesy; this is the rule.
   */
  const zones = await Promise.all(
    SQUAD_ZONES.map((zone) => loadSquadRow(attackerId, 'defense', { zone })),
  );
  const short = zones.findIndex((z) => (z?.seats.length ?? 0) !== SQUAD_SIZE);
  if (short !== -1) {
    const zone = SQUAD_ZONES[short]!;
    const seated = zones[short]?.seats.length ?? 0;
    throw new CannotStartBattleError(
      'defense-incomplete',
      `Your ${zone} zone has ${seated} of ${SQUAD_SIZE} champions. Both zones must be able to defend before you can attack.`,
    );
  }

  const streakRows = await db()
    .select({ attackStreak: playerStreaks.attackStreak })
    .from(playerStreaks)
    .where(eq(playerStreaks.accountId, attackerId))
    .limit(1);

  const attackStreak = streakRows[0]?.attackStreak ?? 0;
  const zone = decideZone(attackStreak, randomInt(0, 100));

  const defense = await loadSquadRow(opponentId, 'defense', { zone });
  if (!defense) {
    throw new CannotStartBattleError(
      'opponent-undefended',
      'That player has no squad defending this zone.',
    );
  }

  const configByHero = new Map(defense.configs.map((c) => [c.heroId, c]));

  /**
   * **Both sides' runes, frozen into the battle** (019).
   *
   * Until now `statMods` was `{}` for every hero in every battle ever fought, so
   * a completed 650-shard rune changed nothing in combat — the whole progression
   * system was inert at the only place it was supposed to matter. This is the
   * line that connects it.
   *
   * **Read once, here, and stored.** Not looked up at resolution time: the
   * defender is asleep, so a battle that consulted live runes would resolve
   * differently depending on when each request arrived, and the same log would
   * replay into a different battle tomorrow. Same reason the squads themselves
   * are snapshotted (FR-001, Constitution XVI).
   *
   * Two queries rather than one per hero — `runeLoadouts` returns the whole
   * account keyed by hero.
   */
  const [attackerRunes, defenderRunes] = await Promise.all([
    runeLoadouts(attackerId),
    runeLoadouts(opponentId),
  ]);

  const attackerSnapshot: AttackerSnapshot = parseAttackerSnapshot({
    seats: offense.seats.map((s) => ({
      row: s.row,
      index: s.index,
      heroId: s.heroId,
      runes: attackerRunes.get(s.heroId),
    })),
  });

  const defenderSnapshot: DefenderSnapshot = parseDefenderSnapshot({
    seats: defense.seats.map((s) => {
      const config = configByHero.get(s.heroId);
      return {
        row: s.row,
        index: s.index,
        heroId: s.heroId,
        runes: defenderRunes.get(s.heroId),
        config: {
          targeting: [config?.targetPrimary, config?.targetFallback],
          ranking: config?.powerRanking.split('.').map(Number),
          ...(config?.allyRule ? { allyRule: config.allyRule } : {}),
        },
      };
    }),
  });

  const seed = createSeed();
  const versions = { engineVersion: engineVersion(), contentVersion: contentVersion() };

  /**
   * **Whether the defender is a bot, and both sides' standing, as they are right now
   * (009 T055).**
   *
   * ### `defenderIsBot` was hard-coded `false`, and that column can never be corrected
   *
   * `battles.defender_is_bot` exists because — in its own words — *"bot battles must be
   * excludable from every aggregate"*, and until bots were accounts there were none, so
   * `false` was true. Phase 7 made twenty of them real. Every battle against a bot would
   * have been recorded as a battle against a player, in a table Constitution XVI makes
   * permanent, and the first balance question asked of it would have got a wrong answer
   * that looked completely reasonable. 008's `commitments.test.ts` already measured how
   * much this matters: the Visible hold rate is **40% human-only and 60% with bots
   * counted**.
   *
   * ### The leagues and ratings likewise
   *
   * `record.ts` wrote `null` into all four of `battle_records`' league and rating columns
   * because feature 009 had not shipped. It has. These are captured here, at creation,
   * because that is when the matchmaking decision was made — see the note on the columns.
   *
   * One query for both sides, and a LEFT JOIN because pre-010 a standing row may not
   * exist: an INNER JOIN would return no row and the battle would refuse to start, which
   * is the kind of failure this project has already met once in `candidates()`.
   */
  const standings = await db()
    .select({
      id: accounts.id,
      isBot: accounts.isBot,
      gearScore: sql<number>`coalesce(${playerRatings.gearScore}, ${STARTER_GRANT_SCORE})`,
      rating: sql<number>`coalesce(${playerRatings.rating}, ${STARTING_RATING})`,
    })
    .from(accounts)
    .leftJoin(playerRatings, eq(playerRatings.accountId, accounts.id))
    .where(inArray(accounts.id, [attackerId, opponentId]));

  const byId = new Map(standings.map((r) => [r.id, r]));
  const attackerStanding = byId.get(attackerId);
  const defenderStanding = byId.get(opponentId);

  const inserted = await db()
    .insert(battles)
    .values({
      attackerId,
      defenderId: opponentId,
      // Read from the row. `false` was correct only while no bot existed.
      defenderIsBot: defenderStanding?.isBot ?? false,
      attackerLeague: attackerStanding ? leagueOf(Number(attackerStanding.gearScore)) : null,
      defenderLeague: defenderStanding ? leagueOf(Number(defenderStanding.gearScore)) : null,
      attackerRating: attackerStanding ? Number(attackerStanding.rating) : null,
      defenderRating: defenderStanding ? Number(defenderStanding.rating) : null,
      zone,
      seed: encodeSeed(seed),
      engineVersion: versions.engineVersion,
      contentVersion: versions.contentVersion,
      buildSha: process.env['VERCEL_GIT_COMMIT_SHA'] ?? null,
      attackerSquad: attackerSnapshot,
      defenderSnapshot,
      startedAt: now,
    })
    .returning({ id: battles.id });

  const battleId = inserted[0]!.id;

  const state = buildInitialState(attackerSnapshot.seats, defenderSnapshot.seats, versions);
  const opening = openingPacket(seed, state, 0n, configsOf(defenderSnapshot));

  return {
    battleId,
    zone,
    sequence: 0,
    packet: opening.packet,
    /**
     * **Reported, because the player is owed the reason.** The ambush chance is
     * always displayed, so a Hidden battle arriving unannounced would read as a
     * bug in the one part of the design that depends on players trusting a
     * number they cannot verify.
     *
     * `GET /battles/:battleId` reports it from the same helper — the resume path
     * used to hardcode `false`, so reloading once erased the only announcement a
     * player ever got.
     */
    ambushed: wasAmbushed(zone),
  };
}
