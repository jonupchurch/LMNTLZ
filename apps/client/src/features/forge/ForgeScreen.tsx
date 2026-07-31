/**
 * The Rune Forge — **the game's entire permanent-progression system, and until
 * now no player could reach it** (018 US1).
 *
 * ### What was missing
 *
 * Feature 010 built runes end to end on the server: stages, costs, the 75 cap,
 * the destroy-on-replace transaction, gear score. It was tested, deployed, and
 * had **no screen and no task anywhere that would have created one**. Shards
 * were earned and there was nothing to spend them on, so gear score never moved
 * and every player stayed in Bronze forever.
 *
 * ### It reads two routes and re-reads both after every commit
 *
 * `GET /v1/me/runes` is new in this feature — nothing had ever read a rune back.
 * `GET /v1/me/shards` carries the balance **and** the economy config, which is
 * where every price and boost on this screen comes from.
 *
 * **After a commit it refetches rather than patching state from the response**
 * (T017, T018). The balance is a ledger *sum*, and gear score is recomputed
 * server-side from every placed rune; a screen that applied a delta it computed
 * itself would be right until the first time two things changed at once, and
 * then it would show a number that exists nowhere.
 */

import { getAllHeroes, type Hero, type HeroId, type StatKey } from '@lmntlz/content';
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Button, HeroIcon, Panel, TypeBadge } from '../../components/index.js';
import { api, ApiError } from '../../lib/api.js';
import { DestroyConfirm } from './DestroyConfirm.js';
import { SlotPlanner, placedPoints } from './SlotPlanner.js';
import { StageLadder } from './StageLadder.js';
import {
  RUNE_SLOTS,
  type OwnedHeroRunes,
  type RunesResponse,
  type RuneSlot,
  type ShardsResponse,
} from './types.js';

export interface ForgeScreenProps {
  readonly onUnauthenticated: () => void;
}

/** The export's `ALL 27 · OPEN · BARE`. */
type Filter = 'all' | 'open' | 'bare';

const SLOT_LABEL: Record<RuneSlot, string> = {
  primary: 'primary',
  secondary: 'secondary',
  common: 'common',
};

const empty = (heroId: string): OwnedHeroRunes => ({
  heroId,
  slots: RUNE_SLOTS.map((slot) => ({
    slot,
    element: null,
    stage: 0,
    allocations: {},
    utility: null,
    spent: 0,
  })),
});

export function ForgeScreen({ onUnauthenticated }: ForgeScreenProps): JSX.Element {
  const roster = useMemo(() => getAllHeroes(), []);

  const [runes, setRunes] = useState<RunesResponse | null>(null);
  const [shards, setShards] = useState<ShardsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [heroId, setHeroId] = useState<string>(roster[0]?.id ?? '');
  const [slot, setSlot] = useState<RuneSlot>('primary');
  const [draftStat, setDraftStat] = useState<StatKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  const unauthenticated = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthenticated();
        return true;
      }
      return false;
    },
    [onUnauthenticated],
  );

  /** **The wire.** Both routes together, so the balance and the runes agree. */
  const load = useCallback(async () => {
    try {
      const [runeState, shardState] = await Promise.all([
        api<RunesResponse>('/me/runes'),
        api<ShardsResponse>('/me/shards'),
      ]);
      setRunes(runeState);
      setShards(shardState);
      setError(null);
    } catch (err) {
      if (unauthenticated(err)) return;
      setError('Could not load the Forge.');
    }
  }, [unauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * `useCallback` rather than a plain function, so the memo below can depend on
   * it honestly instead of listing `runes` and hoping the two stay in step.
   */
  const forHero = useCallback(
    (id: string): OwnedHeroRunes => runes?.heroes.find((h) => h.heroId === id) ?? empty(id),
    [runes],
  );

  const shown = useMemo(
    () => {
      const needle = query.trim().toLowerCase();
      return roster.filter((hero) => {
        if (needle && !hero.name.toLowerCase().includes(needle)) return false;
        const state = forHero(hero.id);
        /* OPEN: something placed but not finished. BARE: nothing at all. */
        const placedStages = state.slots.reduce((sum, s) => sum + s.stage, 0);
        if (filter === 'bare') return placedStages === 0;
        if (filter === 'open') return placedStages > 0 && state.slots.some((s) => s.stage < 4);
        return true;
      });
    },
    [roster, query, filter, forHero],
  );

  const hero: Hero | undefined = roster.find((h) => h.id === heroId);
  const heroRunes = forHero(heroId);
  const current = heroRunes.slots.find((s) => s.slot === slot)!;
  const nextBoost = shards?.config.stageBoosts[current.stage] ?? 0;

  const commit = async (rebuild: boolean): Promise<void> => {
    if (!shards) return;
    setBusy(true);
    setError(null);

    try {
      await api(`/heroes/${heroId}/runes/${slot}`, {
        method: 'POST',
        body: JSON.stringify({
          /* Stage 4 buys the utility effect, so it allocates nothing. */
          allocations: nextBoost > 0 && draftStat ? { [draftStat]: nextBoost } : {},
          ...(rebuild ? { rebuild: true, confirmed: true } : {}),
        }),
      });

      setConfirming(false);
      setDraftStat(null);
      /* Refetch, never patch — see the note at the top of this file. */
      await load();
    } catch (err) {
      if (unauthenticated(err)) return;
      setError(
        err instanceof ApiError && err.status === 402
          ? 'That stage costs more shards than you hold.'
          : err instanceof ApiError && err.status === 409
            ? 'That slot holds a completed rune. Rebuilding destroys it.'
            : err instanceof ApiError && err.status === 422
              ? err.message
              : 'Could not commit that stage.',
      );
      if (err instanceof ApiError && err.status === 409) setConfirming(true);
    } finally {
      setBusy(false);
    }
  };

  if (!runes || !shards) {
    return (
      <Panel span={12}>
        <p role="status" className="text-faint">
          {error ?? 'Opening the Forge…'}
        </p>
      </Panel>
    );
  }

  return (
    <>
      {/* --- the hero list, 238px in the export ------------------------------ */}
      <Panel span={3}>
        <div className="flex flex-col gap-3 lz-surface p-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-display uppercase tracking-wide text-muted">
              Search champions
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded border border-line bg-void px-2 py-1 text-body text-parchment"
            />
          </label>

          <div className="flex gap-1" role="radiogroup" aria-label="Filter">
            {(
              [
                ['all', `All ${roster.length}`],
                ['open', 'Open'],
                ['bare', 'Bare'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter === value}
                onClick={() => setFilter(value)}
                className={[
                  'text-caption flex-1 rounded border py-1 font-mono uppercase',
                  filter === value
                    ? 'border-gold bg-raised shadow-(--shadow-glow-gold) text-parchment'
                    : 'border-line text-faint',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="flex max-h-128 flex-col gap-1 overflow-y-auto">
            {shown.map((h) => {
              const state = forHero(h.id);
              const stages = state.slots.reduce((sum, s) => sum + s.stage, 0);

              return (
                <li key={h.id}>
                  <button
                    type="button"
                    aria-pressed={h.id === heroId}
                    onClick={() => {
                      setHeroId(h.id);
                      setDraftStat(null);
                      setConfirming(false);
                    }}
                    className={[
                      'flex w-full items-center gap-2 rounded border px-2 py-1 text-left transition-colors',
                      h.id === heroId
                        ? 'border-gold bg-raised shadow-(--shadow-glow-gold)'
                        : 'border-line hover:border-faint',
                    ].join(' ')}
                  >
                    <HeroIcon heroId={h.id as HeroId} size="chip" />
                    <span className="min-w-0 flex-1">
                      <span className="text-caption block truncate font-display uppercase text-parchment">
                        {h.name}
                      </span>
                      <span className="text-caption block font-mono text-faint">
                        {stages === 0 ? 'bare' : `${stages} of 12 stages`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="text-caption p-2 font-mono text-faint">
                No champions match that filter.
              </li>
            )}
          </ul>
        </div>
      </Panel>

      {/* --- the slots and the stat line ------------------------------------ */}
      <Panel span={6}>
        {hero ? (
          <div className="flex flex-col gap-4">
            <header className="flex items-center gap-3">
              <HeroIcon heroId={hero.id as HeroId} name={hero.name} size="detail" />
              <div className="min-w-0 flex-1">
                <h1 className="text-h1 font-display uppercase tracking-wide">{hero.name}</h1>
                <p className="text-caption font-mono text-faint">
                  ◈ {heroRunes.slots.reduce((sum, s) => sum + s.spent, 0)} invested ·{' '}
                  {Object.keys(placedPoints(heroRunes)).length} stats raised
                </p>
              </div>
              <span className="flex shrink-0 gap-1">
                <TypeBadge type={hero.primary} size="sm" />
                <TypeBadge type={hero.secondary} size="sm" />
              </span>
            </header>

            <SlotPlanner
              hero={hero}
              runes={heroRunes}
              selected={slot}
              onSelect={(next) => {
                setSlot(next);
                setDraftStat(null);
                setConfirming(false);
              }}
              draftStat={draftStat}
              onDraft={setDraftStat}
              nextBoost={nextBoost}
            />
          </div>
        ) : null}
      </Panel>

      {/* --- the ledger, 412px in the export -------------------------------- */}
      <Panel span={3}>
        <div className="flex flex-col gap-4 lz-surface p-4">
          <h2 className="text-caption font-mono tracking-[0.2em] uppercase text-faint">
            {SLOT_LABEL[slot]} slot
          </h2>

          {confirming && hero ? (
            <DestroyConfirm
              heroName={hero.name}
              slotLabel={SLOT_LABEL[slot]}
              currentStage={current.stage}
              fullRuneCost={shards.config.fullRuneCost}
              spent={current.spent}
              onConfirm={() => void commit(true)}
              onCancel={() => {
                setConfirming(false);
                setError(null);
              }}
            />
          ) : (
            <StageLadder
              costs={shards.config.stageCosts}
              boosts={shards.config.stageBoosts}
              stage={current.stage}
              balance={shards.balance}
              onCommit={
                busy
                  ? undefined
                  : () => {
                      /* A stat is required for stages 1-3 and meaningless for 4. */
                      if (nextBoost > 0 && !draftStat) {
                        setError('Choose which stat this stage raises.');
                        return;
                      }
                      void commit(false);
                    }
              }
            />
          )}

          {current.stage >= 4 && !confirming && (
            /* 017's `Button` (T043). `danger` because it opens the one
               irreversible spend in the game. */
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              Rebuild this rune
            </Button>
          )}

          {error && (
            <p role="alert" className="text-caption font-mono text-slash-lit">
              {error}
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
