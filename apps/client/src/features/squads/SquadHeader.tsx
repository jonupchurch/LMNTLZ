/**
 * The squad selector and the action row (019 US2).
 *
 * ### Two levels of control, one piece of state
 *
 * The design draws a mode — `THE STRIKING SIX` / `THE STANDING SIX` — above
 * numbered chips, and the screen it sits on deliberately keeps **one**
 * discriminant across all five squads. Those are not in conflict: the mode is
 * *derived* from which squad is open, and a mode pill sets `editing` to that
 * mode's first squad.
 *
 * The alternative — a `mode` state beside a `selection` state — has a
 * combination that means nothing (attack mode, zone selected) and two pieces of
 * state that have to agree. Deriving costs one line and cannot desynchronise.
 *
 * ### The primary action is not the same verb on both sides
 *
 * `03-squad-builder.md`: *"A clear primary action: 'Find Battle' (from an
 * attack squad) or 'Set as Defense.'"* On offense, saving and fighting are two
 * different intentions and both are offered. On defense there is nothing to
 * fight — setting the zone **is** the save, so there is one button and it says
 * what it does.
 */

import type { JSX } from 'react';
import { Button } from '../../components/index.js';
import type { RosterResponse, Zone } from './types.js';

/** Which squad the builder is editing: a defense zone, or an attack slot. */
export type Editing = Zone | number;

export const isAttack = (editing: Editing): editing is number => typeof editing === 'number';

const ZONE_LABEL: Readonly<Record<Zone, string>> = { visible: 'Zone I', hidden: 'Zone II' };
const ATTACK_SLOTS = [0, 1, 2] as const;
const ROMAN = ['I', 'II', 'III'] as const;

export const labelOf = (editing: Editing): string =>
  isAttack(editing) ? `Attack ${editing + 1}` : ZONE_LABEL[editing];

export interface SquadHeaderProps {
  readonly roster: RosterResponse;
  readonly editing: Editing;
  readonly onEdit: (next: Editing) => void;
  readonly placed: number;
  readonly isComplete: boolean;
  readonly saving: boolean;
  readonly name: string;
  readonly onName: (next: string) => void;
  readonly onSave: () => void;
  readonly onClear: () => void;
  /** Offense only — see `SquadsScreen`'s `autoFill` for why. */
  readonly onAutoFill?: (() => void) | undefined;
  readonly onFindBattle?: (() => void) | undefined;
}

export function SquadHeader({
  roster,
  editing,
  onEdit,
  placed,
  isComplete,
  saving,
  name,
  onName,
  onSave,
  onClear,
  onAutoFill,
  onFindBattle,
}: SquadHeaderProps): JSX.Element {
  const attacking = isAttack(editing);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* --- the mode --------------------------------------------------- */}
        <div role="tablist" aria-label="Squad kind" className="flex gap-1.5">
          <ModePill on={attacking} label="The Striking Six" onSelect={() => onEdit(0)} />
          <ModePill
            on={!attacking}
            label="The Standing Six"
            onSelect={() => onEdit('visible')}
          />
        </div>

        {/* --- which one -------------------------------------------------- */}
        <div role="tablist" aria-label="Squad" className="flex gap-1.5">
          {attacking
            ? ATTACK_SLOTS.map((slot) => {
                const squad = roster.assignments.offense.find((o) => o.slot === slot);
                /**
                 * **"Broken" and "unfinished" are different states and both are
                 * shown.** A squad our own eviction rule emptied a seat in did
                 * not get that way through anything the player did deliberately,
                 * and it cannot attack until it is refilled — so it says so
                 * rather than reading as a squad nobody has got round to.
                 */
                const seated = squad?.seats.length ?? 0;
                const broken = squad !== undefined && seated > 0 && !squad.valid;
                return (
                  <Chip
                    key={slot}
                    on={editing === slot}
                    roman={ROMAN[slot]!}
                    detail={`${seated}/6`}
                    danger={broken}
                    label={`Attack ${slot + 1}${squad?.name ? `, ${squad.name}` : ''}, ${
                      seated === 0
                        ? 'empty'
                        : broken
                          ? 'broken'
                          : seated === 6
                            ? 'ready'
                            : `${seated} of 6`
                    }`}
                    onSelect={() => onEdit(slot)}
                  />
                );
              })
            : (['visible', 'hidden'] as const).map((zone, index) => (
                <Chip
                  key={zone}
                  on={editing === zone}
                  roman={ROMAN[index]!}
                  detail={`hold ${roster.assignments.defense[zone].holdStreak}`}
                  danger={!roster.assignments.defense[zone].canDefend}
                  /**
                   * **Explicit, because the computed name runs the words
                   * together.** The label and the streak are adjacent elements
                   * with no whitespace between them, so the name computed from
                   * the content is `"Zone Ihold 14"` — announced as one nonsense
                   * word. Caught by an e2e locator failing to match.
                   */
                  label={`${ZONE_LABEL[zone]}, hold streak ${roster.assignments.defense[zone].holdStreak}`}
                  onSelect={() => onEdit(zone)}
                />
              ))}
        </div>

        {/* --- its name --------------------------------------------------- */}
        {attacking ? (
          <label className="min-w-0 flex-1">
            <span className="sr-only">Squad name</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder={`Attack ${editing + 1}`}
              onChange={(e) => onName(e.target.value)}
              className="text-h3 w-full min-w-0 border-b border-line bg-transparent px-1 py-0.5 font-display text-parchment placeholder:text-decor focus:border-gold focus:outline-none"
            />
          </label>
        ) : (
          <p className="text-h3 min-w-0 flex-1 px-1 font-display text-parchment">
            {ZONE_LABEL[editing]} · {editing === 'visible' ? 'scoutable' : 'never shown'}
          </p>
        )}

        {/* --- what you can do about it ----------------------------------- */}
        <p className="text-caption font-mono tabular-nums text-faint">
          <span className={placed === 6 ? 'text-gold' : 'text-parchment'}>{placed}</span> / 6 placed
        </p>

        {onAutoFill ? (
          <Button variant="ghost" size="sm" onClick={onAutoFill}>
            Auto-fill
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>

        {/**
         * `state`, not `disabled` — `Button` owns the disabled *appearance* as
         * well as the attribute, and `loading` greys nothing because by then
         * the player has already committed.
         *
         * **Each carries an accessible name that says which squad**, because
         * "Save" alone is unusable out of context and there are five of them.
         * The name *contains* the visible label in both cases, which is the
         * rule (WCAG 2.5.3) — `Save` inside `Save Attack 1`, `Set as defense`
         * inside `Set as defense, Zone I`.
         */}
        {attacking ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Save ${labelOf(editing)}`}
              state={saving ? 'loading' : isComplete ? 'rest' : 'disabled'}
              onClick={onSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {onFindBattle ? (
              <Button
                variant="primary"
                size="sm"
                state={isComplete ? 'rest' : 'disabled'}
                onClick={onFindBattle}
              >
                Find battle
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            aria-label={`Set as defense, ${labelOf(editing)}`}
            state={saving ? 'loading' : isComplete ? 'rest' : 'disabled'}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Set as defense'}
          </Button>
        )}
      </div>

      {/**
       * The 12/15 split, stated once. It is why the three attack squads
       * overlap, and no per-squad message conveys it.
       */}
      <p className="text-caption text-faint">
        {attacking
          ? 'Up to three Striking Six, saved and swapped per matchup. You command these on offense; reach decides who can act on turn one, and the back seat cannot attack while your lines hold.'
          : 'Two zones the engine runs for you. The Visible six is the only squad anyone can choose to attack; the Hidden six is reached by ambush alone, and pays more. Editing either resets its hold streak.'}
      </p>
    </div>
  );
}

function ModePill({
  on,
  label,
  onSelect,
}: {
  readonly on: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onSelect}
      className={[
        'text-caption rounded px-3 py-1.5 font-display tracking-widest uppercase transition-colors duration-(--duration-fast)',
        on
          ? 'bg-linear-[140deg] from-gold to-crush font-semibold text-void shadow-(--shadow-glow-gold)'
          : 'border border-line text-faint hover:text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function Chip({
  on,
  roman,
  detail,
  danger,
  label,
  onSelect,
}: {
  readonly on: boolean;
  readonly roman: string;
  readonly detail: string;
  readonly danger: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      aria-label={label}
      onClick={onSelect}
      className={[
        'text-caption flex items-baseline gap-1.5 rounded border px-2.5 py-1.5 font-mono uppercase transition-colors duration-(--duration-fast)',
        on
          ? 'border-gold bg-raised text-gold shadow-(--shadow-glow-gold)'
          : 'border-line text-faint hover:text-muted',
      ].join(' ')}
    >
      <span className="font-display tracking-widest">{roman}</span>
      <span className={danger ? 'text-slash-lit' : on ? 'text-parchment' : ''}>{detail}</span>
    </button>
  );
}
