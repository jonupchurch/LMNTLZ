/**
 * Ambush odds (T035–T037).
 *
 * ### These constants are server-side and that is a rule, not a preference
 *
 * FR-017 and Constitution XII: **every streak and ambush constant is served by
 * the API and never compiled into the client.** The client displays what it is
 * told and computes none of it.
 *
 * The reason is specific rather than dogmatic. Ambush rate is the single lever
 * that decides how often anybody's Hidden squad is ever seen, and Hidden squads
 * are half the defensive game. If it turns out that 2% per win puts almost
 * nobody into a Hidden battle, the fix has to be a config change — not a client
 * build, a store submission, and a Steam update that some players will not take
 * for a week. **The web and Steam builds would disagree for that week**, which
 * is the worst possible state for a competitive number.
 *
 * `SC-008` is enforced mechanically: a test greps `apps/client/src` for a
 * literal `2`-per-win or `90` cap and requires zero matches.
 */

/** Percentage points added to ambush chance per consecutive attack win. */
export const AMBUSH_PER_WIN = 2;

/**
 * The ceiling, in percent. **Not 100** — a player who could guarantee an ambush
 * would never fight a Visible squad again, and the Visible squad is the only one
 * anybody can choose to attack. The cap keeps both zones live.
 */
export const AMBUSH_CAP = 90;

export const AMBUSH_FLOOR = 0;

/**
 * **`+2%` per consecutive win, capped at 90%** (FR-015).
 *
 * Clamped rather than assumed: 45 wins reaches exactly the cap and a 46th must
 * not exceed it. A streak long enough to matter is not hypothetical — it is what
 * a strong player on a good run has by the end of a session.
 */
export function ambushChance(attackStreak: number): number {
  if (!Number.isFinite(attackStreak) || attackStreak <= 0) return AMBUSH_FLOOR;
  return Math.min(AMBUSH_CAP, Math.floor(attackStreak) * AMBUSH_PER_WIN);
}

/** The streak at which the cap is first reached — 45. Derived, never written down twice. */
export const AMBUSH_CAP_AT = AMBUSH_CAP / AMBUSH_PER_WIN;

export interface StreakOutcome {
  readonly attackStreak: number;
  readonly ambushChance: number;
}

/**
 * How an attack resolves into the streak.
 *
 * **An ambushed loss does not reset the attack streak** (SC-005). The player did
 * not choose that fight — the ambush chose them, and it is a *harder* fight
 * because Hidden squads pay more. Resetting on it would mean the reward for a
 * long streak is that the streak ends, and the correct play would be to stop
 * attacking near the cap.
 *
 * **A chosen loss does reset it**, because that one is a fight they picked.
 */
export function nextAttackStreak(
  current: number,
  outcome: 'win' | 'loss',
  wasAmbush: boolean,
): StreakOutcome {
  const next = outcome === 'win' ? current + 1 : wasAmbush ? current : 0;
  return { attackStreak: next, ambushChance: ambushChance(next) };
}

/**
 * Everything the client is allowed to know about these numbers, in one object
 * so that adding a constant means adding it here and nowhere else.
 */
export interface AmbushConfig {
  readonly perWin: number;
  readonly cap: number;
  readonly capAt: number;
}

export const ambushConfig = (): AmbushConfig => ({
  perWin: AMBUSH_PER_WIN,
  cap: AMBUSH_CAP,
  capAt: AMBUSH_CAP_AT,
});
