/**
 * Every table, in one place, so `drizzle(pool, { schema })` and `drizzle-kit`
 * see the same set.
 *
 * A table that exists but is not re-exported here is invisible to migration
 * generation — it typechecks, it queries, and `drizzle-kit generate` silently
 * omits it. Adding a file means adding a line here.
 */

export * from './accounts.js';
export * from './identities.js';
export * from './renewalTokens.js';
export * from './usernameChanges.js';
export * from './squads.js';
export * from './streaks.js';
export * from './battles.js';
export * from './battleRecords.js';
export * from './replayHolds.js';
export * from './ratings.js';
