/**
 * **A replay that is gone, said three different ways** (018 T034, T038 ·
 * FR-012, FR-013).
 *
 * ### TL;DR
 *
 * A replay you can no longer watch has to read as *"no longer watchable"* — the
 * battle still happened, the result still stands. It must never read as though
 * the battle itself went missing, and asking for somebody else's must never
 * reveal that theirs exists.
 *
 * ### Three answers, and collapsing any two of them is a defect
 *
 * `getReplay()` distinguishes them and the route keeps them distinct on the
 * wire, so the client has no excuse to merge them:
 *
 * | server | means | what the player is owed |
 * |---|---|---|
 * | `410 reason: expired` | past the seven days, or swept | *it expired* — ordinary, expected |
 * | `410 reason: unavailable` | the blob put failed (008 swallows it) | *it was never recorded* — a fault, not a lifecycle |
 * | `404` | not yours, **or does not exist** | *not found* — and nothing more |
 *
 * The third row is Constitution XVII. A `403` would confirm the battle is real
 * and that two particular accounts fought it, which is a scouting signal in a
 * game built on not knowing. The server already refuses to say; a client that
 * rendered "you do not have permission" would say it anyway, from the same
 * `404`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BattleListScreen } from '../../src/features/replays/BattleListScreen.js';
import { ReplayViewer } from '../../src/features/replays/ReplayViewer.js';
import { LOG, NOW, entry, stubReplays } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const gone = (status: number, body: unknown) =>
  stubReplays({}, { '/replays/': { status, body } });

const viewer = () =>
  render(
    <ReplayViewer
      battleId="btl-1"
      viewerRole="attacker"
      onLeave={() => {}}
      onUnauthenticated={() => {}}
    />,
  );

/**
 * The refusal sentence, once the load has actually settled.
 *
 * **Not `findByRole('status')`** — the loading state is a `status` too, so that
 * query resolves instantly against *"Opening the replay…"* and every assertion
 * below would be made against the wrong node. It failed loudly here; the danger
 * is the version that does not, where a later `getBy` happens to find what it
 * wants because the state updated in the same tick.
 */
const refusal = async (): Promise<HTMLElement> =>
  waitFor(() => {
    const found = document.querySelector('[data-gone]');
    if (!found) throw new Error('the replay has not resolved yet');
    return found as HTMLElement;
  });

const NEVER_DELETED = /deleted|removed|erased|purged|missing battle|no such battle/i;

describe('an expired replay, in the list', () => {
  it('says no longer watchable, and keeps the record intact', async () => {
    stubReplays({
      '/me/battles': {
        battles: [entry({ battleId: 'btl-old', watchable: false, outcome: 'win', turnCount: 88 })],
        total: 1,
      },
    });
    render(
      <BattleListScreen now={NOW} onWatch={() => {}} onUnauthenticated={() => {}} />,
    );
    await screen.findByRole('table', { name: /your battles/i });

    const row = document.querySelector('[data-battle="btl-old"]') as HTMLElement;
    const text = row.textContent ?? '';

    expect(text).toMatch(/no longer watchable/i);
    /* FR-012: the *battle* is not gone. The outcome and the length still stand,
       and they are what the record is for. */
    expect(text).toMatch(/win/i);
    expect(text).toContain('88');
    expect(text, 'an expired replay reads as a deleted battle').not.toMatch(NEVER_DELETED);
  });
});

describe('an expired replay, opened directly', () => {
  it('reads as expired rather than as an error', async () => {
    gone(410, { error: { code: 'replay_gone', message: 'gone' }, reason: 'expired' });
    viewer();

    const note = await refusal();
    expect(note.textContent).toMatch(/no longer watchable/i);
    expect(note.textContent, 'expiry rendered as a fault').not.toMatch(/error|failed|wrong/i);
    expect(note.textContent).not.toMatch(NEVER_DELETED);
  });

  it('says seven days, from the words the server did not have to send twice', async () => {
    gone(410, { error: { code: 'replay_gone', message: 'gone' }, reason: 'expired' });
    viewer();

    /* The retention window is the one number a player needs to understand why,
       and it is the design's own constant rather than a guess. */
    expect((await refusal()).textContent).toMatch(/seven days|7 days/i);
  });
});

describe('a replay that was never recorded', () => {
  it('is distinguished from expiry, because a bug is not a lifecycle', async () => {
    gone(410, { error: { code: 'replay_gone', message: 'gone' }, reason: 'unavailable' });
    viewer();

    const note = await refusal();
    expect(note.textContent).toMatch(/never recorded|was not recorded/i);
    /**
     * **The companion that keeps the two apart.** A viewer that printed the same
     * sentence for both reasons would satisfy every "is gone" assertion above,
     * and would make a recording failure look like normal expiry forever.
     */
    expect(note.textContent, 'a failed recording reads as ordinary expiry').not.toMatch(
      /no longer watchable/i,
    );
  });
});

describe("somebody else's replay", () => {
  it('reads as not found, and never as forbidden', async () => {
    gone(404, { error: { code: 'not_found', message: 'no such replay' } });
    viewer();

    const note = await refusal();
    expect(note.textContent).toMatch(/not found|no such/i);

    /**
     * **Constitution XVII.** The server answers `404` for a battle that exists
     * and is not yours precisely so existence is never confirmed. Any of these
     * words hands that back — *"you do not have permission"* tells the caller
     * there is something to have permission for.
     */
    expect(note.textContent, 'a 404 rendered as a permission refusal confirms the battle exists').not.toMatch(
      /permission|forbidden|not allowed|access denied|not yours|participant/i,
    );
  });
});

describe('the way out', () => {
  /**
   * FR-016, and it is asserted on the *refusal* paths specifically: a viewer
   * that renders its back control alongside the playback would leave a player
   * who opened an expired replay with a dead screen and no reload-free exit.
   */
  it.each([
    ['expired', 410, { error: { code: 'replay_gone', message: 'g' }, reason: 'expired' }],
    ['unavailable', 410, { error: { code: 'replay_gone', message: 'g' }, reason: 'unavailable' }],
    ['not found', 404, { error: { code: 'not_found', message: 'g' } }],
  ] as const)('is present on a %s replay', async (_label, status, body) => {
    gone(status, body);
    viewer();

    await refusal();
    expect(screen.getByRole('button', { name: /back to your battles/i })).toBeTruthy();
  });

  it('is present on a replay that plays', async () => {
    stubReplays({ '/replays/': LOG });
    viewer();

    await screen.findByRole('region', { name: /playback/i });
    expect(screen.getByRole('button', { name: /back to your battles/i })).toBeTruthy();
  });
});
