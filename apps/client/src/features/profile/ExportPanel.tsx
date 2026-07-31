/**
 * Take your data with you (012 T041).
 *
 * **A download nobody can trigger is not an export.** `GET /v1/me/export` was
 * built, tested against a 200-battle fixture and rate-limited, and until this
 * component existed nothing in the browser had ever requested it.
 *
 * It goes through `apiText` rather than a bare `fetch` so it shares the
 * renew-once rule with every other call. A hand-rolled fetch here would have
 * opted this one route out of renewal, and the symptom would have been an export
 * that failed for players whose session had just expired while everything else
 * recovered silently.
 */

import { useState, type JSX } from 'react';
import { ApiError, apiText } from '../../lib/api.js';

export function ExportPanel({
  onUnauthenticated,
}: {
  onUnauthenticated: () => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function download(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const csv = await apiText('/me/export');

      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'lmntlz-battles.csv';
      anchor.click();
      URL.revokeObjectURL(url);

      setMessage('Downloaded.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthenticated();
        return;
      }
      setMessage(
        error instanceof ApiError && error.status === 429
          ? 'Exports are limited. Try again in a minute.'
          : 'That export could not be produced.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading" className="text-h3 font-display tracking-widest text-faint uppercase">
        Your data
      </h2>
      <p className="mt-2 text-caption text-faint">
        Every battle you have fought, as a spreadsheet file. No squad
        compositions — not yours, not anyone&rsquo;s.
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="mt-3 rounded border border-line px-4 py-2 text-h3 font-display tracking-widest text-parchment uppercase disabled:text-faint"
      >
        {busy ? 'Preparing…' : 'Export my data'}
      </button>
      {message ? (
        <p role="status" className="mt-2 text-caption text-muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
