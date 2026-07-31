/**
 * `StatusPip` — the 71-icon status registry (017 T037).
 *
 * > ## ⚠️ THIS COMPONENT HAS NO PRODUCER, AND THAT IS DELIBERATE
 * >
 * > **Nothing in the codebase constructs a status.** `apps/api/src/battle/
 * > board.ts` hardcodes `statuses: []`, and no engine path writes one. So no
 * > screen in 017 renders a pip from live data, and T042 explicitly does **not**
 * > wire it — wiring it would create the exact defect this project keeps
 * > shipping, a component with no caller dressed up as working code.
 * >
 * > It exists because the design specifies it and 014/018 will use it. See
 * > `README.md` in this directory for why the registry's guard is **vacuous
 * > today** and what will make it start biting.
 *
 * `kind` is a plain `string` rather than a union because there is no authored
 * status vocabulary to build a union from. That is the honest type for now and
 * it is also the weak point: an unknown kind cannot be a compile error the way
 * a missing hero icon is. `icons.test.ts` carries an anti-vacuity guard (T041)
 * that fails the moment a vocabulary appears, so this cannot stay quietly
 * unchecked once there is something to check.
 */

import { STATUS_ICONS, type StatusIconKey } from './icons.generated.js';

export interface StatusPipProps {
  /**
   * The status's icon key. Typed on the registry, so the 71 keys that exist
   * are checked — what is *not* checked is whether the engine's eventual
   * status kinds map onto them.
   */
  readonly kind: StatusIconKey;
  /** Stack count. Rendered only when above 1 — "×1" is noise. */
  readonly stacks?: number;
  /** Sealed statuses cannot be cleansed; the export draws an overlay for it. */
  readonly sealed?: boolean;
}

export function StatusPip({ kind, stacks, sealed }: StatusPipProps): React.JSX.Element {
  return (
    <span
      className="relative inline-flex size-6 items-center justify-center"
      data-status-pip={kind}
      data-sealed={sealed || undefined}
    >
      <img src={STATUS_ICONS[kind]} alt={kind} className="size-6" draggable={false} />
      {sealed && (
        <img
          src={STATUS_ICONS['overlay-sealed']}
          alt="sealed"
          className="absolute inset-0 size-6"
          draggable={false}
        />
      )}
      {stacks !== undefined && stacks > 1 && (
        <span className="text-caption absolute -right-1 -bottom-1 font-mono tabular-nums">
          {stacks}
        </span>
      )}
    </span>
  );
}
