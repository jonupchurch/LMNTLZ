/**
 * The maintenance flag (007 T037, FR-015; feature 016 FR-001).
 *
 * ### Three states, because two are not enough
 *
 * | | new battles | battles in flight |
 * |---|---|---|
 * | `live` | accepted | resolve |
 * | `draining` | **`503`** | **`200` — they finish** |
 * | `down` | `503` | `503` |
 *
 * `draining` is the whole feature. A deploy that went straight from `live` to
 * `down` would kill every battle in progress, and each of those is a player
 * mid-fight who loses the attempt through no fault of their own — the exact
 * support ticket US4 exists to prevent. Draining costs one extra state and
 * empties the game on its own within the 24-hour expiry window.
 *
 * ### The source is behind an interface, and that is Constitution XIX
 *
 * Feature 016 will read this from Vercel Edge Config, which is the right home:
 * a maintenance window has to be changeable **without a deploy**, and the flag
 * that gates a deploy cannot itself require one. That feature does not exist
 * yet, so the default reader is the environment — and swapping it is
 * `setMaintenanceSource`, not an edit to every call site.
 *
 * **Read per request, never cached.** A cached flag is one that keeps accepting
 * battles for its TTL after an operator has closed the door, and the operator
 * has no way to tell. The read is a synchronous env lookup today and a
 * near-instant edge read later; neither is worth a cache that can be wrong.
 */

export const MAINTENANCE_STATES = ['live', 'draining', 'down'] as const;
export type MaintenanceState = (typeof MAINTENANCE_STATES)[number];

export type MaintenanceSource = () => Promise<MaintenanceState> | MaintenanceState;

/**
 * **Anything unrecognised is `live`, and that direction is deliberate.**
 *
 * The alternative — failing closed — means a typo in a config value, or an edge
 * read that returns `undefined` during a provider incident, takes the entire
 * game offline. Failing open means the same typo leaves the game running, which
 * is the state it was already in. An operator closing a window watches it take
 * effect; nobody watches a flag that was never set.
 */
export function parseMaintenance(raw: string | undefined | null): MaintenanceState {
  return (MAINTENANCE_STATES as readonly string[]).includes(raw ?? '')
    ? (raw as MaintenanceState)
    : 'live';
}

const fromEnvironment: MaintenanceSource = () => parseMaintenance(process.env['MAINTENANCE_STATE']);

let source: MaintenanceSource = fromEnvironment;

/** Point the flag at feature 016's Edge Config, or at a test's fixed value. */
export function setMaintenanceSource(next: MaintenanceSource | null): () => void {
  const previous = source;
  source = next ?? fromEnvironment;
  return () => {
    source = previous;
  };
}

export const maintenanceState = async (): Promise<MaintenanceState> => source();

/**
 * May a **new** battle start?
 *
 * Separate predicate from `canAct` rather than one function with a boolean,
 * because the two answers differ in exactly one state and that state is the
 * point of the feature. A single `isAvailable()` would have to be called with
 * an argument nobody would get wrong twice — and once is enough to make a
 * deploy window drop every battle in progress.
 */
export const canStartBattle = (state: MaintenanceState): boolean => state === 'live';

/** May an **open** battle take its next action? */
export const canAct = (state: MaintenanceState): boolean => state !== 'down';

export const MAINTENANCE_MESSAGE: Readonly<Record<Exclude<MaintenanceState, 'live'>, string>> =
  Object.freeze({
    draining:
      'The game is closing for maintenance, so no new battles can start. ' +
      'Any battle you already have open can still be finished.',
    down: 'The game is down for maintenance. Nothing you have open will be lost.',
  });
