/**
 * Turning a hero's effects into the pips a player reads (020 US4, T044/T045).
 *
 * ### ⚠️ `turnsRemaining` is not a `number`, whatever the type says
 *
 * `StatusInstance.turnsRemaining` is typed `number` in `packages/sim`, and on the
 * server it always is. **On this side of the wire it can be `null`, from two
 * unrelated causes**, and this module is the first code in the project to read
 * the field:
 *
 * | Cause | Since |
 * |---|---|
 * | `PERMANENT` is `Infinity`, and `JSON.stringify(Infinity)` is `null` | US1 — every `Wears Through` shred and every passive mark |
 * | the server withheld it under the visibility rule | US4, `apps/api/src/battle/disclose.ts` |
 *
 * Both mean the same thing to a player — *a pip with no numeral* — which is
 * exactly what `resources/status-icons.md` draws for a rest-of-battle effect. So
 * {@link durationOf} collapses all three shapes (`number`, `Infinity`, `null`)
 * into one answer and nothing downstream has to know which it was.
 *
 * **Arithmetic on the raw field would have been the bug.** `turnsRemaining > 1`
 * is `false` for a permanent effect and `null + 1` is `1`; a row written against
 * the declared type would have rendered a permanent shred as "0 turns left" and
 * been wrong in a way that looks like a game rule.
 *
 * ### One pip per effect, not one per instance
 *
 * *"Different sources stack, the same source refreshes"* (`05-status.md`), so a
 * champion can carry three burns from three heroes. `status-icons.md` says that
 * is **one pip with a stack numeral**, not three pips — three would push a
 * champion's row past the width of its card, and the player's question is *"how
 * badly is it burning"* rather than *"who lit it"*.
 */

import { definitionOf, type StatusInstance } from '@lmntlz/sim/rules';
import { statusIconFor } from '../../components/icons/statusIcons.js';
import type { StatusIconKey } from '../../components/icons/icons.generated.js';

/**
 * A status as it actually arrives. The only difference from `StatusInstance` is
 * the one the wire imposes — see the note above.
 */
export type WireStatus = Omit<StatusInstance, 'turnsRemaining'> & {
  readonly turnsRemaining: number | null;
};

/**
 * Turns left, or `null` when there is no numeral to show.
 *
 * **`null` for permanent and `null` for withheld, deliberately indistinguishable.**
 * A client that could tell them apart would be able to tell a player *"this
 * enemy buff is timed, we just aren't allowed to say how long"* — which leaks the
 * one bit the rule exists to withhold.
 */
export function durationOf(status: WireStatus): number | null {
  const turns = status.turnsRemaining;
  if (turns === null || !Number.isFinite(turns)) return null;
  return turns;
}

/** One pip: an icon, how many of it, how long, and whether it can be lifted. */
export interface StatusGroup {
  readonly icon: StatusIconKey;
  readonly kind: StatusInstance['kind'];
  /** How many instances collapsed into this pip. `1` renders no badge. */
  readonly stacks: number;
  /** Turns left, or `null` for no numeral. */
  readonly duration: number | null;
  /** Any instance in the group cannot be cleansed, so the pip wears the seal. */
  readonly sealed: boolean;
  /**
   * What to call it out loud.
   *
   * ⚠️ **Not always the kind, and a burn is why.** `burn`, `bleed` and `poison`
   * all draw `status-dot`, because `StatusInstance` snapshots a magnitude and
   * deliberately *not* a Force — the type multiplier is already folded in, so the
   * pip cannot know whether it is fire or slash. Grouping on the icon therefore
   * merges them, and labelling the merged pip `burn` because a burn happened to
   * be first would be a plain untruth on a champion that is bleeding.
   *
   * So a mixed group is named for its family. A pure one keeps its own name.
   */
  readonly label: string;
}

/**
 * **Crowd control first, then damage over time, then everything else** —
 * `status-icons.md`, and it is a reading order rather than a preference. A stun
 * changes what a player can do this turn; a burn changes how long they have; a
 * +10 Agility changes a number. A row that sorted by application order would put
 * the most urgent fact wherever it happened to land.
 */
const FAMILY_RANK: Readonly<Record<string, number>> = {
  control: 0,
  'damage-over-time': 1,
  'mitigation-shred': 2,
  shield: 3,
  targeting: 4,
  reach: 5,
  'stat-modifier': 6,
  mark: 7,
};

/**
 * ⚠️ **A `mark` is bookkeeping and never draws a pip.**
 *
 * Four passives leave marks on every target they touch — `Find the Seam`,
 * `The Duelist's Habit`, `First Guard` and Reckoning — so by mid-battle almost
 * every champion carries several. They are counters, not effects: nothing about
 * a mark is a thing happening *to* the champion, and a row that showed them
 * would bury the stun under four pips that mean "has been hit before".
 *
 * Reckoning will want a display eventually, and it will want its own treatment
 * beside the hero rather than a status pip — `03-powers.md` calls it the
 * roster's only stacking *resource*.
 */
const HIDDEN_KINDS: ReadonlySet<string> = new Set(['mark']);

/**
 * Every pip a champion shows, in reading order.
 *
 * Grouped on the **icon** rather than the kind, because that is what a player
 * sees: a `+Might` buff and a `+Agility` buff are two different pips and must not
 * collapse into one, while a burn and a bleed from four sources are two pips with
 * counts.
 */
export function statusGroups(statuses: readonly WireStatus[]): readonly StatusGroup[] {
  const byIcon = new Map<StatusIconKey, StatusGroup>();

  for (const status of statuses) {
    if (HIDDEN_KINDS.has(status.kind)) continue;

    const icon = statusIconFor(status);
    const duration = durationOf(status);
    const found = byIcon.get(icon);

    if (!found) {
      byIcon.set(icon, {
        icon,
        kind: status.kind,
        stacks: 1,
        duration,
        sealed: !status.cleansable,
        label: status.kind,
      });
      continue;
    }

    byIcon.set(icon, {
      icon,
      kind: found.kind,
      /** Mixed kinds under one icon are named for what they have in common. */
      label:
        found.kind === status.kind ? found.label : definitionOf(found.kind).family.replaceAll('-', ' '),
      stacks: found.stacks + 1,
      /**
       * **The longest, and `null` swallows everything.**
       *
       * The player's question is *when am I clear of this*, which is the maximum
       * — and if any instance in the group has no disclosed duration, no honest
       * maximum exists. Reporting the largest *known* one would quietly promise
       * the effect ends then.
       */
      duration: found.duration === null || duration === null ? null : Math.max(found.duration, duration),
      sealed: found.sealed || !status.cleansable,
    });
  }

  return [...byIcon.values()].sort(
    (a, b) =>
      (FAMILY_RANK[definitionOf(a.kind).family] ?? 99) -
        (FAMILY_RANK[definitionOf(b.kind).family] ?? 99) ||
      (a.icon < b.icon ? -1 : a.icon > b.icon ? 1 : 0),
  );
}
