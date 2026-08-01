/**
 * What the battle paid — the results half of
 * `LMNTLZ Matchmaking and Results.dc.html` (019, closing `specs/GAPS.md` §2c).
 *
 * ### Before this, a battle ended and said `Victory`
 *
 * That was the whole outcome screen: a word and the engine's `reason` string.
 * The server had meanwhile credited shards, moved both ratings and advanced the
 * attack streak that drives the ambush odds — **and discarded every one of those
 * numbers**, because `settleAndRecord` read one field of `settle()`'s result and
 * dropped the rest. A player could not tell a win worth 60 shards from one worth
 * 4, or notice their rating moving at all.
 *
 * ### What is drawn here, and what deliberately is not
 *
 * The export draws six regions. Four are buildable from what the server now
 * sends plus the final `BattleState`; two are not, and are left out rather than
 * faked:
 *
 * | Export region | Here |
 * |---|---|
 * | Victory/Defeat banner, rating delta, streak | ✅ from `settlement` |
 * | Squad recap — who survived, at what HP | ✅ from the final `state` |
 * | Rewards | ✅ shards, with the cap surfaced |
 * | Battle stats | ✅ turns, zone, survivors |
 * | **Damage dealt per champion** | ❌ needs the whole event history; a resumed battle has none |
 * | **"Your doors were read"** | ❌ needs damage-by-Force, same reason |
 * | **League progress bar** | ❌ needs the band thresholds, which are not on this wire |
 *
 * Per-hero damage is not a small omission and it is not an oversight: the client
 * sees one `ActionPacket` at a time, and a player who reloads mid-battle gets
 * the state without the log. Totalling it honestly means the **server**
 * accumulating it, which is a separate change.
 */

import { useMemo, type JSX } from 'react';
import { getHero, type HeroId } from '@lmntlz/content';
import type { BattleState, Conclusion } from '@lmntlz/sim/rules';
import { Button, HeroPortrait, Meter } from '../../components/index.js';
import { maxHpOf } from '../../components/hero/HeroCard.js';
import type { BattleSettlement } from './types.js';

export interface ResultScreenProps {
  readonly conclusion: Conclusion;
  readonly state: BattleState;
  /**
   * `undefined` when this client was not the one that settled the battle — a
   * resumed-and-already-finished fight, or a reload after the fact.
   *
   * **The screen still renders**, minus every number it would have to invent.
   * Showing zeroes would be worse than showing nothing: a capped-out player
   * genuinely earns 0, so `0 shards` is indistinguishable from *"we don't know"*.
   */
  readonly settlement?: BattleSettlement | undefined;
  readonly onAgain?: (() => void) | undefined;
  readonly onLeave?: (() => void) | undefined;
}

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function ResultScreen({
  conclusion,
  state,
  settlement,
  onAgain,
  onLeave,
}: ResultScreenProps): JSX.Element {
  /**
   * **Which side is the player's, read off the settlement rather than assumed.**
   *
   * `conclusion.winner` is always about the attacker. A defender being ambushed
   * is also looking at this screen, and for them `winner: 'defender'` is a win —
   * so the word at the top comes from `settlement.won` whenever it is known, and
   * falls back to the attacker's reading only when it is not.
   */
  const won = settlement?.won ?? conclusion.winner === 'attacker';

  const mine = useMemo(
    () => state.heroes.filter((h) => h.side === 'attacker'),
    [state.heroes],
  );
  const standing = mine.filter((h) => h.hp > 0).length;

  return (
    <section
      aria-label="Result"
      data-result={won ? 'victory' : 'defeat'}
      className="flex flex-col gap-3"
    >
      {/* --- the banner ---------------------------------------------------- */}
      <div
        className={`lz-surface p-6 ${won ? 'lz-bloom-gold' : 'lz-bloom-danger'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h2
              className={`text-display font-display tracking-[0.06em] uppercase ${
                won ? 'text-gold' : 'text-danger'
              }`}
            >
              {won ? 'Victory' : 'Defeat'}
            </h2>
            <p className="text-caption mt-2 font-mono tracking-wider text-faint uppercase">
              {/* Turns, never a clock — Constitution XIII. */}
              {conclusion.reason === 'wipe' ? 'By elimination' : 'On the turn cap'}
              {settlement ? ` · ${settlement.turnCount} hero-turns` : ''}
              {settlement?.zone === 'hidden' ? ' · Hidden zone' : ''}
            </p>

            {settlement ? (
              <p className="text-caption mt-3 font-mono text-muted">
                <span className="text-faint">Offense streak </span>
                <span className="text-parchment">{settlement.attackStreak}</span>
                {/*
                 * The streak is not decoration — it *is* the ambush chance, and
                 * this is the moment it changed. +2% per consecutive win, capped
                 * at 90%, which `CLAUDE.md` fixes and nothing here recomputes.
                 */}
                <span className="text-faint"> consecutive · drives your ambush odds</span>
              </p>
            ) : null}
          </div>

          {/*
           * **The exits live in the banner, beside the verdict** (Jon,
           * 2026-08-01). They used to be the last thing on the screen, below the
           * squad recap and both stat panels — about 390px further down, on a
           * screen that already starts below the fold at the 1280×720 floor.
           * The verdict is where a player's eye already is.
           *
           * They wrap to their own line when the banner is too narrow to hold
           * verdict, exits and rating in one row, which is the 1280 case.
           */}
          {onAgain || onLeave ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">
              {onAgain ? (
                <Button variant="primary" onClick={onAgain}>
                  Battle again
                </Button>
              ) : null}
              {onLeave ? (
                <Button variant="secondary" onClick={onLeave}>
                  Choose another target
                </Button>
              ) : null}
            </div>
          ) : null}

          {settlement ? (
            <div className="flex shrink-0 items-start gap-8">
              <div className="text-right">
                <p className="text-caption font-mono tracking-wider text-faint uppercase">
                  Rating
                </p>
                <p
                  className={`text-h1 font-mono font-bold ${
                    settlement.ratingDelta >= 0 ? 'text-earth-lit' : 'text-danger'
                  }`}
                >
                  {signed(settlement.ratingDelta)}
                </p>
                {/* before → after, so the number on the profile is explained
                    rather than merely asserted. */}
                <p className="text-caption font-mono text-muted">
                  {settlement.ratingBefore} → {settlement.ratingAfter}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* --- the squad recap --------------------------------------------- */}
        <div className="lz-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-caption font-mono tracking-widest text-faint uppercase">
              Your six
            </h3>
            <p className="text-caption font-mono text-muted">
              {standing} of {mine.length} still standing
            </p>
          </div>

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {mine.map((hero) => {
              const champion = getHero(hero.heroId);
              const max = maxHpOf(champion);
              const fell = hero.hp <= 0;
              return (
                <li
                  key={hero.instanceId}
                  data-recap={hero.heroId}
                  data-fell={fell ? 'yes' : 'no'}
                  className="lz-surface overflow-hidden"
                >
                  <span className={`relative block aspect-3/4 ${fell ? 'grayscale' : ''}`}>
                    <HeroPortrait
                      heroId={hero.heroId as HeroId}
                      force={champion.primary}
                      sizes="120px"
                      scrim
                      fill
                    />
                    {/* A fallen champion is dimmed AND labelled. Grayscale alone
                        is invisible to a colour-blind player and ambiguous to
                        everyone else — it could just be dark art. */}
                    {fell ? (
                      <span className="text-caption absolute inset-x-0 bottom-1 text-center font-mono tracking-wider text-danger uppercase">
                        Fell
                      </span>
                    ) : null}
                  </span>
                  <span className="block p-1.5">
                    <span className="text-caption block truncate font-display uppercase">
                      {champion.name}
                    </span>
                    <Meter value={Math.max(0, hero.hp)} max={max} tone={champion.primary} label="HP" bare />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* --- rewards and stats ------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <div className="lz-surface p-4">
            <h3 className="text-caption mb-3 font-mono tracking-widest text-faint uppercase">
              Rewards
            </h3>
            {settlement ? (
              <dl className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-body text-muted">Shards</dt>
                  <dd className="text-h3 font-mono font-bold text-gold">
                    {signed(settlement.shards)}
                  </dd>
                </div>
                {/*
                 * **The cap is surfaced, not silently applied.** "You earned 60,
                 * you banked 15" is information; a silent 15 reads as a nerf, and
                 * under the balance-upward rule a player mistaking a cap for a
                 * nerf is exactly the wrong impression to leave.
                 */}
                {settlement.cappedAt !== null && settlement.shardsEarned > settlement.shards ? (
                  <p className="text-caption text-crush-lit">
                    Earned {settlement.shardsEarned} — your daily cap of {settlement.cappedAt}{' '}
                    took the rest. It resets tomorrow.
                  </p>
                ) : null}
              </dl>
            ) : (
              <p className="text-caption leading-relaxed text-faint">
                This battle was already settled, so its rewards are not on this response. They are
                in your balance.
              </p>
            )}
          </div>

          <div className="lz-surface p-4">
            <h3 className="text-caption mb-3 font-mono tracking-widest text-faint uppercase">
              Battle
            </h3>
            <dl className="text-caption flex flex-col gap-1.5 font-mono">
              <Stat label="Hero-turns" value={settlement ? String(settlement.turnCount) : '—'} />
              <Stat label="Zone" value={settlement?.zone ?? '—'} />
              <Stat label="Survivors" value={`${standing} / ${mine.length}`} />
              <Stat
                label="Ended"
                value={conclusion.reason === 'wipe' ? 'elimination' : 'turn cap'}
              />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-faint uppercase">{label}</dt>
      <dd className="text-parchment">{value}</dd>
    </div>
  );
}
