/**
 * Hiding a round trip (007 T031–T034, FR-018 to FR-020).
 *
 * ### The problem this exists for
 *
 * Gameplay is server-authoritative, so **every action costs a round trip** and
 * there is no version of this game where it does not. Whether that reads as
 * responsive or as sluggish is decided entirely here — not by making the server
 * faster, but by choosing what the player is looking at while it answers.
 *
 * ### The wind-up starts on the click, and the request goes with it
 *
 * Both in the same handler, in that order, synchronously. The naive version
 * awaits the response and *then* animates, which spends the round trip on a
 * frozen screen and then plays an animation the player is now waiting through
 * twice over. Starting the wind-up first spends the round trip on motion the
 * player was going to watch anyway.
 *
 * ### The wait point is a held pose, not a frozen frame
 *
 * If the response has not arrived by the time the wind-up finishes, the phase
 * becomes `holding` — a deliberate, stable state the screen can render as a
 * champion at the top of its swing. **Stalling mid-motion is what reads as a
 * bug**; a held pose reads as anticipation, and the difference is entirely
 * whether the stall happens at a point the animation was designed to reach.
 *
 * ### The server's version is what gets shown, always
 *
 * Nothing here predicts an outcome. The wind-up is *motion*, not a guess at
 * damage — so there is no optimistic number that could disagree with the
 * server's. When the packet lands its `state` is applied whole, and it is the
 * only thing the board is ever drawn from. That makes FR-020 true by
 * construction rather than by a reconciliation step that has to be got right.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import type { ActResponse, ActionIntent, ActionPacket, TurnEvent } from './types.js';

/**
 * **How long the wind-up runs before it wants an answer.**
 *
 * Long enough that a healthy round trip finishes inside it — the measured API
 * takes ~70ms per request — and short enough that it never feels like padding.
 * A player on a good connection should never reach `holding` at all.
 */
export const WIND_UP_MS = 220;

/** The pace one folded turn plays at once the packet has landed. */
export const BEAT_MS = 320;

export type IntentPhase =
  | { readonly kind: 'idle' }
  /** Animating, request in flight. The state the player spends the round trip in. */
  | { readonly kind: 'winding'; readonly intent: ActionIntent }
  /** The wind-up finished first. A held pose, not a stalled one. */
  | { readonly kind: 'holding'; readonly intent: ActionIntent }
  /** Walking the packet's turns at the client's own pace, never the network's. */
  | {
      readonly kind: 'playing';
      readonly event: TurnEvent;
      readonly index: number;
      readonly total: number;
    };

export interface UseIntentOptions {
  readonly battleId: string;
  /** The packet, once it has finished playing. The board is drawn from this. */
  readonly onResolved: (packet: ActionPacket, nextSequence: number) => void;
  readonly onFailed: (err: unknown) => void;
  readonly windUpMs?: number;
  readonly beatMs?: number;
}

export interface UseIntent {
  readonly phase: IntentPhase;
  /** True while an action is anywhere in flight. One at a time. */
  readonly busy: boolean;
  readonly commit: (intent: ActionIntent) => void;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function useIntent({
  battleId,
  onResolved,
  onFailed,
  windUpMs = WIND_UP_MS,
  beatMs = BEAT_MS,
}: UseIntentOptions): UseIntent {
  const [phase, setPhase] = useState<IntentPhase>({ kind: 'idle' });

  /**
   * **Guards every `setPhase` after an await.** A player who leaves mid-packet
   * unmounts this, and the server has already resolved everything — so there is
   * nothing to finish and nothing to lose. Writing state into a dead component
   * would only produce a warning and a leak.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * `busy` is a ref as well as derived state, because the guard has to be read
   * **synchronously inside the click handler** — two fast clicks land in the
   * same React batch, and a check against `phase` would see `idle` twice and
   * send two actions at the same sequence.
   */
  const inFlight = useRef(false);

  const commit = useCallback(
    (intent: ActionIntent) => {
      if (inFlight.current) return;
      inFlight.current = true;

      /**
       * **These two lines are the feature.** The phase change is synchronous
       * inside the handler, so the wind-up is on screen in the same frame as
       * the click; the request leaves in the same tick. Neither waits for the
       * other, and reversing them would spend the whole round trip on a
       * motionless screen.
       */
      setPhase({ kind: 'winding', intent });
      const request = api<ActResponse>(`/battles/${battleId}/act`, {
        method: 'POST',
        body: JSON.stringify(intent),
      });

      void (async () => {
        let landed: ActResponse | null = null;
        let failure: unknown = null;

        /**
         * **The response is raced against the wind-up, not awaited before it.**
         * `settled` is what lets the wait point know whether it is a wait at
         * all — on a healthy connection this resolves long before the timer and
         * the player never sees `holding`.
         */
        let settled = false;
        const tracked = request.then(
          (res) => {
            settled = true;
            landed = res;
          },
          (err: unknown) => {
            settled = true;
            failure = err;
          },
        );

        await wait(windUpMs);

        if (!settled && alive.current) {
          // The natural wait point: the top of the swing, held.
          setPhase({ kind: 'holding', intent });
        }

        await tracked;

        if (!alive.current) {
          inFlight.current = false;
          return;
        }

        if (failure !== null || landed === null) {
          setPhase({ kind: 'idle' });
          inFlight.current = false;
          onFailed(failure);
          return;
        }

        const response: ActResponse = landed;

        /**
         * **The packet plays out locally, at the client's pace.** Every turn in
         * it is already resolved, so nothing here touches the network — which
         * is what FR-019 asks for and also why a player who alt-tabs through
         * the whole sequence loses nothing.
         */
        const { events } = response.packet;

        for (const [index, event] of events.entries()) {
          if (!alive.current) break;
          setPhase({ kind: 'playing', event, index, total: events.length });
          await wait(beatMs);
        }

        if (!alive.current) {
          inFlight.current = false;
          return;
        }

        setPhase({ kind: 'idle' });
        inFlight.current = false;

        /**
         * **The board is drawn from `packet.state` and from nothing else**
         * (FR-020). No local arithmetic ran, so there is no optimistic value to
         * reconcile against — the server's version is the only version there
         * has ever been.
         */
        onResolved(response.packet, response.nextSequence);
      })();
    },
    [battleId, beatMs, onFailed, onResolved, windUpMs],
  );

  return { phase, busy: phase.kind !== 'idle', commit };
}
