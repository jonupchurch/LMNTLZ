/**
 * Every number this feature turns on, in one place (013 T050).
 *
 * **The shape is decided; the values want a real population.** 14 days of master
 * inactivity and 7 days of grace are the two that most obviously need watching —
 * they were chosen to be *obviously* safe rather than tuned, because the failure
 * they guard against is a hostile takeover of somebody's guild while they are on
 * holiday, and that is not a mistake you correct after the fact.
 *
 * `env`-overridable rather than hard-coded so a support case can be answered
 * without a deploy, and so the succession tests can run the real numbers rather
 * than a shrunk copy — a test that shortens the window is a test of a different
 * feature. **The stored `completes_at` is what a live timer honours**, so changing
 * these cannot move a succession already in flight.
 */

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** FR-005 · SC-003. A **guild** fact. Three Wings of 8 is an event fact, deferred. */
export const GUILD_CAPACITY = 24;

/** FR-017. One master, and this many officers at most. */
export const MAX_OFFICERS = 3;

/** FR-001 · FR-023. One full rune, to found and to inherit. */
export const FOUNDING_COST_SHARDS = 650;

/** FR-008. Shown as a budget, never discovered as an error. */
export const MAX_CONCURRENT_APPLICATIONS = 5;

/** FR-009. */
export const APPLICATION_EXPIRY_DAYS = number('GUILD_APPLICATION_EXPIRY_DAYS', 7);

/** An invitation is an offer and goes stale the same way an application does. */
export const INVITE_EXPIRY_DAYS = number('GUILD_INVITE_EXPIRY_DAYS', 7);

/** FR-014. Long enough to be a signal, short enough not to be a punishment. */
export const REAPPLY_COOLDOWN_HOURS = number('GUILD_REAPPLY_COOLDOWN_HOURS', 24);

/** FR-020. How long a master must be gone before an officer may even ask. */
export const SUCCESSION_INACTIVE_DAYS = number('GUILD_SUCCESSION_INACTIVE_DAYS', 14);

/** FR-021. How long the master then has. **Presence is the reply.** */
export const SUCCESSION_GRACE_DAYS = number('GUILD_SUCCESSION_GRACE_DAYS', 7);

/**
 * FR-026 · SC-007. **A newborn guild is active regardless of headcount.**
 *
 * Part of the *definition* of activity, not an exception a caller applies — written
 * as an exception it would need special-casing at every site that reads activity,
 * and the one site that forgot would dissolve a guild on its first day.
 */
export const NEW_GUILD_GRACE_DAYS = 14;

/** FR-003. 36 icons (one blank) × 12 inks × 12 grounds = 5,184 emblems. */
export const EMBLEM_ICONS = 36;
export const EMBLEM_INKS = 12;
export const EMBLEM_GROUNDS = 12;

/** FR-007. Long enough for a real pitch, short enough to render in a list. */
export const MAX_PITCH_LENGTH = 500;
export const MAX_MOTD_LENGTH = 300;
export const MAX_APPLICATION_MESSAGE_LENGTH = 300;

/** Names are permanent, so the bounds are the ones we have to live with. */
export const MIN_GUILD_NAME_LENGTH = 3;
export const MAX_GUILD_NAME_LENGTH = 32;
