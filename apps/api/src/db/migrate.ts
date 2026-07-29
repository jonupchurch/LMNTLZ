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
import { assertPooled, MissingDatabaseUrlError } from './client.js';

const url = process.env['DATABASE_URL'];
if (!url) throw new MissingDatabaseUrlError();
assertPooled(url);

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const pool = new Pool({ connectionString: url });

try {
  console.log(`[db] applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(pool), { migrationsFolder });
  console.log('[db] up to date');
} finally {
  await pool.end();
}
