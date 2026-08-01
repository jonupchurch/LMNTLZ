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
 *
 * ### ⚠️ This screen has NO design export, and that is not an oversight
 *
 * `LMNTLZ Onboarding Flows.dc.html` sounds like it covers the front door and
 * does not: it draws a guild invitation, a guild application and a five-step
 * profile-setup wizard, all of them post-sign-in. `tools/design-audit.py`
 * pointed this screen at that file until 019 and so reported five treatments
 * absent that the design never asked this page for. **The marketing page is the
 * one surface in the product with no authored design.**
 *
 * So *"match the export"* is not available here, and the standard instead is
 * **the vocabulary the exports do establish** — `.lz-surface`'s wash and
 * hairline, the gold bloom over the region that matters most, the shield and
 * plate silhouettes on the Forces, and the champion art. A front door built
 * from stock Tailwind while every screen behind it is dressed reads as a
 * different product than the one it is selling.
 */

import type { JSX } from 'react';
import {
  MAGIC_TYPES,
  MELEE_TYPES,
  getAllHeroes,
  type DamageType,
  type HeroId,
} from '@lmntlz/content';
import { HeroPortrait, TypeBadge } from '../../components/index.js';

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

const FORCES: readonly DamageType[] = [...MAGIC_TYPES, ...MELEE_TYPES];

/**
 * One champion per Force, **found rather than listed**.
 *
 * The nine names could have been typed here in thirty seconds and that is the
 * trap: this page's whole claim is *twenty-seven champions, nine forces, all of
 * them yours*, and a hand-written band is the one version of it that can go out
 * of step with the roster it is describing. A tenth Force, or a renamed
 * champion, reaches this strip on its own.
 */
const BANNER: readonly { readonly id: HeroId; readonly name: string; readonly force: DamageType }[] =
  FORCES.map((force) => {
    const hero = getAllHeroes().find((h) => h.primary === force);
    /* Unreachable while the roster validates — three champions per Force is a
       schema rule, not a hope. Thrown rather than filtered so a content bug is
       loud here instead of quietly shipping an eight-portrait band. */
    if (!hero) throw new Error(`no champion has ${force} as a primary Force`);
    return { id: hero.id as HeroId, name: hero.name, force };
  });

function Pillar({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="lz-surface p-6">
      <h3 className="text-h3 mb-2 font-display tracking-widest text-gold uppercase">{title}</h3>
      <p className="text-body text-muted">{children}</p>
    </section>
  );
}

export function LandingScreen(): JSX.Element {
  return (
    /*
     * **One column, one left edge.** Every block used to centre itself
     * independently — the prose at `max-w-3xl`, the pillars and the portrait band
     * at `max-w-5xl`, all `mx-auto` inside a `max-w-[1600px]` page — so the text
     * started 128px to the right of the cards under it and the page had three
     * different left margins in one screenful. It reads as a mistake because it is
     * one, and it is invisible in the markup: each block looks correct on its own
     * line.
     *
     * The column is `max-w-5xl` now and the *page* owns the centring. Prose still
     * gets a reading measure, but from `max-w-3xl` with **no `mx-auto`** — capped
     * on the right, flush on the left, which is the whole difference.
     */
    <main className="mx-auto max-w-5xl px-8 py-16">
      <div className="max-w-3xl">
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

      {/*
       * The proof of the sentence above it: nine champions, one per Force, all
       * of them already yours. It is the only place on the page where the game
       * looks like a game rather than a description of one.
       *
       * `aria-hidden` because the names are decorative here — the Forces are
       * announced by the badges below, and nine portrait labels would make a
       * screen reader recite a cast list before reaching the pitch.
       */}
      <ul aria-hidden className="mt-12 grid grid-cols-9 gap-1.5 sm:gap-2">
        {BANNER.map((champion) => (
          <li
            key={champion.id}
            className="lz-surface relative aspect-3/4 overflow-hidden"
          >
            <HeroPortrait
              heroId={champion.id}
              force={champion.force}
              sizes="(max-width: 1024px) 10vw, 108px"
              scrim
              fill
            />
            <span className="absolute inset-x-0 bottom-0 truncate px-1.5 pb-1 text-center font-mono text-[10px] tracking-wide text-parchment">
              {champion.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-14 grid grid-cols-3 gap-5">
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

      <div className="mt-14">
        <h2 className="text-h3 font-display tracking-widest text-faint uppercase">The Nine Forces</h2>
        <p className="text-body mt-3 max-w-3xl text-muted">
          Six arcane, arranged in a ring, and three martial in a triangle. Every one of them counters
          exactly one other and is countered by exactly one other — so there is no safe type, only a
          matchup you have prepared for.
        </p>
        {/*
         * Arcane ring first, martial triangle second — the order the design and
         * the lore both use, taken from the content package rather than re-listed
         * here. The badge's own silhouette carries the split: a shield for the six
         * arcane, a chamfered plate for the three martial, legible before a word
         * is read.
         *
         * **The two families are two rows, and that is a fix rather than a
         * flourish.** As one `flex-wrap` run of nine they broke 8 + 1 at this
         * column width, orphaning Crush on a line of its own directly beneath a
         * sentence promising "six arcane… and three martial" — the layout
         * contradicting the caption. Grouping by family makes the wrap say
         * something instead of leaving it to whatever the container happens to
         * measure.
         */}
        <div className="mt-5 flex flex-col gap-2">
          {[MAGIC_TYPES, MELEE_TYPES].map((family) => (
            <div key={family[0]} className="flex flex-wrap gap-2">
              {family.map((type) => (
                <TypeBadge key={type} type={type} size="md" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="lz-surface lz-bloom-gold mt-14 p-6">
        <h2 className="text-h3 font-display tracking-widest text-gold uppercase">
          Where the game is
        </h2>
        {/**
         * **This paragraph is the one thing on the site that goes stale on its own**,
         * and it has now done so twice. The first version said battles, matchmaking
         * and sign-in were "being written now" after all three had shipped. The
         * second — the fix for that — said runes, shards, guilds and the ladder were
         * missing, and by 2026-07-31 every one of them was built and deployed.
         *
         * A status note that lags is worse than none, because the honest version is
         * what makes the rest credible: a visitor who finds the Forge working after
         * being told it does not exist has no reason to believe the price ceiling
         * either.
         *
         * It names what is *missing* rather than what is done — the shorter list,
         * and the one that shrinks. **When a feature ships, this sentence is part of
         * shipping it.**
         */}
        {/*
         * **The two halves are marked so a test can tell them apart.** Both
         * previous versions of this paragraph were wrong in the same direction —
         * they listed something as missing that had already shipped — and a test
         * reading the paragraph as one blob cannot catch that, because the words
         * are present either way. `landing.test.tsx` now checks the *not-built*
         * clause against the feature directories that exist on disk, which is the
         * only assertion here that fails when reality moves.
         */}
        <p className="text-body mt-3 text-muted">
          <strong className="text-parchment">LMNTLZ is playable and unfinished.</strong>{' '}
          <span data-playable>
            Sign in and you can build both defense squads and three attack squads, scout an opponent
            and fight them out turn by turn, forge runes with the shards you win, read back any
            battle you have fought, and found or join a guild.
          </span>{' '}
          <span data-not-built>
            What is not built yet: chat, the in-game news and broadcast feeds, and the balance pass —
            the champions are all present and their numbers are still a first draft.
          </span>
        </p>
        <p className="text-body mt-3 text-muted">
          Nothing is being sold — there is no checkout behind the store yet, deliberately, because
          nothing is for sale until there is a finished game attached to it. The{' '}
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
