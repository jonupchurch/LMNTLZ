/**
 * The forty passives, and what each one does.
 *
 * ### Why this file exists
 *
 * A hero's `passives` field is a tuple of three **bare strings** — no scope, no effect,
 * nothing a screen can render beyond the name. `03-powers.md` has carried the meanings
 * since the mechanics were settled, and nothing had ever brought them into content, so
 * every surface that showed a passive showed a name and stopped.
 *
 * ### The three slots are structural, not a convention
 *
 * Checked against all 27 heroes: slot 0 holds one of **4 role** passives, slot 1 one of
 * **9 house** passives — exactly one per primary Force — and slot 2 a **unique**, 27
 * distinct. That is `03-powers.md`'s own table (4 · 9 · 27 = 40 distinct across 81
 * slots), and `passives.test.ts` asserts it rather than trusting it.
 *
 * > The real complexity is lower than 40 suggests: a player learns 4 role rules and 9
 * > House rules once and reuses them across the whole roster.
 *
 * ### ⚠️ Twenty-two effects are `null`, and that is the honest state
 *
 * `03-powers.md` gives all four role effects in a table and all nine house effects in
 * prose. Of the 27 uniques it describes **five** — the ones with hook mechanics that
 * other rules depend on. The remaining twenty-two are named in the roster and have no
 * authored effect anywhere in the project.
 *
 * **They are `null` rather than invented.** `CLAUDE.md` is explicit that the rules live
 * in `resources/mechanics/` and that a screen is never a source of them; writing effect
 * text here to fill a panel would create a second source for 22 unwritten design
 * decisions, and the first person to author them for real would find this file already
 * disagreeing. A surface that says *not yet specified* is telling the truth about a
 * game whose passives, per `06-progression.md`, **run nowhere yet**.
 */

import type { DamageType } from './types.js';

export const PASSIVE_SCOPES = Object.freeze(['role', 'house', 'unique'] as const);
export type PassiveScope = (typeof PASSIVE_SCOPES)[number];

export interface Passive {
  readonly name: string;
  readonly scope: PassiveScope;
  /**
   * What it does, in the words of `03-powers.md`.
   *
   * **`null` means unwritten, never "nothing".** See the note above — a passive with no
   * authored effect is an authoring gap, and a reader must be able to tell that apart
   * from a passive that deliberately does nothing.
   */
  readonly effect: string | null;
  /** The role it marks, the Force whose signature it is, or `null` for a unique. */
  readonly belongsTo: string | null;
}

/**
 * **Role passives** — `03-powers.md`, and the only four in the game.
 *
 * > Until now `Role` had no mechanical existence at all — it set the stat budgets and
 * > then vanished. These give it teeth.
 *
 * Tanks and Buffers counter each other by consequence rather than design: taunt and
 * fade cancel on the same hero, so fading a tank switches its taunt off and taunting a
 * buffer drags it into the open.
 */
const ROLE: readonly Passive[] = [
  { name: 'Finish It', scope: 'role', belongsTo: 'striker', effect: 'Bonus damage below half pool.' },
  { name: 'Hold the Line', scope: 'role', belongsTo: 'tank', effect: 'Row-scoped taunt. Bounded to the tank’s own row, so it never locks down the board — and an attacker that cannot reach the tank chooses freely.' },
  { name: 'Measured Shot', scope: 'role', belongsTo: 'ranged', effect: 'Bonus damage at distance 2.' },
  { name: 'Behind the Line', scope: 'role', belongsTo: 'buffer', effect: 'Permanent fade. Self-limiting: once the buffer is the only thing an attacker can reach, the filter would empty the candidate set and is ignored.' },
];

/**
 * **House passives** — one per primary Force, each that Force's signature.
 *
 * *Nothing Stays Hidden* is the one that matters structurally: it is the only passive
 * that reaches into the targeting pipeline, and it makes Light the answer to a
 * fade-heavy squad.
 */
const HOUSE: ReadonlyArray<Passive & { readonly belongsTo: DamageType }> = [
  { name: 'The Deep Holds', scope: 'house', belongsTo: 'earth', effect: 'Shortens control effects on itself.' },
  { name: 'Never Where You Struck', scope: 'house', belongsTo: 'air', effect: 'Gains Agility after being missed.' },
  { name: 'It Catches', scope: 'house', belongsTo: 'fire', effect: 'Burns escalate per tick.' },
  { name: 'Wears Through', scope: 'house', belongsTo: 'water', effect: 'Mitigation shreds persist.' },
  { name: 'Nothing Stays Hidden', scope: 'house', belongsTo: 'light', effect: 'Ignores fade — a faded enemy is targetable without clearing the unfaded heroes first. The only passive that reaches into targeting, and what makes Light the answer to a fade-heavy squad.' },
  { name: 'The Veil Closes', scope: 'house', belongsTo: 'dark', effect: 'Feeds on nearby deaths.' },
  { name: 'The Cut Reopens', scope: 'house', belongsTo: 'slash', effect: 'Bleeds on crit.' },
  { name: 'Find the Seam', scope: 'house', belongsTo: 'pierce', effect: 'Sharpens against a repeat target.' },
  { name: 'Nothing Holds', scope: 'house', belongsTo: 'crush', effect: 'Shaves Armor cumulatively.' },
];

/**
 * **Unique passives** — 27 conditional triggers, one per hero.
 *
 * Five have authored effects because other rules depend on them; the rest are named and
 * unwritten. See the file header for why they are not filled in here.
 *
 * *It All Comes Back* is the roster's only stacking resource and has exactly one
 * source, stated on the generator: the passive banks Reckoning, tier 4 reads it without
 * consuming, tier 5 spends it.
 */
const UNIQUE_EFFECTS: Readonly<Record<string, string>> = {
  /* --- 03-powers.md, the five hook mechanics other rules depend on ----------- */
  Immovable: 'Cannot be compelled by taunt.',
  'Already Gone': 'Cannot be the target of a reactive power.',
  'Nothing to Discuss': 'Denies reactions to anyone this hero damages.',
  "The Duelist's Habit":
    'Gains damage against a target it has not yet struck — the exact inverse of It All Comes Back.',
  'It All Comes Back':
    'Adds a Reckoning stack to a target each time this hero damages it. Tier 4 reads the stacks without consuming them; tier 5 spends every stack for a finishing burst.',

  /**
   * --- 05-status.md ---------------------------------------------------------
   *
   * ⚠️ **Found only on a second pass, and the first pass had already shipped.**
   * The initial catalog read `03-powers.md` alone and marked these unwritten, so the
   * roster drawer told a player *"effect not yet specified"* about three effects the
   * design had settled — one of which, Cindara's, `05-status.md` quotes as an example
   * while explaining the duration table.
   *
   * **A passive's spec is not all in one document.** `03-powers.md` owns the taxonomy;
   * the effects live wherever the mechanic they touch lives, which for these three is
   * the status system.
   */
  'Never Quite Out':
    'Her burns cannot be cleansed. They still expire — they cannot be removed early.',
  'Written in Pencil':
    'Her debuffs cannot be cleansed. They still expire — they cannot be removed early.',
  'Banked Coals':
    'Her effects last one turn longer — +1 turn on top of the tier’s duration, never added magnitude.',
};

/**
 * ⚠️ **Half-settled, and deliberately not given effect text.**
 *
 * `05-status.md`'s balance review fixes that Ossic's `The Bone Beneath` grants **`Magic
 * Resist` rather than `Armor`** — every arcane hero sits at the roster-minimum Armor 15,
 * so an Armor buff improved the stat they have least of *and* the one answering fewest
 * attacks. That settles the **stat**. It does not settle the trigger, the magnitude or
 * the duration, so there is no effect to state and the drawer correctly says so.
 *
 * Recorded here so the authoring pass starts from the constraint rather than
 * rediscovering it and picking `Armor`.
 */
export const PARTIALLY_SETTLED: Readonly<Record<string, string>> = {
  'The Bone Beneath': 'Must grant Magic Resist, not Armor (05-status.md).',
};

/** Every unique passive on the roster, in roster order. */
const UNIQUE_NAMES: readonly string[] = [
  'The Long Patience',
  'The Bone Beneath',
  'Something Green Returns',
  'Out of Reach',
  'Word Travels',
  'Gravity Is a Suggestion',
  'Never Quite Out',
  'Nothing Left to Take',
  'Banked Coals',
  'It All Comes Back',
  'Ground Yielded',
  'No Ripple',
  'Under Judgement',
  'Nothing Casts Twice',
  'Still Burning',
  'Merciful',
  'Written in Pencil',
  'The Ledger Kept',
  "The Duelist's Habit",
  'Confluence',
  'Room to Swing',
  'Seams Everywhere',
  'Already Gone',
  'First Guard',
  'No Warning',
  'Nothing to Discuss',
  'Immovable',
];

const UNIQUE: readonly Passive[] = UNIQUE_NAMES.map((name) => ({
  name,
  scope: 'unique' as const,
  belongsTo: null,
  effect: UNIQUE_EFFECTS[name] ?? null,
}));

export const PASSIVES: readonly Passive[] = Object.freeze([...ROLE, ...HOUSE, ...UNIQUE]);

const BY_NAME: ReadonlyMap<string, Passive> = new Map(PASSIVES.map((p) => [p.name, p]));

/**
 * One passive by name, or `undefined` if the roster names one this catalog does not
 * carry.
 *
 * **Undefined rather than a throw.** A hero panel that crashed because a passive was
 * renamed would take a whole screen down over a caption; `passives.test.ts` is what
 * makes the gap a build failure instead.
 */
export const getPassive = (name: string): Passive | undefined => BY_NAME.get(name);
