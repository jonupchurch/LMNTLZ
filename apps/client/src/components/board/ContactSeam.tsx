/**
 * `ContactSeam` — the mark between rows 3 and 4, where the two halves meet.
 *
 * ### Three screens drew this and none of them shared it
 *
 * `BattleBoard` and `SquadBuilder` each had a private copy, and 019's Codex
 * needed a third. All three are the export's same element: two vertical rules
 * fading out at both ends with a rotated word between them
 * (`linear-gradient(180deg,transparent,#F2C744,transparent)`, twice, in
 * `LMNTLZ Codex.dc.html` and `LMNTLZ Battle.dc.html` alike).
 *
 * The copies had already drifted — one said `contact`, one said `Contact line`,
 * one was gold and one was `line` — which is what a shared element looks like
 * shortly before the three stop resembling each other at all.
 *
 * ### It is the only mark on screen that says which way is toward the enemy
 *
 * The axis is absolute and not per-side (`AXIS_ROW_OF`): the attacker's numbers
 * ascend toward the enemy and the defender's ascend away from it. Rows 3 and 4
 * are therefore the pair that meet, and without this seam a board of six
 * numbered columns gives a player no way to see where the gap is.
 */

export type ContactSeamTone = 'gold' | 'line';

export interface ContactSeamProps {
  /**
   * `gold` where the seam is a *fact about the fight* — the battle board, the
   * Codex's diagram of the rule. `line` where it is a divider on a screen the
   * player is editing, so it does not compete with the seat they are dragging.
   */
  readonly tone?: ContactSeamTone;
  readonly label?: string;
  /**
   * Dashes the seam's own outline, the export's "this could hold something"
   * signal. Off by default: the battle board's seam holds nothing and never
   * will, and a dashed border there would promise a drop target.
   */
  readonly outlined?: boolean;
}

const RULE: Readonly<Record<ContactSeamTone, string>> = {
  gold: 'bg-linear-to-b from-transparent via-gold to-transparent',
  line: 'bg-linear-to-b from-transparent via-line to-transparent',
};

const TEXT: Readonly<Record<ContactSeamTone, string>> = {
  gold: 'text-gold',
  line: 'text-decor',
};

export function ContactSeam({
  tone = 'gold',
  label = 'contact',
  outlined = false,
}: ContactSeamProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      data-seam={tone}
      className={`flex flex-col items-center justify-center gap-2 self-stretch px-1.5 py-3 ${
        outlined ? 'lz-empty mx-0.5 w-7' : ''
      }`}
    >
      {/*
       * **2px, which is the export's own width, not 1.** This shipped as `w-px`
       * — inherited from the battle board's copy — and a screenshot of the Codex
       * showed why the export chose otherwise: beside a rotated label the rules
       * had barely any height left, and at one pixel they read as two specks
       * rather than a line running the length of the seam.
       */}
      <span className={`w-0.5 flex-1 ${RULE[tone]}`} />
      <span
        className={`text-caption font-mono tracking-widest uppercase [writing-mode:vertical-rl] ${TEXT[tone]}`}
      >
        {label}
      </span>
      <span className={`w-0.5 flex-1 ${RULE[tone]}`} />
    </div>
  );
}
