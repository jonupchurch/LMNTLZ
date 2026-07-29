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
import { and, eq } from 'drizzle-orm';
import { contentVersion } from '@lmntlz/content';
import { engineVersion } from '@lmntlz/sim/rules';
import { createSeed } from '@lmntlz/sim/resolver';
import { db } from '../db/client.js';
import { battles } from '../db/schema/battles.js';
import { squads, squadSeats, squadMemberConfig, type SquadZone } from '../db/schema/squads.js';
import { playerStreaks } from '../db/schema/streaks.js';
import { ambushChance } from '../squads/ambush.js';
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

  const attackerSnapshot: AttackerSnapshot = parseAttackerSnapshot({
    seats: offense.seats.map((s) => ({ row: s.row, index: s.index, heroId: s.heroId })),
  });

  const defenderSnapshot: DefenderSnapshot = parseDefenderSnapshot({
    seats: defense.seats.map((s) => {
      const config = configByHero.get(s.heroId);
      return {
        row: s.row,
        index: s.index,
        heroId: s.heroId,
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

  const inserted = await db()
    .insert(battles)
    .values({
      attackerId,
      defenderId: opponentId,
      defenderIsBot: false,
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
     */
    ambushed: zone === 'hidden',
  };
}
