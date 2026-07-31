/**
 * The wire shapes of `GET /v1/me/battles` and `GET /v1/replays/:battleId`,
 * plus the two derivations the screens are allowed to make (018 US3).
 *
 * ### What the stored log actually carries, and what it therefore cannot show
 *
 * A replay is `{ battleId, engineVersion, contentVersion, events, conclusion }`
 * and **nothing else** — `apps/api/src/replays/record.ts` assembles it from the
 * opening fold plus every stored packet. There is no `BattleState` in it, no
 * roster, no `maxHp`, and no `heroId` anywhere: an event names its actor by
 * *seat* (`a-front-0`), because `instanceIdOf()` mints ids from side and seat
 * and deliberately not from the hero sitting in one.
 *
 * Two consequences, and both are the reason this file exists rather than the
 * viewer reaching for `BattleState`:
 *
 * 1. **A board cannot be reconstructed.** HP bars need `maxHp`; names need the
 *    roster. Neither is in the log, so the viewer shows what *is*: the sequence
 *    of turns, by seat, with the outcome the server recorded.
 * 2. **The log names no champion, so a replay reveals no composition.** That is
 *    a Constitution XVII property the current shape has for free, and it is
 *    worth knowing before anyone proposes putting the opening state in the log
 *    to get the board back — see `README.md` in this directory.
 *
 * Nothing here derives a rule. Damage is read, never computed; a death is read
 * from `outcome.deaths`, never inferred from arithmetic. That is what makes
 * playback verbatim rather than a second simulation (FR-014).
 */

import { SQUAD_SIZE, type SquadRow } from '@lmntlz/sim/rules';
import type { Conclusion } from '@lmntlz/sim/rules';
import type { TurnEvent } from '../battle/types.js';

export type { TurnEvent };

/** Which side of the battle the signed-in player was on. */
export type BattleRole = 'attacker' | 'defender';

export interface BattleListEntry {
  readonly battleId: string;
  readonly concludedAt: string;
  readonly role: BattleRole;
  readonly opponent: {
    readonly id: string | null;
    readonly username: string | null;
    readonly isBot: boolean;
  };
  readonly zone: string;
  readonly outcome: 'win' | 'loss';
  readonly turnCount: number;
  /**
   * **The server's answer, and the only input to the WATCH control** (FR-011).
   *
   * One flag covers four situations — never written, swept, past the window,
   * held for a report — because the player's options are identical in all four.
   * A client that worked this out from `concludedAt` would be wrong in three of
   * them, and would be wrong *after* a click on a screen that had already
   * promised a video.
   */
  readonly watchable: boolean;
}

export interface BattleListResponse {
  readonly battles: readonly BattleListEntry[];
  readonly total: number;
}

export interface ReplayLog {
  readonly battleId: string;
  /**
   * **The versions the battle was fought under, not today's.** Surfaced on the
   * viewer because it is the visible half of Constitution XVI: a patch that
   * moves the engine forward cannot reach back into this log, and the way a
   * player sees that is the recording carrying its own provenance.
   */
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly events: readonly TurnEvent[];
  readonly conclusion: Conclusion | null;
}

// ---------------------------------------------------------------------------
// Seats — the only thing an instance id carries
// ---------------------------------------------------------------------------

export interface Seat {
  readonly side: BattleRole;
  readonly row: SquadRow;
  /** 0-based on the wire. Displayed 1-based, as every other screen counts. */
  readonly index: number;
}

const SIDE_OF: Readonly<Record<string, BattleRole>> = { a: 'attacker', d: 'defender' };
const ROWS: readonly SquadRow[] = ['front', 'middle', 'back'];

/**
 * `a-front-0` → `{ side: 'attacker', row: 'front', index: 0 }`.
 *
 * **Returns `null` rather than throwing on anything unexpected.** A replay is a
 * seven-day-old document written by an older build; a viewer that threw on an
 * id it did not recognise would turn a cosmetic surprise into a blank screen
 * for a battle the player watched happen.
 */
export function parseSeat(instanceId: string): Seat | null {
  const parts = instanceId.split('-');
  if (parts.length !== 3) return null;

  const side = SIDE_OF[parts[0]!];
  const row = ROWS.find((r) => r === parts[1]);
  const index = Number(parts[2]);

  if (!side || !row || !Number.isInteger(index) || index < 0) return null;
  return { side, row, index };
}

/**
 * How a seat reads to the player watching.
 *
 * **Relative to the viewer, never absolute.** A defender watching their own
 * wall being broken should not have to remember that they were "the defender"
 * to work out which half of the log is theirs.
 */
export function seatLabel(seat: Seat, viewerRole: BattleRole): string {
  const whose = seat.side === viewerRole ? 'Yours' : 'Theirs';
  return `${whose} · ${seat.row} ${seat.index + 1}`;
}

/** The same, from a raw id, falling back to the id itself when it is unknown. */
export function labelFor(instanceId: string | null, viewerRole: BattleRole): string {
  if (instanceId === null) return '—';
  const seat = parseSeat(instanceId);
  return seat ? seatLabel(seat, viewerRole) : instanceId;
}

// ---------------------------------------------------------------------------
// Reading the log — counting recorded facts, deriving no rules
// ---------------------------------------------------------------------------

/**
 * Who has fallen by a given point in the log.
 *
 * **Read from `outcome.deaths`, never computed from damage.** The server
 * decided who died and wrote it down; subtracting damage from a starting HP the
 * log does not carry would be a second implementation of the ending rule, and
 * would be wrong the first time a heal or a shield landed.
 */
export function fallenBy(events: readonly TurnEvent[], upTo: number): ReadonlySet<string> {
  const fallen = new Set<string>();
  for (const event of events.slice(0, upTo)) {
    for (const id of event.outcome.deaths) fallen.add(id);
  }
  return fallen;
}

/** How many of a side's six are still up, by a given point. */
export function standing(
  events: readonly TurnEvent[],
  upTo: number,
  side: BattleRole,
): number {
  let down = 0;
  for (const id of fallenBy(events, upTo)) {
    if (parseSeat(id)?.side === side) down += 1;
  }
  /* `SQUAD_SIZE`, not a literal 6 — the formation constant lives in the rules
     package and this screen is not a second place to write it down. */
  return SQUAD_SIZE - down;
}

/**
 * The export's `AGE` — `NOW`, `6H`, `3D`.
 *
 * **This is presentation and nothing branches on it.** It is stated because a
 * date is the thing a client must *not* use to decide watchability (FR-011),
 * and the distinction between showing an age and computing an entitlement from
 * one is exactly where that requirement gets broken by accident.
 */
export function ageOf(concludedAt: string, now: Date): string {
  const hours = Math.floor((now.getTime() - new Date(concludedAt).getTime()) / 3_600_000);
  if (hours < 1) return 'NOW';
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
}
