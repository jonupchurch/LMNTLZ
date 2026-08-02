/**
 * What a player is allowed to know about the effects on the board (020 US4, T042).
 *
 * ### This is a redaction, not an addition, and that distinction is the bug
 *
 * The task reads *"carry statuses on the action packet"*. They were already
 * carried: `ActionPacket.state` is the whole `BattleState`, `HeroState.statuses`
 * has been on it since 002, and the moment US1 started writing effects the packet
 * started shipping **every duration on the board** — including the ones
 * `05-status.md` says are hidden. Nothing had to be added; something had to stop
 * being sent.
 *
 * > **Hiding it client-side would not have been hiding it.** The rule is about
 * > what an opponent can learn, and a value in the response is learnable by
 * > anyone with a network tab open. So the redaction is here, on the way out.
 *
 * ### The rule, from `05-status.md` (settled 2026-07-27)
 *
 * > *"Exact remaining duration is visible on every effect **you** caused, and on
 * > every effect sitting on **your own** champions. The only thing hidden is what
 * > the enemy put on itself — those show as a pip with no numeral."*
 *
 * Three classes, and only the third is withheld:
 *
 * | On | Caused by | Duration |
 * |---|---|---|
 * | your champion | anyone | **shown** — it is your squad's state, whoever caused it |
 * | an enemy | you | **shown** — you applied it |
 * | an enemy | that enemy's side | **hidden** |
 *
 * It lines up with a restriction already made: scouting shows an opponent only
 * which rune slots are filled, never what the effects do (`07-defense-ai.md`), so
 * an attacker meets rune effects blind. Leaking their durations through the
 * status row would undo that quietly.
 *
 * ### ⚠️ Only the duration, and the two other fields are deliberately left alone
 *
 * `magnitude` stays. **The client runs `damagePreview` from the same
 * `packages/sim` the server resolves with** (Constitution XIII), and that reads
 * shields, shreds and the statuses three passives condition on. Redacting
 * magnitude would make every projected swing on screen disagree with the
 * resolution behind it — the exact failure `damage.ts` reads the passive layer
 * inside the preview to avoid. It is also not information a player is being
 * denied: a shield's size is *observed* the moment it absorbs a blow. A duration
 * is the thing that can only be known by being told.
 *
 * `sourceInstanceId` stays for the same reason — `markCount` is keyed on it.
 *
 * ### `null` is not a new idea on this wire
 *
 * A withheld duration is sent as `null`, which is **already what a permanent
 * effect looks like to the client**: `PERMANENT` is `Infinity` and
 * `JSON.stringify(Infinity)` is `null`, so `Wears Through` shreds and every
 * passive mark have arrived that way since US1. Both mean *"a pip with no
 * numeral"*, which `resources/status-icons.md` already draws — it gives
 * rest-of-battle effects a permanence marker rather than a number.
 *
 * So the client needs no new case, and `durationOf` on the client collapses all
 * three sources of "no numeral" into one answer.
 */

import type { BattleState, HeroState, Side, StatusInstance } from '@lmntlz/sim/rules';
import type { ActionPacket } from './idempotency.js';

/**
 * A status as it leaves the server. **`turnsRemaining` is `number | null`**,
 * where `null` means *not disclosed* — either permanent, or withheld by the rule
 * above. A reader cannot tell which, and does not need to: both render as a pip
 * with no numeral.
 */
export type DisclosedStatus = Omit<StatusInstance, 'turnsRemaining'> & {
  readonly turnsRemaining: number | null;
};

export type DisclosedHero = Omit<HeroState, 'statuses'> & {
  readonly statuses: readonly DisclosedStatus[];
};

export type DisclosedState = Omit<BattleState, 'heroes'> & {
  readonly heroes: readonly DisclosedHero[];
};

export type DisclosedPacket = Omit<ActionPacket, 'state'> & {
  readonly state: DisclosedState;
};

/**
 * Whether the viewer is entitled to this effect's remaining duration.
 *
 * **Both halves are checked against the viewer's side, never against the bearer
 * alone.** A burn you applied to an enemy is yours to count down; an enemy's
 * self-buff is not. Reading only the bearer would hide the first, and reading
 * only the source would expose the third.
 */
function disclosesDuration(
  bearer: HeroState,
  status: StatusInstance,
  sideOf: ReadonlyMap<string, Side>,
  viewer: Side,
): boolean {
  if (bearer.side === viewer) return true;
  return sideOf.get(status.sourceInstanceId) === viewer;
}

/**
 * One board, as one side is allowed to see it.
 *
 * **A board with nothing hidden is returned unchanged, identity included.** That
 * is the overwhelmingly common case — most turns of most battles have no enemy
 * self-effect standing at all — and it makes the no-op provable rather than
 * merely cheap: a test asserts the same object comes back, which a rewrite that
 * "coincidentally" produced equal values could not satisfy.
 */
export function disclose(state: BattleState, viewer: Side): DisclosedState {
  const sideOf = new Map<string, Side>(state.heroes.map((h) => [h.instanceId, h.side]));

  const withheld = (hero: HeroState): boolean =>
    hero.statuses.some((s) => !disclosesDuration(hero, s, sideOf, viewer));

  if (!state.heroes.some(withheld)) return state;

  return {
    ...state,
    heroes: state.heroes.map((hero) =>
      withheld(hero)
        ? {
            ...hero,
            statuses: hero.statuses.map((s) =>
              disclosesDuration(hero, s, sideOf, viewer) ? s : { ...s, turnsRemaining: null },
            ),
          }
        : hero,
    ),
  };
}

/**
 * The same, for a whole packet.
 *
 * **Every route that returns a packet goes through this** — creation, a fresh
 * action, and a replayed one. The replayed path matters most and is the easiest
 * to miss: it serves a packet read back out of the idempotency table, which was
 * stored *unredacted* on purpose. Storage is not disclosure (Constitution XVII),
 * and the row is what a later investigation reads.
 */
export function disclosePacket(packet: ActionPacket, viewer: Side): DisclosedPacket {
  return { ...packet, state: disclose(packet.state, viewer) };
}
