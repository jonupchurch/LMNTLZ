/**
 * How a battle ends (FR-029 … FR-031).
 *
 * **Every battle concludes with a determinate winner**, including pairings that
 * physically cannot finish each other. The 300-turn cap is not a safety valve
 * bolted on; it is a rule with a defined outcome, because a draw would leave the
 * rating and the hold streak with nothing to record.
 */

import { getHero } from '@lmntlz/content';
import {
  isStanding,
  standingOnSide,
  type BattleState,
  type HeroState,
  type Side,
} from './state.js';
import { maxHp } from './damage.js';

/**
 * **Provisional in its constant, settled in its mechanism.**
 *
 * This comment used to claim the median battle ran ~102 hero-turns, so that 300
 * was "roughly 3× and should almost never bind". **It bound in 62% of battles.**
 * Measured over 400 auto-played battles at `HP_PER_TOUGHNESS = 50`, the median
 * was **299** — the cap itself — and the majority of matches were decided on
 * pooled HP share rather than by anyone winning. Whatever produced 102 was not
 * measuring this loop.
 *
 * Since the pacing pass (`HP_PER_TOUGHNESS = 8`, engine `e0.2.0`) the same 400
 * battles give a median of **49** and a max of **130**, and **none** reaches the
 * cap. 300 is now ~6× the median and is inert.
 *
 * The instruction below still stands, and is now the *only* reason this is not
 * already 150: re-derive from measured p99 once feature 008 has recorded real
 * battles. The number above is simulation, which is the same class of evidence
 * that produced the wrong 102.
 */
export const HERO_TURN_CAP = 300;

export type Conclusion =
  | { readonly winner: Side; readonly reason: 'wipe' }
  | {
      readonly winner: Side;
      readonly reason: 'cap-hp-share';
      readonly shares: readonly [number, number];
    }
  | { readonly winner: Side; readonly reason: 'cap-champions-standing' }
  | { readonly winner: 'defender'; readonly reason: 'cap-tiebreak' };

/**
 * A hero at 0 HP has **left the board** (FR-029).
 *
 * Not "is at zero and lying there" — it stops occupying its row, which is what
 * makes reach open up, and it is untargetable, unhealable and unrevivable. There
 * is no downed state and no rescue; a squad that loses a hero has lost it.
 */
export function hasLeftTheBoard(hero: HeroState): boolean {
  return hero.hp <= 0;
}

/** Pooled HP share for one side: current pooled HP over pooled maximum. */
export function pooledHpShare(state: BattleState, side: Side): number {
  const heroes = state.heroes.filter((h) => h.side === side);
  if (heroes.length === 0) return 0;

  const current = heroes.reduce((sum, h) => sum + Math.max(0, h.hp), 0);
  const maximum = heroes.reduce((sum, h) => sum + maxHp(h), 0);

  return maximum === 0 ? 0 : current / maximum;
}

/** Heroes still standing, counted per side. */
function championsStanding(state: BattleState, side: Side): number {
  return standingOnSide(state, side).length;
}

/**
 * `null` while the battle continues.
 *
 * The ladder, in order:
 *
 * 1. **A wipe.** One side has nobody standing.
 * 2. **At the cap, pooled HP share.** Proportional rather than absolute, so a
 *    high-Toughness squad does not win by construction.
 * 3. **Then champions standing.** Reachable when two squads are proportionally
 *    identical but differently distributed.
 * 4. **Then the defender holds.** Someone has to win, and giving it to the
 *    defender means a stall favours the side that did not choose the fight.
 */
export function battleEnded(state: BattleState): Conclusion | null {
  const attackerStanding = championsStanding(state, 'attacker');
  const defenderStanding = championsStanding(state, 'defender');

  if (attackerStanding === 0 && defenderStanding === 0) {
    // Simultaneous wipe: the same tiebreak as a stall, for the same reason.
    return { winner: 'defender', reason: 'cap-tiebreak' };
  }
  if (defenderStanding === 0) return { winner: 'attacker', reason: 'wipe' };
  if (attackerStanding === 0) return { winner: 'defender', reason: 'wipe' };

  if (state.heroTurn < HERO_TURN_CAP) return null;

  const attackerShare = pooledHpShare(state, 'attacker');
  const defenderShare = pooledHpShare(state, 'defender');

  if (attackerShare !== defenderShare) {
    return {
      winner: attackerShare > defenderShare ? 'attacker' : 'defender',
      reason: 'cap-hp-share',
      shares: [attackerShare, defenderShare],
    };
  }

  if (attackerStanding !== defenderStanding) {
    return {
      winner: attackerStanding > defenderStanding ? 'attacker' : 'defender',
      reason: 'cap-champions-standing',
    };
  }

  return { winner: 'defender', reason: 'cap-tiebreak' };
}

/** Convenience for a caller stepping the battle: is this instance still in play? */
export function stillInPlay(state: BattleState, instanceId: string): boolean {
  const hero = state.heroes.find((h) => h.instanceId === instanceId);
  return hero !== undefined && isStanding(hero);
}

/** The roster entry behind an instance. Re-exported so callers need one import. */
export function heroOf(hero: HeroState): ReturnType<typeof getHero> {
  return getHero(hero.heroId);
}
