/**
 * The database handle. **One pool per process, created lazily.**
 *
 * ### Why the WebSocket driver and not the HTTP one
 *
 * `@neondatabase/serverless` ships two: `neon-http` is a single round trip per
 * query and cannot open a transaction, and `neon-serverless` is a `Pool` over
 * WebSockets that can. **Auth needs transactions in its very first feature** —
 * creating an account and its identity row must be atomic or a failed insert
 * leaves an account nobody can sign into, and killing a compromised token family
 * must be atomic or a racing renewal slips through mid-revocation.
 *
 * The HTTP driver is faster per query and would have been the obvious pick for a
 * read endpoint. It is the wrong default for the feature that owns identity.
 *
 * ### Pooled connection string, not direct
 *
 * Serverless functions scale to many short-lived instances, and each one holding
 * a direct Postgres connection exhausts Neon's limit long before traffic
 * justifies it. `DATABASE_URL` must be Neon's **pooled** string — the one with
 * `-pooler` in the host. `assertPooled` says so out loud rather than letting it
 * surface as intermittent connection errors under load, which is the shape this
 * mistake actually takes.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema/index.js';

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set. Copy .env.example to .env.local and paste ' +
        "Neon's POOLED connection string into it — the value never belongs in " +
        'a commit or a chat transcript.',
    );
    this.name = 'MissingDatabaseUrlError';
  }
}

/**
 * Neon's pooler hostnames carry `-pooler`. A direct string *works* in
 * development and fails under concurrency, which is the worst possible failure
 * schedule: it passes every test you write and breaks on the day it matters.
 */
export function assertPooled(url: string): void {
  if (!url.includes('-pooler')) {
    console.warn(
      '[db] DATABASE_URL does not look like a pooled Neon connection string ' +
        '(no "-pooler" in the host). A direct connection works in development ' +
        'and exhausts the connection limit under serverless concurrency.',
    );
  }
}

let pool: Pool | undefined;
let database: NeonDatabase<typeof schema> | undefined;

/**
 * Lazily built, and **module-level rather than per-request**, so that a warm
 * function instance reuses its pool instead of opening a socket per call.
 *
 * Lazy rather than eager because a module that connects on import makes every
 * test that touches this file need a database — including the ones that only
 * wanted a type.
 */
export function db(): NeonDatabase<typeof schema> {
  if (database) return database;

  const url = process.env['DATABASE_URL'];
  if (!url) throw new MissingDatabaseUrlError();
  assertPooled(url);

  // Node 22 ships a global WebSocket, which the driver picks up on its own. On
  // an older runtime this is where `ws` would be assigned to
  // `neonConfig.webSocketConstructor`; the engines field pins Node >= 22 so
  // that branch does not exist.
  neonConfig.poolQueryViaFetch = true;

  pool = new Pool({ connectionString: url });
  database = drizzle(pool, { schema });
  return database;
}

/** For tests and for a graceful shutdown. Safe to call when nothing is open. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
