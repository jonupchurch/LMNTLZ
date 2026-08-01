/**
 * Runes reach the battle (019).
 *
 * ### The defect this closes
 *
 * `board.ts` built every hero with `statMods: {}` and `reachMod: 0`, and
 * `create.ts` never read a rune. So a **completed 650-shard rune changed nothing
 * in combat** — for every battle ever fought, on both sides. Gear score read
 * runes for matchmaking, the Forge read them for display, and the one place they
 * were supposed to matter never saw them.
 *
 * It is the worst shape of the seam-with-no-caller defect, the same as the boost
 * pass: it takes the money and appears to work. Nothing throws, nothing looks
 * wrong, and the player's investment is silently discarded.
 *
 * ### Why the assertions compare two battles rather than reading one
 *
 * A single battle's numbers prove nothing on their own — every value in it is
 * *some* number, and a stat that silently stayed at base is still inside every
 * plausible range. The claim is a **difference**: identical squads, identical
 * seats, one side runed and the other not, and the runed hero must fight with
 * more. That is the assertion a hardcoded `{}` cannot satisfy.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { HP_PER_TOUGHNESS, STAT_CAP, effectiveStat, heroStateOf } from '@lmntlz/sim/rules';
import { buildInitialState, type SnapshotSeat } from '../../src/battle/board.js';
import { parseAttackerSnapshot, parseDefenderSnapshot } from '../../src/battle/snapshot.js';

const ROSTER = getAllHeroes().map((h) => h.id);

const CONFIG = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: null,
};

/** 2 front · 3 middle · 1 back, optionally with a loadout on the front seat. */
const seats = (ids: readonly string[], runes?: SnapshotSeat['runes']) =>
  [
    { row: 'front', index: 0 },
    { row: 'front', index: 1 },
    { row: 'middle', index: 0 },
    { row: 'middle', index: 1 },
    { row: 'middle', index: 2 },
    { row: 'back', index: 0 },
  ].map((seat, i) => ({
    ...seat,
    heroId: ids[i]!,
    ...(i === 0 && runes ? { runes } : {}),
  }));

/**
 * Built through the **parsers**, not from hand-made objects.
 *
 * `buildInitialState` takes seat arrays, so a test could skip the parse — and
 * would then be proving that a shape the database never produces works. The
 * round trip through `parseAttackerSnapshot` is the half most likely to drop
 * the new field silently.
 */
const board = (attackerRunes?: SnapshotSeat['runes']) =>
  buildInitialState(
    parseAttackerSnapshot({ seats: seats(ROSTER.slice(0, 6), attackerRunes) }).seats,
    parseDefenderSnapshot({
      seats: seats(ROSTER.slice(6, 12)).map((s) => ({ ...s, config: CONFIG })),
    }).seats,
    { engineVersion: 'test', contentVersion: 'test' },
  );

const FRONT = 'a-front-0';

describe('a rune changes the hero the engine fights with', () => {
  it('raises the stat the points were spent on, and only that one', () => {
    const hero = getHero(ROSTER[0]!);
    const bare = heroStateOf(board(), FRONT);
    const runed = heroStateOf(
      board({ statPoints: { might: 20, perception: 10 }, utility: [] }),
      FRONT,
    );

    expect(effectiveStat(bare, hero.stats, 'might')).toBe(
      Math.min(hero.stats.might, STAT_CAP),
    );
    expect(effectiveStat(runed, hero.stats, 'might')).toBe(
      Math.min(hero.stats.might + 20, STAT_CAP),
    );
    expect(effectiveStat(runed, hero.stats, 'perception')).toBe(
      Math.min(hero.stats.perception + 10, STAT_CAP),
    );

    /* Untouched stats are untouched — a loadout that raised everything would
       satisfy the two assertions above. */
    expect(effectiveStat(runed, hero.stats, 'agility')).toBe(
      effectiveStat(bare, hero.stats, 'agility'),
    );
  });

  /**
   * **`maxHp` is computed once, from Toughness, at board-build time.**
   *
   * So a Toughness rune applied only through `statMods` would raise the stat
   * everywhere it is read and leave the health bar bare — a champion fighting on
   * the wrong number of hit points with nothing reporting a problem. This is the
   * assertion that would catch it, and it is the reason `board.ts` resolves
   * Toughness eagerly rather than leaving it to `effectiveStat`.
   */
  it('raises max HP when the points went into Toughness', () => {
    const hero = getHero(ROSTER[0]!);
    const bare = heroStateOf(board(), FRONT);
    const runed = heroStateOf(board({ statPoints: { toughness: 20 }, utility: [] }), FRONT);

    expect(bare.maxHp).toBe(hero.stats.toughness * HP_PER_TOUGHNESS);
    expect(runed.maxHp).toBe(
      Math.min(hero.stats.toughness + 20, STAT_CAP) * HP_PER_TOUGHNESS,
    );
    expect(runed.maxHp).toBeGreaterThan(bare.maxHp);
    /* And it starts the battle full, not at the old maximum. */
    expect(runed.hp).toBe(runed.maxHp);
  });

  /**
   * The 75 cap is the engine's, not a second copy. `06-progression.md` builds
   * the whole levelling budget around a rune overflowing it, so this is the
   * boundary the design is most sensitive to.
   */
  it('clamps at 75 rather than letting a rune overflow it', () => {
    const hero = getHero(ROSTER[0]!);
    const runed = heroStateOf(board({ statPoints: { might: 999 }, utility: [] }), FRONT);
    expect(effectiveStat(runed, hero.stats, 'might')).toBe(STAT_CAP);

    const tanky = heroStateOf(board({ statPoints: { toughness: 999 }, utility: [] }), FRONT);
    expect(tanky.maxHp).toBe(STAT_CAP * HP_PER_TOUGHNESS);
  });

  /**
   * **Only the seat that carries the loadout.** A `statMods` seeded from the
   * wrong seat, or shared by reference across six heroes, is a bug this is the
   * only cheap way to see.
   */
  it('arms one seat without arming the other five', () => {
    const state = board({ statPoints: { might: 20 }, utility: [] });
    expect(heroStateOf(state, FRONT).statMods.might).toBe(20);

    for (const id of ['a-front-1', 'a-middle-0', 'a-middle-1', 'a-middle-2', 'a-back-0']) {
      expect(heroStateOf(state, id).statMods, id).toEqual({});
    }
  });
});

describe('a battle recorded before runes existed replays as it was fought', () => {
  /**
   * **Constitution XVI — the past is immutable.** Every snapshot already in the
   * table has no `runes` key, because runes reached no battle before 019. If an
   * absent field threw, every stored replay would be unopenable; if it defaulted
   * to anything but *nothing*, every past battle would be retroactively re-armed
   * and its stored log would no longer describe it.
   */
  it('treats an absent loadout as no runes rather than throwing', () => {
    const state = board();
    for (const hero of state.heroes) {
      expect(hero.statMods, hero.instanceId).toEqual({});
      expect(hero.reachMod, hero.instanceId).toBe(0);
    }
  });

  it('drops a stat key the engine no longer has, instead of failing the replay', () => {
    /* A snapshot is written once and read forever. A stat renamed three
       versions from now must not turn a two-year-old battle into a 500. */
    const parsed = parseAttackerSnapshot({
      seats: seats(ROSTER.slice(0, 6), {
        statPoints: { might: 20, charisma: 40 } as never,
        utility: [],
      }),
    });

    expect(parsed.seats[0]!.runes?.statPoints).toEqual({ might: 20 });
  });
});
