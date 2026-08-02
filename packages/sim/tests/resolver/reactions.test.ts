/**
 * Reactions, resolved — **an attack inside an attack.**
 *
 * The gate lives in `rules/` and is tested there. This is the half that draws:
 * a counter runs the whole damage pipeline at the hero that swung, spends
 * indices doing it, and must stop at exactly one layer.
 *
 * ### What has to hold, and why each one is here
 *
 * - **A board with no reactive power draws nothing new.** Every fixture and every
 *   stored battle predates this, so the control is the compatibility claim.
 * - **One layer.** Both squads are counter-built by design; an unfenced version
 *   is an infinite loop reachable by ordinary play, on a server that resolves the
 *   whole turn before answering.
 * - **On a miss too**, or `Agility` suppresses the defender's own counter.
 * - **Once per its owner's turn cycle**, however many times it is hit.
 */

import { describe, expect, it } from 'vitest';
import { getHero } from '@lmntlz/content';
import { heroStateOf, type BattleState, type HeroState } from '../../rules/state.js';
import { HP_PER_TOUGHNESS } from '../../rules/damage.js';
import { resolveOne, type ResolvedPacket } from '../../resolver/resolve.js';
import { battle, fixedSeed, INERT_DEFENDER } from './fixtures.js';

/** Kaellis — `Redouble`, tier 1, cooldown 1. */
const KAELLIS = 'h19';
/** Silka Pinquick — `Already Gone`. */
const SILKA = 'h23';
/** Hettamar Ironfall — `Nothing to Discuss`. */
const HETTAMAR = 'h26';
/** Vantric — same Role, same reach, no counter. */
const INERT = INERT_DEFENDER;

const auto = (heroId: string): string => getHero(heroId).powers.find((p) => p.tier === 0)!.id;

/**
 * One attacker facing one defender, nobody else on the board.
 *
 * A duel rather than a full formation so that the counter count is unambiguous:
 * on six-a-side a party power would provoke six, which is a different test.
 */
function facing(attackerId: string, defenderId: string, patch: Partial<HeroState> = {}): BattleState {
  const base = battle(attackerId, defenderId);
  return {
    ...base,
    heroes: base.heroes
      .filter((h) => h.instanceId === 'a0' || h.instanceId === 'd0')
      .map((h) => (h.instanceId === 'd0' ? { ...h, ...patch } : h)),
  };
}

const fire = (state: BattleState, seedN: bigint, actorId = 'a0') =>
  resolveOne(
    fixedSeed(seedN),
    state,
    {
      sequence: 1,
      actorInstanceId: actorId,
      powerId: auto(heroStateOf(state, actorId).heroId),
      targetInstanceId: actorId === 'a0' ? 'd0' : 'a0',
    },
    0n,
  );

/**
 * Seeds that land and seeds that miss, **found rather than assumed** — on the
 * inert board, so the search itself is not perturbed by the thing under test.
 *
 * A hard-coded seed that happened to miss would make every "the counter fired"
 * assertion below read a different code path from the one it names.
 */
const seedsWhere = (want: 'hit' | 'miss', heroId = INERT): readonly bigint[] => {
  const found: bigint[] = [];
  for (let n = 1n; n <= 300n && found.length < 8; n++) {
    const { packet } = fire(facing('h01', heroId), n);
    if (packet.hit === (want === 'hit') && packet.deaths.length === 0) found.push(n);
  }
  return found;
};

const LANDS = seedsWhere('hit');
const MISSES = seedsWhere('miss');

describe('the board these are measured on', () => {
  it('finds both landing and missing seeds, or nothing below proves anything', () => {
    expect(LANDS.length).toBeGreaterThan(0);
    expect(MISSES.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The control — Constitution XVI
// ---------------------------------------------------------------------------

describe('a board with nothing reactive on it', () => {
  /**
   * 🔴 **Bit-identical to the pre-reaction engine, and this is the claim the
   * whole `e0.8.0` bump rests on.**
   *
   * `04-turns.md`'s draw contract before today: one index on a miss, two on a
   * landed hit with no riders. If a reaction-free board spent anything extra,
   * every stored battle would re-derive differently and every fixture in the
   * suite would have been quietly re-timed.
   */
  it('🔴 spends 1 index on a miss and 2 on a hit, exactly as before', () => {
    for (const n of MISSES) {
      expect(fire(facing('h01', INERT), n).drawsConsumed, `seed ${n} missed`).toBe(1n);
    }
    for (const n of LANDS) {
      expect(fire(facing('h01', INERT), n).drawsConsumed, `seed ${n} landed`).toBe(2n);
    }
  });

  it('🔴 reports no reactions field at all rather than an empty one', () => {
    const { packet } = fire(facing('h01', INERT), LANDS[0]!);
    expect(packet.reactions, 'absent, so an old replay and a quiet turn read alike').toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The counter fires
// ---------------------------------------------------------------------------

describe('a struck defender counters', () => {
  const packetsOf = (heroId: string, seeds: readonly bigint[]): readonly ResolvedPacket[] =>
    seeds.map((n) => fire(facing('h01', heroId), n).packet);

  it('🔴 swings back at whoever swung at it', () => {
    const countered = packetsOf(KAELLIS, LANDS).filter((p) => (p.reactions ?? []).length > 0);
    expect(countered.length, 'no seed produced a counter at all').toBeGreaterThan(0);

    for (const packet of countered) {
      const [reaction] = packet.reactions!;
      expect(reaction!.actorInstanceId).toBe('d0');
      expect(reaction!.targetInstanceId).toBe('a0');
      expect(reaction!.powerId).toBe('Redouble');
    }
  });

  /**
   * 🔴 **Exactly one**, on a duel. More than one would mean the fence leaked or
   * the candidate list double-counted a defender.
   */
  it('🔴 exactly once per defender the payload touched', () => {
    for (const n of LANDS) {
      const { packet } = fire(facing('h01', KAELLIS), n);
      expect((packet.reactions ?? []).length, `seed ${n}`).toBeLessThanOrEqual(1);
    }
  });

  /**
   * 🔴 **The 2026-07-27 ruling, end to end.** The action missed; the counter
   * still happened.
   */
  it('🔴 fires on an evaded attack', () => {
    const countered = MISSES.map((n) => fire(facing('h01', KAELLIS), n).packet).filter(
      (p) => (p.reactions ?? []).length > 0,
    );

    expect(countered.length, 'a dodge silenced every counter').toBeGreaterThan(0);
    for (const packet of countered) {
      expect(packet.hit, 'the action itself missed').toBe(false);
    }
  });

  /**
   * 🔴 **A counter is a real blow, not a marker.** At least one of these seeds has
   * to land actual damage on the attacker, or the whole system is a log line.
   */
  it('🔴 takes health off the attacker when it lands', () => {
    const hits = LANDS.map((n) => fire(facing('h01', KAELLIS), n))
      .filter((r) => (r.packet.reactions ?? []).some((e) => e.hit));

    expect(hits.length, 'not one counter landed across every seed').toBeGreaterThan(0);

    for (const result of hits) {
      const opener = heroStateOf(facing('h01', KAELLIS), 'a0');
      const after = heroStateOf(result.state, 'a0');
      expect(after.hp, 'the counter landed and cost nothing').toBeLessThan(opener.hp);
    }
  });
});

// ---------------------------------------------------------------------------
// The fence
// ---------------------------------------------------------------------------

describe('a reaction cannot trigger a reaction', () => {
  /**
   * 🔴 **Both sides counter-built — the exact board the fence exists for.**
   *
   * Kaellis attacking Kaellis: the defender counters, and the counter lands on a
   * champion who also owns `Redouble`. An unfenced engine ping-pongs until the
   * stack blows or a hero dies. The assertion is that the action terminates and
   * reports **one** counter, never two.
   */
  it('🔴 resolves exactly one layer with a reactive hero on both sides', () => {
    for (const n of LANDS) {
      const { packet } = fire(facing(KAELLIS, KAELLIS), n);
      expect((packet.reactions ?? []).length, `seed ${n} went past one layer`).toBeLessThanOrEqual(
        1,
      );
      for (const event of packet.reactions ?? []) {
        expect(event.actorInstanceId, 'the attacker countered its own counter').toBe('d0');
      }
    }
  });

  /**
   * 🔴 **And the attacker's own counter is never charged**, which is the
   * independent reading of the same fact: if the attacker had countered the
   * counter, `Redouble` would be on its cooldown record.
   */
  it('🔴 leaves the attacker’s own Redouble uncharged', () => {
    for (const n of LANDS) {
      const { state } = fire(facing(KAELLIS, KAELLIS), n);
      expect(heroStateOf(state, 'a0').cooldowns.Redouble, `seed ${n}`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// The cooldown
// ---------------------------------------------------------------------------

describe('the counter goes on cooldown the instant it fires', () => {
  it('🔴 charges the reactor, not the attacker', () => {
    const fired = LANDS.map((n) => fire(facing('h01', KAELLIS), n)).find(
      (r) => (r.packet.reactions ?? []).length > 0,
    );
    expect(fired, 'no counter fired on any landing seed').toBeDefined();

    expect(heroStateOf(fired!.state, 'd0').cooldowns.Redouble).toBe(2);
    expect(heroStateOf(fired!.state, 'a0').cooldowns).toEqual({});
  });

  /**
   * 🔴 **However many times it is hit.** The charge is what makes that true, so a
   * defender that already spent its counter this turn cycle answers nothing.
   */
  it('🔴 refuses a second counter in the same turn', () => {
    for (const n of LANDS) {
      const { packet } = fire(facing('h01', KAELLIS, { cooldowns: { Redouble: 2 } }), n);
      expect(packet.reactions, `seed ${n} countered while charged`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// The two passives, resolved rather than gated
// ---------------------------------------------------------------------------

describe('Already Gone and Nothing to Discuss, in a real action', () => {
  /**
   * 🔴 Silka swings and nobody answers — **landed or missed.** Two of forty
   * passives were dead names until the reaction system existed; this is the one
   * that says so end to end.
   */
  it('🔴 nobody counters Silka, on any seed', () => {
    for (const n of [...LANDS, ...MISSES]) {
      const { packet } = fire(facing(SILKA, KAELLIS), n);
      expect(packet.reactions, `seed ${n} countered Already Gone`).toBeUndefined();
    }
  });

  /**
   * 🔴 **The distinguishing pair.** Hettamar denies a counter to whoever he
   * *damaged* — so a landed blow silences and a missed one does not. Get this
   * wrong in either direction and both passives still look implemented.
   */
  it('🔴 Hettamar silences a defender he hit', () => {
    for (const n of LANDS) {
      const { packet } = fire(facing(HETTAMAR, KAELLIS), n);
      if (!packet.hit) continue;
      expect(packet.reactions, `seed ${n} countered a blow that connected`).toBeUndefined();
    }
  });

  it('🔴 but a defender that dodged him counters freely', () => {
    const countered = MISSES.map((n) => fire(facing(HETTAMAR, KAELLIS), n).packet).filter(
      (p) => (p.reactions ?? []).length > 0,
    );

    expect(countered.length, 'a miss must deny nothing — he damaged nobody').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------

describe('what a counter costs in indices', () => {
  /**
   * 🔴 **The counter's own 1 or 2, and nothing else** — `e0.8.0`'s whole draw
   * story in one assertion.
   *
   * A counter runs the same pipeline, so it spends one index on its hit roll and
   * a second only if that landed. Measured as a delta against the identical board
   * with a non-reactive defender, so the action's own draws cancel out.
   */
  it('🔴 costs one index when the counter missed and two when it landed', () => {
    let sawOne = false;
    let sawTwo = false;

    for (const n of LANDS) {
      const control = fire(facing('h01', INERT), n).drawsConsumed;
      const armed = fire(facing('h01', KAELLIS), n);
      const events = armed.packet.reactions ?? [];
      if (events.length === 0) continue;

      const delta = armed.drawsConsumed - control;
      const expected = events[0]!.hit ? 2n : 1n;
      expect(delta, `seed ${n}: a counter that ${events[0]!.hit ? 'landed' : 'missed'}`).toBe(
        expected,
      );

      if (expected === 1n) sawOne = true;
      else sawTwo = true;
    }

    expect(sawOne || sawTwo, 'no counter fired, so no delta was measured').toBe(true);
  });

  /**
   * 🔴 **Deterministic.** The same seed and the same board produce the same
   * counters, the same damage and the same index count — a reaction is resolved
   * from the seed like everything else, never from ambient state.
   */
  it('🔴 reproduces exactly from the same seed', () => {
    for (const n of LANDS) {
      const first = fire(facing('h01', KAELLIS), n);
      const second = fire(facing('h01', KAELLIS), n);

      expect(second.drawsConsumed).toBe(first.drawsConsumed);
      expect(second.packet.reactions).toEqual(first.packet.reactions);
      expect(heroStateOf(second.state, 'a0').hp).toBe(heroStateOf(first.state, 'a0').hp);
    }
  });

  /**
   * 🔴 **A counter that kills is reported as a death by the action**, or the
   * client leaves the body standing until the next request.
   *
   * Arranged rather than hunted: the attacker is dropped to a sliver so that any
   * landed counter is lethal.
   */
  it('🔴 puts a counter’s kill in the action’s own death list', () => {
    const brittle = (): BattleState => {
      const base = facing('h01', KAELLIS);
      return {
        ...base,
        heroes: base.heroes.map((h) => (h.instanceId === 'a0' ? { ...h, hp: 1 } : h)),
      };
    };

    const killed = LANDS.map((n) => fire(brittle(), n).packet).filter((p) =>
      (p.reactions ?? []).some((e) => e.deaths.length > 0),
    );

    expect(killed.length, 'not one counter landed on a 1 HP attacker').toBeGreaterThan(0);

    for (const packet of killed) {
      const fromCounter = packet.reactions!.flatMap((e) => e.deaths);
      for (const id of fromCounter) {
        expect(packet.deaths, 'a death the board would never hear about').toContain(id);
      }
      expect(new Set(packet.deaths).size, 'one hero, reported twice').toBe(packet.deaths.length);
    }
  });
});

// ---------------------------------------------------------------------------
// A full formation
// ---------------------------------------------------------------------------

describe('six defenders, all of them able to counter', () => {
  /**
   * 🔴 **A single-target blow provokes one counter, not six.** *"The phase runs
   * per target"* — a power that hits three enemies can be countered three times,
   * once by each survivor, and a power that hits one is answered once.
   */
  it('🔴 provokes one counter for a single-target blow', () => {
    const full = battle('h01', KAELLIS);
    for (const n of LANDS) {
      const { packet } = resolveOne(
        fixedSeed(n),
        full,
        { sequence: 1, actorInstanceId: 'a0', powerId: auto('h01'), targetInstanceId: 'd0' },
        0n,
      );
      expect((packet.reactions ?? []).length, `seed ${n}`).toBeLessThanOrEqual(1);
    }
  });

  /** The formation is real: six a side, and `HP_PER_TOUGHNESS` is what fills them. */
  it('is a full board, so the assertion above is not about an empty one', () => {
    const full = battle('h01', KAELLIS);
    expect(full.heroes.filter((h) => h.side === 'defender')).toHaveLength(6);
    expect(heroStateOf(full, 'd0').hp).toBe(getHero(KAELLIS).stats.toughness * HP_PER_TOUGHNESS);
  });
});
