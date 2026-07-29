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
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
