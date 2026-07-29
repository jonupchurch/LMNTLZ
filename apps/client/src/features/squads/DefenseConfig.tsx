/**
 * Defense behaviour for one seated champion (T047, FR-021).
 *
 * ### Two targeting rules, not one
 *
 * **The fallback is the rule that usually fires.** A single role rule leaves the
 * target undefined 49–80% of the time — *"Buffers first"* finds no Buffer in
 * four turns out of five, because there are 3 Buffers among 27 champions. A menu
 * offering one rule would be a menu that mostly did nothing, and the player
 * would blame the AI rather than the menu.
 *
 * ### The third control appears only sometimes
 *
 * An ally rule is offered **only when the champion owns a friendly power**
 * (FR-004 of feature 004). Showing it greyed-out for everybody else would
 * suggest the choice exists and is unavailable; showing it live would let a
 * player set a healing preference on a champion who cannot heal, and then wonder
 * why it never happened.
 */

import type { Hero } from '@lmntlz/content';
import type { PowerRanking } from '@lmntlz/sim/rules';
import { FiringProfile } from './FiringProfile.js';

export interface SeatBehaviour {
  readonly targeting: readonly [string, string];
  readonly ranking: PowerRanking;
  readonly allyRule: string | null;
}

export interface DefenseConfigProps {
  readonly hero: Hero;
  readonly behaviour: SeatBehaviour;
  /** Served by the API — the client holds no menu of its own. */
  readonly targetRules: readonly string[];
  readonly allyRules: readonly string[];
  /** True when the champion owns at least one friendly power. */
  readonly needsAllyRule: boolean;
  readonly onChange: (next: SeatBehaviour) => void;
}

const label = (rule: string) => rule.replace(/-/g, ' ');

export function DefenseConfig({
  hero,
  behaviour,
  targetRules,
  allyRules,
  needsAllyRule,
  onChange,
}: DefenseConfigProps) {
  const setTargeting = (slot: 0 | 1, value: string) => {
    const next: [string, string] = [...behaviour.targeting] as [string, string];
    next[slot] = value;
    onChange({ ...behaviour, targeting: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded border border-line bg-surface p-4">
      <h4 className="font-display text-sm tracking-wide text-parchment">{hero.name}</h4>

      <label className="flex flex-col gap-1">
        <span className="font-display text-[11px] tracking-widest uppercase text-faint">
          Primary target
        </span>
        <select
          value={behaviour.targeting[0]}
          onChange={(e) => setTargeting(0, e.target.value)}
          className="rounded border border-line bg-void px-2 py-1 text-sm text-parchment"
        >
          {targetRules.map((rule) => (
            <option key={rule} value={rule}>
              {label(rule)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-display text-[11px] tracking-widest uppercase text-faint">
          Fallback target
        </span>
        {/* Not a secondary preference — the rule that fires most of the time. */}
        <select
          value={behaviour.targeting[1]}
          onChange={(e) => setTargeting(1, e.target.value)}
          className="rounded border border-line bg-void px-2 py-1 text-sm text-parchment"
        >
          {targetRules.map((rule) => (
            <option key={rule} value={rule}>
              {label(rule)}
            </option>
          ))}
        </select>
        <span className="font-mono text-[10px] text-faint">
          Used whenever the primary finds nobody — most turns.
        </span>
      </label>

      {needsAllyRule && (
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] tracking-widest uppercase text-faint">
            Ally priority
          </span>
          <select
            value={behaviour.allyRule ?? allyRules[0] ?? ''}
            onChange={(e) => onChange({ ...behaviour, allyRule: e.target.value })}
            className="rounded border border-line bg-void px-2 py-1 text-sm text-parchment"
          >
            {allyRules.map((rule) => (
              <option key={rule} value={rule}>
                {label(rule)}
              </option>
            ))}
          </select>
        </label>
      )}

      <FiringProfile hero={hero} ranking={behaviour.ranking} />
    </div>
  );
}
