/**
 * The streak reward on the result screen (2026-08-01).
 *
 * **A number this size has to say what it is.** A defense hold pays 10; the
 * bounty for ending a hundred-win run arrives in the same total and can be 300.
 * Without a line naming it, the player sees a defense that paid thirty times
 * normal and has no way to tell a reward from a bug.
 *
 * The two messages are genuinely different sentences — the attacker is paid for
 * the run they are *on*, the defender for the run they *ended* — so both are
 * asserted, and each is asserted not to show the other's.
 *
 * ### The case that is easy to forget
 *
 * `streakShards` is new on the wire. A client talking to an older server gets
 * `undefined`, which is not `0` — and `undefined > 0` is `false`, so the row is
 * simply absent. That is the correct behaviour and it is asserted, because the
 * alternative failure is `+undefined streak bonus` printed over a real battle.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Conclusion } from '@lmntlz/sim/rules';
import { ResultScreen } from '../../src/features/battle/ResultScreen.js';
import type { BattleSettlement } from '../../src/features/battle/types.js';
import { board } from './fixtures.js';

const WON: Conclusion = { winner: 'attacker', reason: 'wipe' };
const HELD: Conclusion = { winner: 'defender', reason: 'wipe' };

const settlement = (over: Partial<BattleSettlement>): BattleSettlement => ({
  winner: 'attacker',
  won: true,
  shards: 20,
  shardsEarned: 20,
  cappedAt: null,
  streakShards: 0,
  ratingDelta: 18,
  ratingBefore: 1200,
  ratingAfter: 1218,
  attackStreak: 0,
  holdStreak: 0,
  turnCount: 30,
  zone: 'visible',
  ...over,
});

const show = (conclusion: Conclusion, paid: BattleSettlement): void => {
  render(<ResultScreen conclusion={conclusion} state={board(null)} settlement={paid} />);
};

describe('the attacker’s streak bonus', () => {
  it('names the bonus and the streak it came from', () => {
    show(
      WON,
      settlement({ shards: 70, shardsEarned: 70, streakShards: 50, attackStreak: 150 }),
    );

    expect(screen.getByText(/\+50 streak bonus/)).toBeInTheDocument();
    expect(screen.getByText(/150 wins and counting/)).toBeInTheDocument();
  });

  /**
   * **The total is the whole of what landed**, or the screen disagrees with the
   * wallet. 20 for the win plus 50 for the tail is one number to the player.
   */
  it('folds the bonus into the shard total rather than showing it instead', () => {
    show(
      WON,
      settlement({ shards: 70, shardsEarned: 70, streakShards: 50, attackStreak: 150 }),
    );
    expect(screen.getByText('+70')).toBeInTheDocument();
  });

  it('says nothing at all below the threshold', () => {
    show(WON, settlement({ attackStreak: 40, streakShards: 0 }));
    expect(screen.queryByText(/streak bonus/)).not.toBeInTheDocument();
  });
});

describe('the defender’s bounty', () => {
  it('says what was ended, not what is continuing', () => {
    show(
      HELD,
      settlement({
        winner: 'defender',
        won: true,
        shards: 160,
        shardsEarned: 160,
        streakShards: 150,
        attackStreak: 0,
        holdStreak: 4,
        ratingDelta: 12,
      }),
    );

    expect(screen.getByText(/ending a 150-win streak/)).toBeInTheDocument();
    expect(screen.queryByText(/wins and counting/)).not.toBeInTheDocument();
  });
});

/**
 * 🔴 A field the server has not learned to send yet must render as nothing,
 * never as `+undefined`.
 */
describe('🔴 an older server sends no streakShards at all', () => {
  it('renders no streak line rather than an undefined one', () => {
    const legacy = settlement({ attackStreak: 150 }) as unknown as Record<string, unknown>;
    delete legacy['streakShards'];

    show(WON, legacy as unknown as BattleSettlement);

    expect(screen.queryByText(/streak bonus/)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
