/**
 * `drizzle-kit` configuration — migration generation only.
 *
 * **Migrations are files in `drizzle/`, committed, and applied deliberately.**
 * `drizzle-kit push` is deliberately not wired up: it diffs the live database
 * against the schema and applies the difference with no artifact, so there is
 * nothing to review, nothing in history, and nothing to run again on a second
 * environment. That is fine for a scratch database and wrong for the one holding
 * accounts.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Read at generate/migrate time only. Everything else reaches the database
    // through `src/db/client.ts`.
    url: process.env['DATABASE_URL'] ?? '',
  },
  strict: true,
  verbose: true,
});
