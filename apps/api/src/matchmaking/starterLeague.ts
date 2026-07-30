/**
 * The starter league (009 T028, T030–T035 · FR-019–FR-024).
 *
 * > **A new account begins in a league whose entire defender pool is authored bots.
 * > It lasts one week or 3,250 shards earned, whichever comes first, and a player may
 * > leave early at any time. Leaving is permanent.**
 *
 * `09-matchmaking.md` records why it exists, and the reason is worth keeping in front
 * of anyone editing this file: **it replaces the early-progression bonus rather than
 * adding to it.** New players do not need extra shards, they need beatable opponents
 * — and easier opponents produce more victories, which produce more shards anyway. The
 * head start arrives as *difficulty*, in an economy that cannot afford granted
 * currency.
 *
 * ### Two exits are written and two are derived, and the split is the design
 *
 * | Exit | Fires on | Written? |
 * |---|---|---|
 * | Time | 7 days from `created_at` | **no — derived** |
 * | Shards | 3,250 earned, signalled by 010 | yes |
 * | Voluntary | `POST /v1/me/starter/exit` | yes |
 * | Guild | 013, at either door | yes |
 *
 * **Time is derived because a written time exit needs a job to write it**, and a job
 * that fails leaves a player protected past their week — farming an authored pool
 * with nothing to stop them. `accounts.banned_until` already established this shape
 * one file over: *"an expiry in the past simply stops applying, with nothing to run."*
 *
 * The other three are events with no timestamp of their own, so they are recorded when
 * they happen. That also fixes an ordering problem that would otherwise be
 * unanswerable: with `time` derived and checked **last**, a player who crossed 3,250
 * shards on day four is reported as having left on `shards`, not on `time`, forever —
 * because the write is what remembers which door came first.
 *
 * ### The warning, which the design says has been lost three times
 *
 * `StarterExitWarning`'s three fields are typed `true` rather than `boolean`, so the
 * only value that compiles is the one that warns. And `guildDoorConfirm()` is the
 * *only* constructor for a guild confirm, so feature 013 cannot assemble one without
 * the warning even by trying — a shared constant string was the previous answer and
 * three screen regenerations dropped it.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  accounts,
  type StarterExitReason,
} from '../db/schema/accounts.js';
import { STARTER_DAYS, STARTER_INCOME_MULTIPLIER, STARTER_SHARD_TARGET } from './config.js';

const DAY_MS = 86_400_000;

/**
 * Why a player is not in the starter league.
 *
 * **Wider than the four exits on purpose**, and the extra member is not a hedge.
 * `no-authored-pool` says the league itself is not open yet — see `starterLeagueOpen`
 * — which is a different fact from any exit and must not be recorded as one. The
 * database column stays constrained to the four real exits, because *which door a
 * player left by* is an analytics dimension and "the feature was not finished" is not
 * a door.
 */
export type StarterInactiveReason = StarterExitReason | 'no-authored-pool';

export type StarterStatus =
  | { readonly active: true; readonly endsAt: Date }
  | { readonly active: false; readonly reason: StarterInactiveReason };

/**
 * **The starter league is only open while an authored pool exists to fill it.**
 *
 * This is the one thing about Phase 5 that could not be deferred to Phase 7, and it is
 * worth stating why rather than leaving it as a guard.
 *
 * The league offers bots and *nothing else* (FR-019). Bots are authored in Phase 7.
 * So between the two, a starter player's candidate list is **empty** — and an empty
 * candidate list is not a degraded experience, it is a new account that cannot attack
 * anybody at all, which is the entire core loop. The game is deployed; shipping that
 * would break every signup until the bots landed.
 *
 * The alternative was to fall back to the ordinary league pool when the bot pool comes
 * back empty. **That is rejected as exactly the silent failure this project keeps
 * finding**: the starter league would appear to work, every test would pass, and new
 * players would quietly be fed full-kit veterans. A feature that has no pool should
 * say so.
 *
 * So the league answers honestly about not existing yet, the same way `gearScore()`
 * answers `null` rather than `0` for runes that 010 has not built. **When Phase 7
 * seeds the twenty starter bots this switches itself on**, with nothing to remember to
 * flip — which is the property that makes it safe rather than merely correct.
 *
 * Existence, not a count: one indexed row is the whole question, and
 * `accounts_bot_band_idx` is partial on `is_bot` precisely for this.
 */
export async function starterLeagueOpen(): Promise<boolean> {
  const [row] = await db()
    .select({ one: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.isBot, true), eq(accounts.botBand, 'starter')))
    .limit(1);

  return row !== undefined;
}

/**
 * The three fields of the warning, and **all three are literal `true`**.
 *
 * `contracts/matchmaking-api.md` is unusually emphatic here: *"a shared constant
 * STRING is not enough — three screen regenerations have proved a string can be
 * dropped."* Literal types are the strongest available answer. `boolean` would let a
 * caller pass `false` and satisfy the compiler while warning nobody, and the field
 * being *present* is exactly what a regenerated screen loses.
 *
 * The two losses are **different things** and both must be named. *Beginner status*
 * is the bot-only pool — the protection. The *beginner bonus* is the ×1.5 on attack
 * income. A player told only "you'll leave the starter league" has not been told
 * their income drops.
 */
export interface StarterExitWarning {
  /** Beginner **status**: the authored, bot-only opponent pool ends. */
  readonly endsBotOpponents: true;
  /** The beginner **bonus**: the ×1.5 on attack income ends. A different loss. */
  readonly endsIncomeMultiplier: true;
  /** There is no way back in. */
  readonly permanent: true;
}

export const STARTER_EXIT_WARNING: StarterExitWarning = {
  endsBotOpponents: true,
  endsIncomeMultiplier: true,
  permanent: true,
};

/**
 * What `POST /v1/me/starter/exit` must acknowledge, **both of them**.
 *
 * These are the wire names for the two losses above, and the route rejects a body
 * carrying only one. Named as a tuple so the route cannot drift from the contract by
 * checking a count instead of the contents.
 */
export const REQUIRED_ACKNOWLEDGEMENTS = ['bot-opponents-end', 'income-multiplier-ends'] as const;
export type Acknowledgement = (typeof REQUIRED_ACKNOWLEDGEMENTS)[number];

/**
 * Every point at which a player can cross into a guild.
 *
 * **Three doors, for two exits, and the asymmetry is the whole point.** The *exit*
 * fires on accepting an invitation or founding a guild. The *warning* additionally has
 * to appear on **applying**, because a player who applies and is admitted a day later
 * *"would otherwise be graduated by someone else's click, at a moment they were not
 * present for."* The application is where the decision is actually made, so it is
 * where the cost has to be described.
 */
export const GUILD_DOORS = ['invitation', 'application', 'founding'] as const;
export type GuildDoor = (typeof GUILD_DOORS)[number];

/**
 * A confirm feature 013 must show before a guild action.
 *
 * `starterWarning` is a **required** property, never optional. `null` is a permitted
 * *value* — a player already out of the starter league has nothing to be warned about
 * — but it has to be written, so dropping the field is a compile error rather than a
 * silently unwarned player.
 */
export interface GuildDoorConfirm {
  readonly door: GuildDoor;
  /** `null` when founding: there is no guild yet. */
  readonly guildId: string | null;
  readonly starterWarning: StarterExitWarning | null;
}

/**
 * A player's starter status.
 *
 * Order matters, and it is: **written exit, then shards, then time.** Time is last
 * precisely because it is the derived one — checking it first would relabel every
 * recorded shard exit as a time exit the moment the seventh day passed.
 */
export async function starterStatus(accountId: string): Promise<StarterStatus> {
  const [row] = await db()
    .select({
      createdAt: accounts.createdAt,
      exitedAt: accounts.starterExitedAt,
      reason: accounts.starterExitReason,
      isBot: accounts.isBot,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!row) throw new Error(`no such account: ${accountId}`);

  /**
   * **A bot is never in the starter league**, and it is not an edge case worth
   * skipping: bots are the starter league's *opponents*, so a bot that counted as a
   * starter player would be excluded from its own pool by the dormant-defense rule.
   * `voluntary` because it was never in — an authored account did not graduate.
   */
  if (row.isBot) return { active: false, reason: 'voluntary' };

  if (row.exitedAt !== null) {
    // The reason is written with the timestamp; the fallback is defensive only.
    return { active: false, reason: row.reason ?? 'voluntary' };
  }

  const endsAt = new Date(row.createdAt.getTime() + STARTER_DAYS * DAY_MS);
  if (Date.now() >= endsAt.getTime()) return { active: false, reason: 'time' };

  /**
   * **Last, after time, and the order carries information.** An account past its week
   * is reported as `time` — accurate and stable forever. Only an account still inside
   * its week can be told the truer thing: it would be protected, but there is no pool
   * to protect it with.
   */
  if (!(await starterLeagueOpen())) return { active: false, reason: 'no-authored-pool' };

  return { active: true, endsAt };
}

/**
 * Record a starter exit. **Idempotent, and one-way.**
 *
 * The `isNull` guard in the `WHERE` is what makes it both: a second call cannot
 * overwrite the first door with a later one, so *"leaving the guild later does not
 * send them back"* needs no separate rule — there is simply no write that clears the
 * column. Returns the resulting status, which for an already-exited account is the
 * *original* reason rather than the one just attempted.
 */
export async function exitStarter(
  accountId: string,
  reason: Exclude<StarterExitReason, 'time'>,
): Promise<StarterStatus> {
  await db()
    .update(accounts)
    .set({ starterExitedAt: new Date(), starterExitReason: reason })
    .where(and(eq(accounts.id, accountId), isNull(accounts.starterExitedAt)));

  return starterStatus(accountId);
}

/**
 * Exit 4 — **one rule, two doors** (T035 · FR-024).
 *
 * > **No member of a guild is ever in the starter league.**
 *
 * Feature 013 calls *this*, not `exitStarter` with a string, from both doors that
 * actually join a guild: accepting an invitation, and founding one. One function is
 * the "one rule" — two call sites reaching for the same write cannot disagree about
 * what the write is, which two hand-rolled updates eventually would.
 *
 * **Leaving the guild later does not send them back**, and that needs no code: there
 * is no operation anywhere in this module that clears `starter_exited_at`.
 *
 * > **No caller yet.** Feature 013 owns guilds and does not exist.
 */
export async function guildJoined(accountId: string): Promise<StarterStatus> {
  return exitStarter(accountId, 'guild');
}

/**
 * The shards signal from feature 010 (T032).
 *
 * **A push, not a pull**, following `recordPlacement()`: 010 calls in when it credits
 * shards rather than 009 reaching into an economy that does not exist. The push is
 * also what timestamps the crossing, which is what makes the exit-reason ordering
 * above answerable.
 *
 * `totalEarned` is **lifetime earned, never a current balance** — spending must not
 * put a graduated player back in the nursery, and the same reasoning that keeps a
 * shard balance out of the gear score keeps it out of here.
 *
 * > **No caller yet.** Feature 010 owns shard income and does not exist. Until it
 * > does, exit 2 cannot fire, and the practical effect is that a heavy player gets the
 * > full week instead of leaving on day 4.8. Recorded here rather than discovered
 * > later — this is the same shape as `touchActivity()` in `candidates.ts`.
 */
export async function noteShardsEarned(
  accountId: string,
  totalEarned: number,
): Promise<StarterStatus> {
  const status = await starterStatus(accountId);
  if (!status.active) return status;
  if (totalEarned < STARTER_SHARD_TARGET) return status;

  return exitStarter(accountId, 'shards');
}

/**
 * The multiplier on **attack** income (T030 · FR-021).
 *
 * > **Do not oversell this.** 1.5× is the multiplier; ~11% is the help. It exists
 * > because a starter player's defense is dormant, and holds are about 26% of a
 * > typical day — so 1.35× of the 1.5 merely replaces income that was removed. A
 * > typical day goes 388 → 432, which is 1.11×, and `starter.test.ts` pins all three
 * > play levels against the published table so nobody restates it as a 50% head start.
 *
 * Applies to attack income only, and **the daily curve stays on**. A flat 1.5×
 * replacing the curve was considered and rejected: it pays a heavy player 1.37×
 * against a typical player's 1.2×, rewarding exactly the behaviour an authored pool
 * should not encourage.
 */
export async function starterIncomeMultiplier(accountId: string): Promise<number> {
  const status = await starterStatus(accountId);
  return status.active ? STARTER_INCOME_MULTIPLIER : 1;
}

/** The warning payload, or `null` for a player with nothing left to lose (T034). */
export async function starterExitWarning(accountId: string): Promise<StarterExitWarning | null> {
  const status = await starterStatus(accountId);
  return status.active ? STARTER_EXIT_WARNING : null;
}

/**
 * **The only way to build a guild confirm** (T033, T034).
 *
 * Feature 013 calls this and renders what comes back. It fetches the warning itself,
 * so there is no version of the call that produces an unwarned confirm — which is a
 * stronger guarantee than a required field, because a required field can still be
 * populated with the wrong thing by a caller in a hurry.
 *
 * Every door goes through here, including `founding`: `09-matchmaking.md` asks for the
 * cost to be stated *"at every point a player could cross the line, in either
 * direction"*, and founding a guild crosses it just as accepting an invitation does.
 */
export async function guildDoorConfirm(
  accountId: string,
  door: GuildDoor,
  guildId: string | null,
): Promise<GuildDoorConfirm> {
  return {
    door,
    guildId,
    starterWarning: await starterExitWarning(accountId),
  };
}
