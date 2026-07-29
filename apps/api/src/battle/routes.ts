/**
 * The battle routes (007 T001).
 *
 * ### Two properties shape every route in this file
 *
 * **In-progress state is never stored.** Each request replays the append-only
 * log, applies its action, and appends — so there is no state to fetch, expire
 * or reconcile, and none of these handlers may cache anything between calls.
 *
 * **The seed never leaves the server.** Constitution XII. The resynchronisation
 * route re-derives everything on each call and carries neither the seed nor the
 * draw indices; a serialiser here that forgets is the one bug that hands a
 * player the ability to predict every roll for the rest of the battle.
 *
 * Handlers arrive with their user stories — US2 (idempotency) first, because a
 * duplicated append silently corrupts every turn after it, and that has to be
 * impossible before anything is built on top of it.
 */

import { Hono } from 'hono';
import { requireSession } from '../auth/middleware.js';
import type { AuthedEnv } from '../auth/context.js';

export const battleRoutes = new Hono<AuthedEnv>();

/**
 * **Every battle route requires a session, with no exceptions to add later.**
 *
 * A battle belongs to an account: it is created by one, its rewards settle to
 * one, and its record is kept forever against one. There is no anonymous
 * variant of any of that, so the guard is declared once over the whole prefix
 * rather than per route — which is also what stops the next handler being added
 * without it.
 */
battleRoutes.use('/battles/*', requireSession);
