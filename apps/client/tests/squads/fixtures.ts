/**
 * One roster fixture, shared.
 *
 * **Extracted when the save arrived, not before.** `allocation.test.tsx` built
 * this inline while it was the only file that needed it; the save test needs the
 * same shape, and two copies of a wire fixture is how one of them keeps passing
 * against a payload the server no longer sends.
 */

import { getAllHeroes } from '@lmntlz/content';
import type {
  ConfiguredSeat,
  RosterResponse,
  SeatConfigWire,
} from '../../src/features/squads/types.js';

export const HEROES = getAllHeroes();
export const IDS = HEROES.map((h) => h.id);
export const nameOf = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id;

/**
 * A served config. **Legal rule names on purpose** — the route validates them
 * against the engine's own list now, so a fixture with `'whatever'` in it would
 * pass every component test and fail the only request that matters.
 */
export const CONFIG: SeatConfigWire = {
  targeting: ['lowest-current-hp', 'nearest'],
  ranking: [5, 4, 3, 2, 1, 0],
  allyRule: 'lowest-hp-percentage',
};

/** The 2/3/1 formation, in the order the server serves it. */
export const seatsFrom = (ids: readonly string[]): ConfiguredSeat[] => [
  { row: 'front', index: 0, heroId: ids[0]!, config: CONFIG },
  { row: 'front', index: 1, heroId: ids[1]!, config: CONFIG },
  { row: 'middle', index: 0, heroId: ids[2]!, config: CONFIG },
  { row: 'middle', index: 1, heroId: ids[3]!, config: CONFIG },
  { row: 'middle', index: 2, heroId: ids[4]!, config: CONFIG },
  { row: 'back', index: 0, heroId: ids[5]!, config: CONFIG },
];

/**
 * Rune stages for all 27, **varied on purpose**.
 *
 * A fixture where every champion carried the same three stages would let two
 * opposite bugs through together: a pip that never lights and a pip that always
 * lights would each satisfy every assertion written against it. The pattern is
 * deterministic so a test can compute the expected answer rather than transcribe
 * it, and it deliberately produces empty slots, partial slots and full ones.
 */
export const runeStages = (): RosterResponse['runes'] =>
  HEROES.map((hero, i) => ({
    heroId: hero.id,
    stages: [i % 5, (i * 2) % 5, i % 3 === 0 ? 4 : 0],
  }));

export const roster = (over: Partial<RosterResponse['assignments']> = {}): RosterResponse => ({
  heroes: HEROES,
  runes: runeStages(),
  assignments: {
    defense: {
      visible: {
        seats: seatsFrom(IDS.slice(0, 6)),
        holdStreak: 14,
        editedAt: null,
        canDefend: true,
      },
      hidden: { seats: seatsFrom(IDS.slice(6, 12)), holdStreak: 3, editedAt: null, canDefend: true },
    },
    offense: [],
    ...over,
  },
  streaks: { attack: 7, hold: { visible: 14, hidden: 3 } },
  ambush: { chance: 14, perWin: 2, cap: 90, capAt: 45 },
  rules: {
    target: ['lowest-current-hp', 'nearest', 'highest-might', 'furthest'],
    ally: ['lowest-hp-percentage', 'lowest-current-hp'],
    // Every hero that owns a friendly power, per the served predicate.
    needsAllyRule: HEROES.filter((h) => h.powers.some((p) => p.friendly)).map((h) => h.id),
  },
  available: { forDefense: IDS, forOffense: IDS.slice(12) },
});
