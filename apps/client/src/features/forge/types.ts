/**
 * The Forge's wire types — **every number in them comes from the server**
 * (018 T013, FR-001).
 *
 * There is no `STAGE_COSTS` and no `STAGE_BOOSTS` in this feature. `150 · 150 ·
 * 150 · 200` and `+20 · +10 · +5` are economy decisions in
 * `06-progression.md`, they are served by `GET /v1/me/shards` under `config`,
 * and a screen that typed them out would be correct until the first tuning pass
 * and then quietly wrong — a price the player reads and a price they are charged
 * that disagree, with nothing to catch it because both compile.
 *
 * `STAT_CAP` is the one number imported rather than fetched, and from
 * `@lmntlz/content` rather than written down: it is a *content* rule (every stat
 * caps at 75) rather than an economy one, it is already in the bundle, and the
 * package exports it precisely so nothing has to say `75`.
 */

import type { StatKey } from '@lmntlz/content';

export const RUNE_SLOTS = ['primary', 'secondary', 'common'] as const;
export type RuneSlot = (typeof RUNE_SLOTS)[number];

/** `{ might: 20 }`. Absent keys are zero; the server validates the total. */
export type RuneAllocations = Partial<Record<StatKey, number>>;

export interface OwnedRuneSlot {
  readonly slot: RuneSlot;
  /** The damage type the slot accepts. `null` for `common`, which takes any. */
  readonly element: string | null;
  /** `0..4`. **`0` is empty** — not a stage zero. */
  readonly stage: number;
  readonly allocations: RuneAllocations;
  /** Stage 4 only; `null` below it. */
  readonly utility: string | null;
  readonly spent: number;
}

export interface OwnedHeroRunes {
  readonly heroId: string;
  readonly slots: readonly OwnedRuneSlot[];
}

export interface RunesResponse {
  readonly heroes: readonly OwnedHeroRunes[];
}

/**
 * The slice of `GET /v1/me/shards` the Forge needs.
 *
 * The balance is here rather than in a `useShards` of its own because the Forge
 * shows a price beside a balance on every control, and two requests that can
 * land out of order would let the screen render a balance that has already paid
 * for the stage the price is quoting.
 */
export interface ShardsResponse {
  readonly balance: number;
  readonly config: {
    /** `[150, 150, 150, 200]`. Indexed by stage − 1. */
    readonly stageCosts: readonly number[];
    /** `[20, 10, 5, 0]`. **Stage 4 grants no points** — it buys utility. */
    readonly stageBoosts: readonly number[];
    readonly fullRuneCost: number;
    /**
     * `0.8` — what melting a champion's runes returns.
     *
     * **Served, like every other economy number here.** The refund dialog shows
     * `80%` by rounding this, never by writing it: a typed percentage is a
     * second implementation of the rate, and the day it moves the screen quotes
     * one number while the server pays another.
     */
    readonly refundRate: number;
  };
}

/**
 * What a refund would destroy and what it returns — **computed by the server**
 * and delivered as the body of the `409` that refuses an unconfirmed melt.
 *
 * The refusal carrying the quote is what lets the dialog open populated. The
 * alternative is a second round trip whose answer can differ from the one the
 * confirm then acts on.
 */
export interface RefundQuote {
  readonly heroId: string;
  readonly slots: readonly {
    readonly slot: RuneSlot;
    readonly stage: number;
    /** What this rune's current stage cost — never lifetime spend on the slot. */
    readonly value: number;
    readonly allocations: RuneAllocations;
    readonly utility: string | null;
  }[];
  readonly invested: number;
  readonly refund: number;
  readonly rate: number;
}

/** The quote, plus what actually happened. */
export interface RefundResult extends RefundQuote {
  readonly balance: number;
  readonly gearScore: number;
  readonly destroyed: number;
}
