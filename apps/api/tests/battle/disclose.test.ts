/**
 * 🔴 **The visibility rule, tested on the payload and not on the render**
 * (020 US4, T043).
 *
 * `05-status.md` settled on 2026-07-27 that an enemy's self-applied effect shows
 * *"a pip with no numeral"*. The temptation is to satisfy that in the status row
 * — draw the pip, skip the number — and it would look identical on screen and be
 * worth nothing: **a value in the response is readable by anyone with a network
 * tab open.** So the assertions below are about what leaves the server.
 *
 * This was a live leak rather than a missing feature. `ActionPacket.state` is the
 * whole `BattleState` and always has been; the moment US1 started writing
 * effects, every duration on the board started shipping.
 *
 * ### What each test has to be careful about
 *
 * The failure mode a careless test misses is **over-redaction**, not under —
 * blanking every duration passes "the enemy's is hidden" and silently breaks the
 * two classes a player is entitled to. Every case below asserts both directions
 * on the same board.
 */

import { describe, expect, it } from 'vitest';
import { PERMANENT, type BattleState } from '@lmntlz/sim/rules';
import type { DisclosedState } from '../../src/battle/disclose.js';
import { disclose, disclosePacket } from '../../src/battle/disclose.js';
import { board, status, withHero } from './fixtures.js';

const MINE = 'a-front-0';
const ALSO_MINE = 'a-middle-0';
const THEIRS = 'd-front-0';
const ALSO_THEIRS = 'd-middle-0';

/**
 * **A local reader rather than `heroStateOf`, and the type is why.**
 *
 * `DisclosedState` is deliberately *not* assignable to `BattleState` —
 * `turnsRemaining` widens to `number | null` on the way out — so the engine's own
 * accessor refuses it. That refusal is the feature: it means no rule can be
 * handed a redacted board by accident.
 */
const heroOn = (state: BattleState | DisclosedState, id: string) =>
  state.heroes.find((h) => h.instanceId === id)!;

const durationsOn = (
  state: BattleState | DisclosedState,
  id: string,
): readonly (number | null)[] => heroOn(state, id).statuses.map((s) => s.turnsRemaining);

/** A burn placed on `bearer` by `source`, lasting three turns. */
const burn = (source: string) =>
  status('burn', { magnitude: 12, turnsRemaining: 3, sourceInstanceId: source });

describe('an effect on my own champion', () => {
  /**
   * *"A stun on one of your own champions counts down in the open, because you
   * need to know when that champion comes back — it is your squad's state,
   * whoever caused it."*
   */
  it('keeps its duration even when the enemy caused it', () => {
    const state = withHero(board(), MINE, { statuses: [burn(THEIRS)] });
    expect(durationsOn(disclose(state, 'attacker'), MINE)).toEqual([3]);
  });

  it('keeps its duration when I caused it', () => {
    const state = withHero(board(), MINE, { statuses: [burn(ALSO_MINE)] });
    expect(durationsOn(disclose(state, 'attacker'), MINE)).toEqual([3]);
  });
});

describe('an effect on an enemy', () => {
  /** *"A burn you applied to an enemy counts down in the open, because you applied it."* */
  it('keeps its duration when I caused it', () => {
    const state = withHero(board(), THEIRS, { statuses: [burn(MINE)] });
    expect(durationsOn(disclose(state, 'attacker'), THEIRS)).toEqual([3]);
  });

  /** 🔴 The one case the rule withholds. */
  it('loses its duration when the enemy caused it themselves', () => {
    const state = withHero(board(), THEIRS, { statuses: [burn(THEIRS)] });
    expect(durationsOn(disclose(state, 'attacker'), THEIRS)).toEqual([null]);
  });

  it('loses its duration when another enemy caused it', () => {
    const state = withHero(board(), THEIRS, { statuses: [burn(ALSO_THEIRS)] });
    expect(durationsOn(disclose(state, 'attacker'), THEIRS)).toEqual([null]);
  });

  /**
   * 🔴 **Both classes on one hero, which is where a coarse implementation
   * fails.** Redacting per *hero* rather than per *effect* would take the burn I
   * applied down with the enemy's own buff.
   */
  it('redacts only the enemy’s own, on a hero carrying both', () => {
    const state = withHero(board(), THEIRS, {
      statuses: [burn(MINE), burn(ALSO_THEIRS)],
    });
    expect(durationsOn(disclose(state, 'attacker'), THEIRS)).toEqual([3, null]);
  });
});

describe('what is never touched', () => {
  /**
   * ⚠️ **`magnitude` stays, and it is load-bearing rather than an oversight.**
   *
   * The client runs `damagePreview` out of the same `packages/sim` the server
   * resolves with. It reads shields, shreds and the statuses three passives
   * condition on — so a redacted magnitude would make every projected swing on
   * screen disagree with the resolution behind it.
   *
   * It is also not a secret being kept: a shield's size is *observed* the moment
   * it absorbs a blow. A duration can only be known by being told.
   */
  it('leaves magnitude, kind and source on a withheld effect', () => {
    const state = withHero(board(), THEIRS, {
      statuses: [status('shield', { magnitude: 45, turnsRemaining: 2, sourceInstanceId: THEIRS })],
    });

    const shown = heroOn(disclose(state, 'attacker'), THEIRS).statuses[0]!;

    expect(shown.turnsRemaining).toBeNull();
    expect(shown.magnitude).toBe(45);
    expect(shown.kind).toBe('shield');
    expect(shown.sourceInstanceId).toBe(THEIRS);
  });

  /**
   * A permanent effect already reads as `null` to a client — `PERMANENT` is
   * `Infinity` and `JSON.stringify(Infinity)` is `null`. Redaction uses the same
   * channel deliberately, so the two are indistinguishable **and identical to
   * render**: a pip with no numeral.
   */
  it('cannot be told apart from a permanent effect, which is the point', () => {
    const state = withHero(board(), THEIRS, {
      statuses: [status('shred', { magnitude: 0.2, turnsRemaining: PERMANENT, sourceInstanceId: MINE })],
    });

    const mine = heroOn(disclose(state, 'attacker'), THEIRS).statuses[0]!;
    expect(JSON.parse(JSON.stringify(mine)).turnsRemaining).toBeNull();
  });

  it('leaves a board with nothing hidden completely alone', () => {
    const state = board();
    expect(disclose(state, 'attacker').heroes).toBe(state.heroes);
  });
});

describe('🔴 the whole packet, by every route that returns one', () => {
  /**
   * **The replayed path is the one easiest to miss.** It serves a packet read
   * back out of the idempotency table, which is stored *unredacted* on purpose —
   * storing is not exposing, and that row is what an investigation reads. A retry
   * that disclosed more than the original response would make the leak reachable
   * by asking twice.
   */
  it('redacts a packet the same way the state is redacted', () => {
    const state = withHero(board(), THEIRS, { statuses: [burn(ALSO_THEIRS)] });
    const packet = { events: [], state, conclusion: null };

    const seen = disclosePacket(packet, 'attacker');
    expect(durationsOn(seen.state, THEIRS)).toEqual([null]);

    /* The stored packet is untouched — redaction is a view, not a write. */
    expect(durationsOn(packet.state, THEIRS)).toEqual([3]);
  });

  /**
   * 🔴 **Serialised, because that is the artefact the rule is about.** Every
   * assertion above reads an object; this one reads the JSON a browser receives,
   * and searches the whole body for the withheld number rather than checking one
   * field. A duration that survived anywhere in the payload is a leak wherever it
   * sits.
   */
  it('leaves no trace of a withheld duration anywhere in the response body', () => {
    const state = withHero(board(), THEIRS, {
      statuses: [status('stun', { turnsRemaining: 7, sourceInstanceId: ALSO_THEIRS })],
    });

    const body = JSON.stringify(disclosePacket({ events: [], state, conclusion: null }, 'attacker'));
    const durations = [...body.matchAll(/"turnsRemaining":([^,}]+)/g)].map((m) => m[1]);

    expect(durations).toEqual(['null']);
  });
});
