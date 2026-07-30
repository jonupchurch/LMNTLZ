/**
 * The credential (014 T006–T008, T050–T051).
 *
 * Two properties, and they fail in opposite directions:
 *
 * 1. **A token names the right rooms.** Every assertion here is *positive* — the
 *    channel is present — because a negative one passes when the whole channel
 *    list comes back empty, which is the failure mode a broken lookup produces.
 * 2. **A token cannot express publication.** That one is structural and lives in
 *    `publishCredential.test.ts`; a runtime test cannot prove the absence of a
 *    capability nobody wrote.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/client.js';
import { channelsFor, controlChannel, mintChatToken, TOKEN_TTL_MS } from '../../src/chat/tokens.js';
import { adsScope, beginnerScope, globalScope, guildScope } from '../../src/chat/scopes.js';
import { ChatFixtures } from './helpers.js';

const fx = new ChatFixtures();

/**
 * **The starter league has to be OPEN or the Beginner assertions are vacuous.**
 * With no authored bot, `starterStatus()` answers `no-authored-pool` for every
 * account and nobody is ever in the starter league — so "a starter player reaches
 * Beginner chat" would fail, and "a graduated player does not" would pass for the
 * wrong reason.
 */
beforeAll(async () => {
  await fx.bot('starter');
});

afterAll(async () => {
  await fx.cleanup();
  await closeDb();
});

describe('the channels a token names', () => {
  it('always carries the account control channel, so a re-mint can be requested', async () => {
    const id = await fx.account('plain');
    expect(await channelsFor(id)).toContain(controlChannel(id));
  });

  it('carries Global and Guild Ads for an ordinary player', async () => {
    const id = await fx.account('ordinary');
    const channels = await channelsFor(id);

    expect(channels).toContain(globalScope());
    expect(channels).toContain(adsScope());
  });

  it('carries the guild channel only for a member, and names THAT guild', async () => {
    const member = await fx.account('member');
    const outsider = await fx.account('outsider');
    const guildId = await fx.guildWith(member);

    expect(await channelsFor(member)).toContain(guildScope(guildId));
    expect(await channelsFor(outsider)).not.toContain(guildScope(guildId));
  });

  it('admits a starter-league player to Beginner', async () => {
    // Brand new, so genuinely in the starter league given the bot above.
    const fresh = await fx.account('fresh');
    expect(await channelsFor(fresh)).toContain(beginnerScope());
  });

  /**
   * **The positive Envoy case — the one that fails when the role is fake.**
   *
   * 015 asserts an Envoy attempting to moderate gets `403`, which is green today
   * whether or not the role exists, because the route refuses everybody. This is
   * the assertion that needs `is_envoy` to be real: a *graduated* player, who is
   * therefore not in the starter league, reaching Beginner chat anyway.
   */
  it('admits an Envoy to Beginner even though they are not a starter player', async () => {
    const long = new Date('2020-01-01T00:00:00.000Z');
    const graduated = await fx.account('grad', { createdAt: long });
    const envoy = await fx.account('envoy', { createdAt: long, isEnvoy: true });

    expect(
      await channelsFor(graduated),
      'a graduated player is not in Beginner, or the Envoy case below proves nothing',
    ).not.toContain(beginnerScope());

    expect(await channelsFor(envoy)).toContain(beginnerScope());
  });

  it('gives an Envoy nothing an ordinary player does not have, beyond Beginner', async () => {
    const long = new Date('2020-01-01T00:00:00.000Z');
    const envoy = await fx.account('envoy2', { createdAt: long, isEnvoy: true });
    const plain = await fx.account('plain2', { createdAt: long });

    const extra = (await channelsFor(envoy)).filter(
      (c) => c !== controlChannel(envoy) && c !== beginnerScope(),
    );
    const ordinary = (await channelsFor(plain)).filter((c) => c !== controlChannel(plain));

    expect([...extra].sort()).toEqual([...ordinary].sort());
  });
});

describe('a chat ban', () => {
  const hourAway = (): Date => new Date(Date.now() + 60 * 60 * 1000);

  it('removes every room but keeps the control channel, so the ban can lift itself', async () => {
    const id = await fx.account('banned', { bannedUntil: hourAway(), banScope: 'chat' });
    const channels = await channelsFor(id);

    expect(channels).toEqual([controlChannel(id)]);
  });

  it('does not apply once it has expired, with nothing needing to run', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const id = await fx.account('served', { bannedUntil: past, banScope: 'chat' });

    expect(await channelsFor(id)).toContain(globalScope());
  });

  it('leaves a guild-scoped ban alone — it is not a chat ban', async () => {
    const id = await fx.account('guildban', { bannedUntil: hourAway(), banScope: 'guild' });
    expect(await channelsFor(id)).toContain(globalScope());
  });
});

describe('minting', () => {
  it('returns a grant over exactly the computed channels, with the 60-minute TTL', async () => {
    const id = await fx.account('mint');
    const expected = await channelsFor(id);
    const grant = await mintChatToken(id);

    expect([...grant.channels].sort()).toEqual([...expected].sort());
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(grant.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + TOKEN_TTL_MS + 5_000);
  });

  it('names an unknown account no channels at all, rather than the public ones', async () => {
    expect(await channelsFor('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
});
