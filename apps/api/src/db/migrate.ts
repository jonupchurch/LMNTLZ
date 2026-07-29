/**
 * Apply every pending migration in `drizzle/`, then exit.
 *
 * **Run deliberately, never on boot.** A serverless function that migrated on
 * cold start would run migrations concurrently across however many instances
 * scaled up at once, and the first symptom would be a deadlock during a traffic
 * spike. Drizzle takes an advisory lock, so that would probably *work* — but
 * "probably works under a lock we did not choose" is not how the accounts table
 * should be altered.
 *
 * ```
 * pnpm --filter @lmntlz/api db:migrate
 * ```
 */

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MissingDatabaseUrlError } from './client.js';

/**
 * **Migrations take the DIRECT connection, not the pooled one** — the opposite
 * of every other query in the project, and the reason Neon hands out two
 * strings rather than one.
 *
 * Neon's pooler is PgBouncer in **transaction** mode, where a connection is
 * handed back to the pool at the end of each transaction. Anything that expects
 * to outlive a transaction — a session-scoped advisory lock, a `SET` that
 * subsequent statements depend on, a prepared statement — silently stops
 * meaning what it says. A migration runner is precisely the kind of program
 * built on that assumption, and the failure mode is not a clean error: it is two
 * concurrent deploys both believing they hold the migration lock.
 *
 * Runtime queries are short, transaction-scoped and *want* the pooler. Migrations
 * are long, rare and run once. Different tools for different jobs.
 */
const url = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'];
if (!url) throw new MissingDatabaseUrlError();

if (!process.env['DATABASE_URL_UNPOOLED']) {
  console.warn(
    '[db] DATABASE_URL_UNPOOLED is not set, falling back to the pooled string. ' +
      "Neon's pooler is PgBouncer in transaction mode; migrations should use the " +
      'direct connection. Copy it from the Neon dashboard with pooling toggled OFF.',
  );
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const pool = new Pool({ connectionString: url });

try {
  console.log(`[db] applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(pool), { migrationsFolder });
  console.log('[db] up to date');
} finally {
  await pool.end();
}
