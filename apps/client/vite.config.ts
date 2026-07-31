import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * **Port 5173 is not a default here, it is a registered value.**
 *
 * `http://localhost:5173` is one of three authorized JavaScript origins on the
 * Google OAuth client, and Google supports no wildcards. If Vite falls back to
 * another port because 5173 is busy, Google sign-in fails with an origin error
 * that says nothing useful. `strictPort` turns that into "port in use", which is
 * the actual problem.
 */
/**
 * The commit this bundle was built from, stamped in at build time.
 *
 * **Because "is it deployed?" has cost this project real time three times now.**
 * Twice a deploy was reported green that had never happened, and once the code
 * was verifiably live at the CDN while the browser in front of us showed the
 * previous build — and there was no way to tell those two apart from the
 * screen. A seven-character hash in the corner ends the argument in a glance:
 * if it does not match `git log -1`, the page is stale, full stop.
 *
 * `VERCEL_GIT_COMMIT_SHA` is injected by Vercel on every build. Locally there
 * is no commit to name — the bundle is whatever is on disk — so it says `dev`,
 * which is the honest answer rather than a stale hash pretending to be current.
 */
const BUILD_SHA = (process.env['VERCEL_GIT_COMMIT_SHA'] ?? '').slice(0, 7) || 'dev';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Steam ships this same bundle inside a shell that loads it from disk, so
    // every asset reference has to be relative rather than rooted at `/`.
    // Setting it now costs nothing; discovering it at packaging time costs a
    // rebuild of every path assumption in the app.
    assetsDir: 'assets',
    sourcemap: true,
  },
  base: './',
});
