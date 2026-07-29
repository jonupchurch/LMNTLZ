/**
 * What may leave the browser, and from which builds.
 *
 * Both functions under test are the whole of our control over Vercel Web
 * Analytics: it collects the URL verbatim, and it mounts wherever we let it.
 * Neither is a preference — one is a promise on a published policy page, the
 * other is the difference between a Steam build reporting nothing and a Steam
 * build reporting nothing *loudly*.
 */

import { describe, expect, it } from 'vitest';
import type { BeforeSendEvent } from '@vercel/analytics';
import { analyticsEnabled, isWebOrigin, scrubEvent } from '../../src/lib/analytics.js';

const pageview = (url: string): BeforeSendEvent => ({ type: 'pageview', url });

describe('scrubEvent', () => {
  it('keeps a plain path untouched', () => {
    expect(scrubEvent(pageview('https://lmntlz.com/pricing.html'))?.url).toBe(
      'https://lmntlz.com/pricing.html',
    );
  });

  it('drops the query string and keeps the path', () => {
    expect(scrubEvent(pageview('https://lmntlz.com/?ref=hackernews'))?.url).toBe(
      'https://lmntlz.com/',
    );
  });

  it('drops the fragment too', () => {
    /**
     * A fragment never reaches a server, which is exactly why people put things
     * in one — implicit-flow OAuth returns its token there. The analytics script
     * runs *in* the page, so it can see what the server cannot.
     */
    expect(scrubEvent(pageview('https://lmntlz.com/#access_token=abc.def'))?.url).toBe(
      'https://lmntlz.com/',
    );
  });

  it('drops the credentials the two sign-in paths will bring', () => {
    /**
     * The cases the blanket strip exists for, written out so that replacing it
     * with a named blocklist has to delete a test rather than merely pass one.
     * Neither URL shape exists yet — Steam is a fast-follow and Google sign-in
     * uses a token rather than a redirect — and both are one feature away.
     */
    for (const url of [
      'https://lmntlz.com/?openid.sig=Zx9%2FQ&openid.claimed_id=76561198',
      'https://lmntlz.com/auth/callback?code=4/0AVG7fi&state=abc',
    ]) {
      const scrubbed = scrubEvent(pageview(url))?.url ?? '';

      expect(scrubbed).not.toContain('openid');
      expect(scrubbed).not.toContain('code=');
      expect(scrubbed).not.toContain('?');
    }
  });

  it('preserves the rest of the event, so the type still says what it was', () => {
    // `beforeSend` receives page views and custom events through one hook. An
    // implementation that rebuilt the object from its URL alone would silently
    // relabel every event, and the dashboard would be wrong rather than empty.
    expect(scrubEvent({ type: 'event', url: 'https://lmntlz.com/?x=1' })).toEqual({
      type: 'event',
      url: 'https://lmntlz.com/',
    });
  });
});

describe('isWebOrigin', () => {
  it('admits the two protocols a deployment is served over', () => {
    expect(isWebOrigin('https:')).toBe(true);
    expect(isWebOrigin('http:')).toBe(true); // `vite preview`, and the e2e run
  });

  it('refuses the ones the desktop build loads from', () => {
    /**
     * **This is the assertion, not a formality.** `vite.config.ts` sets
     * `base: './'` so the Steam bundle can be loaded off disk, but the analytics
     * beacon is an absolute path on the deployment origin and `file://` has no
     * origin to resolve it against.
     */
    expect(isWebOrigin('file:')).toBe(false);
    expect(isWebOrigin('app:')).toBe(false);
    expect(isWebOrigin('')).toBe(false); // the fallback when there is no `location`
  });
});

describe('analyticsEnabled', () => {
  it('is false in a test run, because this is not a production web build', () => {
    /**
     * Weak on its own and kept for one reason: it fails the moment somebody
     * mounts `<Analytics/>` unconditionally. In development mode the component
     * loads a debug script and logs on every mount, so the cost of losing this
     * guard is paid by every component test in the suite, not by production.
     */
    expect(analyticsEnabled()).toBe(false);
  });
});
