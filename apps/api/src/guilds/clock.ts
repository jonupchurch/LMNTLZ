/**
 * The injectable clock (013 T005), and **the only file in this feature allowed to
 * read the wall clock**.
 *
 * ### Why this is Phase 2 and not an afterthought
 *
 * Succession spans **21 days across two timers** — 14 days of master inactivity,
 * then 7 more before completion. That cannot be tested by waiting, which means *an
 * implementation that requires waiting is an implementation that ships untested*.
 * And the branch that matters most is the one nobody thinks of: **day 22**, where a
 * master returns just too late. That is what a real person experiences as unfair,
 * and succession being final is a deliberate decision **only if somebody wrote that
 * test**.
 *
 * The clock exists before succession does, so there is never a version of the code
 * that has to be retrofitted.
 *
 * ### Banned by lint, not by convention
 *
 * `eslint.config.js` makes `Date.now()` and argument-less `new Date()` errors
 * anywhere under `apps/api/src/guilds`. A *convention* that says "inject the clock"
 * is broken in a one-line bug fix at the worst possible moment — by someone who is
 * not thinking about testability because they are thinking about the outage.
 *
 * The rule is shared with `packages/sim/rules`, which forbids exactly the same two
 * calls for a different reason: **one configuration, two motivations.** There a
 * clock read makes a replay non-deterministic; here it makes a timer untestable.
 *
 * > ### ⚠️ The rest of the API is NOT under this ban yet
 * >
 * > T007 asks for it to cover *"every feature with a timer"*. Measured rather than
 * > assumed, that is **45 ambient clock calls across 24 files in 8 features** —
 * > application expiry, invitation expiry and the starter week are the same shape,
 * > but so are token rotation, battle expiry, replay retention and the daily curve.
 * > Threading a clock through all of them is a larger job than this whole feature
 * > and touches deployed code. **It is named here rather than quietly skipped**, and
 * > `apps/api/src/guilds/README.md` carries the number.
 */

/**
 * One method, deliberately.
 *
 * Not `now(): number`: every consumer here compares and stores `Date`s, and a
 * millisecond number would be converted at each call site — which is where an
 * off-by-a-timezone creeps in. Not a `sleep`/`advance` pair either: nothing in this
 * feature waits, it only ever *asks what time it is*.
 */
export interface Clock {
  now(): Date;
}

/**
 * The real one. **The single permitted `new Date()` in the feature.**
 *
 * The disable is on the line rather than in the config on purpose: an exception a
 * reader can see beside the code it applies to is one they can judge, and a path
 * exception buried in `eslint.config.js` is one nobody ever revisits.
 */
export const systemClock: Clock = {
  // eslint-disable-next-line no-restricted-syntax -- the one sanctioned clock read
  now: () => new Date(),
};

/**
 * A clock stopped at an instant.
 *
 * Takes a `Date` or an ISO string, because the tests read far better written as
 * `fixedClock('2026-08-01T00:00:00Z')` than as a constructor call — and every
 * succession branch is a date somebody has to check by eye.
 */
export function fixedClock(at: Date | string): Clock {
  const instant = typeof at === 'string' ? new Date(at) : new Date(at.getTime());
  return { now: () => new Date(instant.getTime()) };
}

/**
 * A clock a test moves by hand.
 *
 * **`advanceDays` exists because every timer in this feature is expressed in
 * days** — 7-day application expiry, 14-day inactivity, 7-day succession — and a
 * test that writes `advance(14 * 86_400_000)` has restated the conversion at the
 * exact place a mistake is invisible.
 */
export interface MovableClock extends Clock {
  advanceDays(days: number): void;
  set(at: Date | string): void;
}

const DAY_MS = 86_400_000;

export function movableClock(start: Date | string): MovableClock {
  let instant = typeof start === 'string' ? new Date(start) : new Date(start.getTime());

  return {
    now: () => new Date(instant.getTime()),
    advanceDays: (days) => {
      instant = new Date(instant.getTime() + days * DAY_MS);
    },
    set: (at) => {
      instant = typeof at === 'string' ? new Date(at) : new Date(at.getTime());
    },
  };
}

/** Days between two instants, floored. The comparison every timer here performs. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** `at` plus `days`, as a new `Date`. Used to compute every stored expiry. */
export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}
