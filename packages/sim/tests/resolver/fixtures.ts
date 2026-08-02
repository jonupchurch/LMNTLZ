import { getHero } from '@lmntlz/content';
import { HP_PER_TOUGHNESS } from '../../rules/damage.js';
import type { BattleState, HeroState, Row, Side } from '../../rules/state.js';
import type { BattleAction } from '../../resolver/replay.js';
import { restoreSeed, type Seed } from '../../resolver/seed.js';

export const BATTLE_ID = 'b-test-0001';

/** A fixed seed, so every expectation in these tests is reproducible by hand. */
export function fixedSeed(n = 0x0123456789abcdefn): Seed {
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) bytes[i] = Number((n >> BigInt((7 - i) * 8)) & 0xffn);
  return restoreSeed(bytes);
}

const FORMATION: Readonly<Record<Side, readonly Row[]>> = Object.freeze({
  attacker: [3, 3, 2, 2, 2, 1],
  defender: [4, 4, 5, 5, 5, 6],
});

function heroState(heroId: string, side: Side, row: Row, instanceId: string): HeroState {
  const hero = getHero(heroId);
  const hp = hero.stats.toughness * HP_PER_TOUGHNESS;
  return {
    heroId,
    instanceId,
    side,
    row,
    hp,
    maxHp: hp,
    accumulator: 0,
    cooldowns: {},
    statuses: [],
    statMods: {},
    reachMod: 0,
    runeEffects: [],
    hasActed: false,
  };
}

/**
 * The three champions that **counter** — Kaellis, Reyna and Grieve, who share
 * `Redouble` (2026-08-02).
 *
 * Named because the default board must not field one by accident. Until today
 * `h19` was an arbitrary defender; the moment a reactive power existed it stopped
 * being arbitrary, and every draw-accounting assertion in this suite silently
 * became a measurement of six defenders swinging back.
 */
export const REACTIVE_HEROES: readonly string[] = Object.freeze(['h19', 'h20', 'h21']);

/**
 * The default defender: **`h22` Vantric, chosen because it cannot counter.**
 *
 * The nearest analog of the `h19` this replaced — Pierce rather than Slash, but
 * the same Role, the same reach and the same tier ladder — so the boards these
 * fixtures build are as close to the old ones as a non-reactive champion gets.
 *
 * **A control has to be inert.** A fixture that fields the game's only reactive
 * power makes every test built on it a reaction test whether its author meant one
 * or not, and the failure mode is silent: the numbers simply come out different
 * and somebody adjusts the expectation. A test that *wants* a counter says so,
 * with {@link REACTIVE_HEROES}.
 */
export const INERT_DEFENDER = 'h22';

export function battle(attackerId = 'h01', defenderId = INERT_DEFENDER): BattleState {
  const heroes = [
    ...FORMATION.attacker.map((row, i) => heroState(attackerId, 'attacker', row, `a${i}`)),
    ...FORMATION.defender.map((row, i) => heroState(defenderId, 'defender', row, `d${i}`)),
  ];

  return {
    heroes,
    heroTurn: 1,
    turnOfInstance: 'a0',
    engineVersion: 'e0.1.0',
    contentVersion: 'c-test',
  };
}

/** The tier-0 auto attack — always available, no cooldown, no gate. */
export const autoPower = (heroId: string): string =>
  getHero(heroId).powers.find((p) => p.tier === 0)!.id;

export function action(
  sequence: number,
  patch: Partial<BattleAction> = {},
): BattleAction {
  return {
    battleId: BATTLE_ID,
    sequence,
    actorInstanceId: 'a0',
    powerId: autoPower('h01'),
    targetInstanceId: 'd0',
    drawIndexBefore: BigInt(sequence - 1) * 2n,
    drawsConsumed: 2n,
    ...patch,
  };
}

/**
 * Serialise anything, including BigInt, stably.
 *
 * **`toEqual` is not enough for a determinism claim.** Deep equality passes on
 * a `Set` that iterates differently and on two objects whose keys were inserted
 * in a different order. Byte comparison catches both.
 */
export const bytes = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v));
