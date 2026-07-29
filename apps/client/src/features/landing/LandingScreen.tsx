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

const ARCANE = [
  ['Earth', 'text-earth'],
  ['Air', 'text-air'],
  ['Fire', 'text-fire'],
  ['Water', 'text-water'],
  ['Light', 'text-light'],
  ['Dark', 'text-dark'],
] as const;

const MARTIAL = [
  ['Slash', 'text-slash-lit'],
  ['Pierce', 'text-pierce-lit'],
  ['Crush', 'text-crush-lit'],
] as const;

function Pillar({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded border border-line bg-surface p-6">
      <h3 className="mb-2 font-display text-sm tracking-widest text-gold uppercase">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </section>
  );
}

export function LandingScreen(): JSX.Element {
  return (
    <main className="mx-auto max-w-[1600px] px-8 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-6xl tracking-[0.3em] text-gold">LMNTLZ</h1>
        <p className="mt-6 text-2xl leading-snug text-parchment">
          A competitive squad battler where the roster is never the advantage.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-muted">
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
        <h2 className="font-display text-sm tracking-widest text-faint uppercase">The Nine Forces</h2>
        <p className="mt-3 text-sm text-muted">
          Six arcane, arranged in a ring, and three martial in a triangle. Every one of them counters
          exactly one other and is countered by exactly one other — so there is no safe type, only a
          matchup you have prepared for.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[...ARCANE, ...MARTIAL].map(([name, tone]) => (
            <span
              key={name}
              className={`rounded border border-line bg-raised px-3 py-1 font-display text-sm tracking-widest uppercase ${tone}`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-3xl rounded border border-line bg-surface p-6">
        <h2 className="font-display text-sm tracking-widest text-gold uppercase">
          Where the game is
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          <strong className="text-parchment">LMNTLZ is in active development and not yet
          playable.</strong>{' '}
          The rules engine, the roster and the squad builder are built; battles, matchmaking and
          sign-in are being written now. Nothing is being sold until there is a game attached to it —
          the{' '}
          <a href="/pricing.html" className="text-gold underline underline-offset-2">
            pricing page
          </a>{' '}
          describes what will be offered and what the ceiling is, so it can be judged before anyone
          is asked for money.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
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
