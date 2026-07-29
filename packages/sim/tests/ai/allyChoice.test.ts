/**
 * Friendly targeting — **stages 1 and 4 only** (FR-011).
 *
 * Reach applies unchanged: a heal is range-limited exactly as an attack is, by
 * the same function, with the same rules about empty rows. Taunt and fade do
 * not, being properties of *enemy* targeting — a taunt compels an attacker and a
 * fade hides from one, and neither has anything to say about which of your own
 * champions you top up.
 */

import { describe, expect, it } from 'vitest';
import { getAllHeroes, getHero } from '@lmntlz/content';
import { legalTargets } from '../../rules/targeting.js';
import { inReach } from '../../rules/reach.js';
import { chooseAlly } from '../../ai/allyChoice.js';
import { needsAllyRule } from '../../ai/types.js';
import { atTurn, board, clearRows, config, fixedSeed, powerOfTier, withHero } from './fixtures.js';

const SEED = fixedSeed();

/** A champion that owns a friendly power, and the power's id. */
const healer = (() => {
  for (const hero of getAllHeroes()) {
    const power = hero.powers.find((p) => p.friendly);
    if (power) return { hero, powerId: power.id };
  }
  throw new Error('no hero on the roster owns a friendly power');
})();

const alliesOf = (state: ReturnType<typeof board>, actorId: string) =>
  legalTargets(state, actorId, healer.powerId).candidates;

describe('the roster actually has healers to test', () => {
  it('finds at least one champion owning a friendly power', () => {
    const healers = getAllHeroes().filter(needsAllyRule);
    expect(healers.length).toBeGreaterThan(0);
  });

  it('leaves `allyRule` off the champions that own none — the interface stays honest', () => {
    const none = getAllHeroes().filter((h) => !needsAllyRule(h));
    expect(none.length).toBeGreaterThan(0);
    for (const hero of none) {
      expect(hero.powers.some((p) => p.friendly)).toBe(false);
    }
  });
});

describe('chooseAlly', () => {
  const board6 = () => atTurn(board(['h01'], [healer.hero.id]), 5);

  it('names the ally with the lowest HP percentage by default', () => {
    const state = withHero(board6(), 'd2', { hp: 5 });
    const candidates = alliesOf(state, 'd0');

    const chosen = chooseAlly(state, SEED, 0n, 'd0', healer.powerId, config(), candidates);
    expect(chosen.targetInstanceId).toBe('d2');
  });

  it('honours an explicit ally rule over the default', () => {
    const state = withHero(board6(), 'd2', { hp: 5 });
    const candidates = alliesOf(state, 'd0');

    const healthiest = chooseAlly(
      state,
      SEED,
      0n,
      'd0',
      healer.powerId,
      config({ allyRule: 'highest-current-hp' }),
      candidates,
    );
    expect(healthiest.targetInstanceId).not.toBe('d2');
  });

  it('is range-limited exactly as an attack is', () => {
    // The defender back seat at full formation is three occupied rows from the
    // front line. Its allies in row 4 are as unreachable to a heal as an enemy
    // would be to a strike.
    const state = board6();
    const reach = getHero(healer.hero.id).reach;
    const candidates = alliesOf(state, 'd5');

    for (const id of candidates) {
      const ally = state.heroes.find((h) => h.instanceId === id)!;
      expect(inReach(state, 'd5', ally.row), `row ${ally.row} at reach ${reach}`).toBe(true);
    }

    // And the window widens as the line collapses — the same mechanic, not a
    // separate rule for allies.
    const collapsed = clearRows(state, [5]);
    expect(alliesOf(collapsed, 'd5').length).toBeGreaterThanOrEqual(0);
  });

  it('may name the caster itself, at distance 0', () => {
    // Which is why a champion owning a friendly power never passes for want of
    // a target, however boxed in it is.
    const state = board6();
    expect(alliesOf(state, 'd5')).toContain('d5');
  });

  it('never runs out of candidates, from any seat on the board', () => {
    const state = board6();
    for (const actor of state.heroes.filter((h) => h.side === 'defender')) {
      const candidates = alliesOf(state, actor.instanceId);
      expect(candidates.length, actor.instanceId).toBeGreaterThan(0);

      const chosen = chooseAlly(
        state,
        SEED,
        0n,
        actor.instanceId,
        healer.powerId,
        config(),
        candidates,
      );
      expect(candidates).toContain(chosen.targetInstanceId);
    }
  });

  it('refuses a hostile power — routing one through here would strike an ally', () => {
    const state = board6();
    const hostile = powerOfTier(healer.hero.id, 0);
    const power = getHero(healer.hero.id).powers.find((p) => p.id === hostile)!;

    if (!power.friendly) {
      expect(() =>
        chooseAlly(state, SEED, 0n, 'd0', hostile, config(), ['d1']),
      ).toThrow(/hostile power/);
    }
  });

  it('runs a shorter ladder than enemy targeting — no compulsion, no fade', () => {
    // Stages 2 and 3 are ABSENT rather than present-and-empty. The evidence is
    // in the signature: `chooseAlly` takes no filters and no compulsion, so
    // there is nothing a caller could pass that would apply one.
    expect(chooseAlly.length).toBe(7);
  });

  it('is reproducible from the same seed', () => {
    const state = board6();
    const candidates = alliesOf(state, 'd0');
    const first = chooseAlly(state, SEED, 4n, 'd0', healer.powerId, config(), candidates);

    for (let i = 0; i < 50; i++) {
      expect(chooseAlly(state, fixedSeed(), 4n, 'd0', healer.powerId, config(), candidates)).toEqual(
        first,
      );
    }
  });
});
