/**
 * `ConnectionState` and `MaintenanceNotice` (017 T030).
 *
 * The export's rule for this whole section, and it is the one worth keeping:
 * **never blame the player, always say what happened to their progress.**
 *
 * Three things follow from it:
 *
 * - **Latency is always visible in battle.** *"Players blame the server less
 *   when they can see it."* It costs one number and buys the difference
 *   between "the game is broken" and "the network is slow right now".
 * - **Reconnecting locks controls but does not grey them out.** The board stays
 *   readable while the socket retries — greying it out hides the position at
 *   the moment the player most wants to study it.
 * - **Maintenance blocks new battles before it blocks anything already
 *   started.** The drain banner appears at T−15m and counts down.
 */

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface ConnectionStateProps {
  readonly status: ConnectionStatus;
  readonly latencyMs?: number;
  /** Which retry we are on; the export shows "attempt 2 of 5". */
  readonly attempt?: number;
  readonly maxAttempts?: number;
}

const DOT: Record<ConnectionStatus, string> = {
  connected: 'bg-success',
  reconnecting: 'bg-warning animate-pulse',
  offline: 'bg-danger',
};

export function ConnectionState({
  status,
  latencyMs,
  attempt,
  maxAttempts,
}: ConnectionStateProps): React.JSX.Element {
  const label =
    status === 'connected'
      ? 'CONNECTED'
      : status === 'reconnecting'
        ? `RECONNECTING${attempt && maxAttempts ? ` · ATTEMPT ${attempt} OF ${maxAttempts}` : ''}`
        : 'OFFLINE';

  return (
    <span
      data-status={status}
      /* `polite`, not `assertive` — a reconnect notice must not interrupt a
         screen reader mid-sentence while the player is reading the board. */
      aria-live="polite"
      className="text-caption inline-flex items-center gap-2 font-display tracking-wide"
    >
      <span aria-hidden="true" className={`size-2 rounded-xl ${DOT[status]}`} />
      <span>{label}</span>
      {status === 'connected' && latencyMs !== undefined && (
        <span className="text-muted font-mono tabular-nums">{latencyMs}ms</span>
      )}

      {/**
       * ⚠️ **Nothing renders this component.** `App` builds a `Header` without
       * the `connection` prop, so `ConnectionState` has no caller outside its
       * own tests — the ninth seam-with-no-caller in this repo, and the reason
       * the running game has no `CONNECTED · 38ms` where every export draws
       * one. It needs a real status source, which is 014's socket.
       *
       * The build stamp deliberately does **not** live here for that reason.
       * It is in `Header`, which is always on screen. A diagnostic mounted
       * inside dead code is worse than no diagnostic: it reads as present.
       */}
    </span>
  );
}

export interface MaintenanceNoticeProps {
  /** Seconds until the courts close. Counted down by the caller, never here. */
  readonly secondsRemaining?: number;
  /** Full-screen recess rather than the drain banner. */
  readonly inRecess?: boolean;
}

const clock = (total: number): string => {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * *"THE COURTS ARE IN RECESS"* — the export's words, and the reassurance is
 * the substance: **nothing in the roster or ranking is affected.**
 *
 * No timer runs in here. The countdown is passed in, because a component that
 * ticks on its own keeps ticking after the server has already come back.
 */
export function MaintenanceNotice({
  secondsRemaining,
  inRecess = false,
}: MaintenanceNoticeProps): React.JSX.Element {
  if (inRecess) {
    return (
      <section
        data-state="recess"
        className="flex flex-col items-center gap-2 rounded-lg bg-surface p-6 text-center"
      >
        <h2 className="text-h1 font-display uppercase">The courts are in recess</h2>
        <p className="text-body text-muted">
          Scheduled maintenance. Nothing in your roster or ranking is affected — the wall stands
          while we work.
        </p>
      </section>
    );
  }

  return (
    <p
      data-state="draining"
      role="status"
      className="text-caption flex items-center gap-2 rounded-md bg-crush-deep px-3 py-2"
    >
      <span>
        The Courts close in{' '}
        <span className="font-mono tabular-nums">{clock(secondsRemaining ?? 0)}</span>. New battles
        are disabled.
      </span>
    </p>
  );
}
