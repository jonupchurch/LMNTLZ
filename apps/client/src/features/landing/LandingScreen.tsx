/**
 * The front door — what an unauthenticated visitor sees.
 *
 * ### Why this exists
 *
 * Until 2026-07-29 the site's homepage was the string
 * *"This endpoint requires a session token."* — the API's raw 401, rendered as
 * the whole page, because `SquadsScreen` treated *not signed in* as a failure
 * and displayed the server's message verbatim. Anybody assessing whether this
 * was a real product saw a stack trace with a nav bar under it.
 *
 * **A 401 on `/roster` is not an error.** It is the ordinary state of every
 * visitor who has not signed in, and the ordinary state deserves a page.
 *
 * ### What may and may not be said here
 *
 * Every claim below is settled canon from `CLAUDE.md` — the roster size, the
 * two zones, the ambush cap, the formation, the price ceiling. **Marketing copy
 * is not a place to decide game rules.** If something is not already decided,
 * it does not appear; the honest note at the foot is there precisely so nothing
 * has to be overstated to fill space.
 */

import type { JSX } from 'react';
import { MAGIC_TYPES, MELEE_TYPES } from '@lmntlz/content';
import { TypeBadge } from '../../components/index.js';

/*
 * 017 T047 — the local force→colour table is gone.
 *
 * This file used to carry its own `ARCANE`/`MARTIAL` arrays pairing nine names
 * with nine Tailwind classes. That is **a second source of truth for the
 * brand** (Constitution XV): six of the nine were spelled with the base token
 * and three with the `-lit` step, so the martial three already rendered
 * brighter than the arcane six for no stated reason — the exact drift a
 * duplicated table produces.
 *
 * The forces and their order now come from `@lmntlz/content`, and their colour
 * from `TypeBadge`. Adding a tenth Force would reach this page automatically;
 * before, it would have been silently missing.
 */

function Pillar({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-lg bg-surface p-6 shadow-(--shadow-glow-1)">
      <h3 className="text-h3 mb-2 font-display tracking-widest text-gold uppercase">{title}</h3>
      <p className="text-body text-muted">{children}</p>
    </section>
  );
}

export function LandingScreen(): JSX.Element {
  return (
    <main className="mx-auto max-w-[1600px] px-8 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-display font-display tracking-[0.3em] text-gold">LMNTLZ</h1>
        <p className="text-h1 mt-6 text-parchment">
          A competitive squad battler where the roster is never the advantage.
        </p>
        <p className="text-h2 mt-4 text-muted">
          All twenty-seven champions are unlocked the moment you sign in, identically, for
          everybody. There is nothing to pull for and nobody to out-collect. The only edge is
          reading what your opponent is weak to and building against it.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-3 gap-5">
        <Pillar title="Nothing to collect">
          Twenty-seven champions, three for each of the nine forces, the same for every player from
          the first minute. A veteran and a newcomer bring the same pieces to the board.
        </Pillar>
        <Pillar title="Two squads, one you cannot see">
          You defend two zones. The Visible one can be scouted and attacked. The{' '}
          <strong className="text-parchment">Hidden</strong> one is never shown and never chosen —
          the only way in is to be ambushed, at +2% per consecutive win, capped at 90%, and shown to
          you the whole time.
        </Pillar>
        <Pillar title="A ceiling you can audit">
          One product, seven durations, <strong className="text-parchment">$160 a year at most</strong>
          . Nothing auto-renews, shards cannot be bought, and a paying player ends up exactly where a
          free one does — sooner.{' '}
          <a href="/pricing.html" className="text-gold underline underline-offset-2">
            See what is sold
          </a>
          .
        </Pillar>
      </div>

      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-h3 font-display tracking-widest text-faint uppercase">The Nine Forces</h2>
        <p className="text-body mt-3 text-muted">
          Six arcane, arranged in a ring, and three martial in a triangle. Every one of them counters
          exactly one other and is countered by exactly one other — so there is no safe type, only a
          matchup you have prepared for.
        </p>
        {/* Arcane ring first, martial triangle second — the order the design
            and the lore both use, taken from the content package rather than
            re-listed here. */}
        <div className="mt-5 flex flex-wrap gap-2">
          {[...MAGIC_TYPES, ...MELEE_TYPES].map((type) => (
            <TypeBadge key={type} type={type} size="md" />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-3xl rounded-lg bg-surface p-6 shadow-(--shadow-glow-1)">
        <h2 className="text-h3 font-display tracking-widest text-gold uppercase">
          Where the game is
        </h2>
        {/**
         * **This paragraph is the one thing on the site that goes stale on its own**,
         * and it had: it still said battles, matchmaking and sign-in were "being
         * written now" after all three had shipped. A status note that lags is worse
         * than none, because the honest version is what makes the rest credible.
         *
         * So it now names what is *missing* rather than what is done — the shorter
         * list, and the one that shrinks.
         */}
        <p className="text-body mt-3 text-muted">
          <strong className="text-parchment">LMNTLZ is playable and unfinished.</strong>{' '}
          Sign in and you can build both defense squads and three attack squads, scout an
          opponent and fight them out turn by turn. What is not built yet: runes and the shards
          that buy them, guilds, and the rating ladder. Nothing is being sold until there is a
          finished game attached to it — the{' '}
          <a href="/pricing.html" className="text-gold underline underline-offset-2">
            pricing page
          </a>{' '}
          describes what will be offered and what the ceiling is, so it can be judged before anyone
          is asked for money.
        </p>
        <p className="text-body mt-3 text-muted">
          Questions:{' '}
          <a href="/contact.html" className="text-gold underline underline-offset-2">
            get in touch
          </a>
          .
        </p>
      </div>
    </main>
  );
}
