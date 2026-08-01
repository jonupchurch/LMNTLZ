import { Analytics } from '@vercel/analytics/react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { SiteFooter } from './components/SiteFooter.js';
import { SignInPanel } from './features/auth/SignInPanel.js';
import { AttackScreen } from './features/attack/AttackScreen.js';
import { BattleScreen } from './features/battle/BattleScreen.js';
import { ResumeBattle } from './features/battle/ResumeBattle.js';
import type { StartedBattle } from './features/battle/types.js';
import { ROSTER_SIZE } from '@lmntlz/content';
import { AppShell, Header, Rail, type RailEntry } from './components/index.js';
import { GalleryScreen } from './features/gallery/GalleryScreen.js';
import { LandingScreen } from './features/landing/LandingScreen.js';
import { CodexScreen } from './features/codex/CodexScreen.js';
import { ForgeScreen } from './features/forge/ForgeScreen.js';
import { StoreScreen } from './features/store/StoreScreen.js';
import { RosterScreen } from './features/roster/RosterScreen.js';
import { ProfileScreen } from './features/profile/ProfileScreen.js';
import { BattleListScreen } from './features/replays/BattleListScreen.js';
import { ReplayViewer } from './features/replays/ReplayViewer.js';
import type { BattleRole } from './features/replays/types.js';
import { GuildScreen } from './features/guilds/GuildScreen.js';
import { SquadsScreen } from './features/squads/SquadsScreen.js';
import { analyticsEnabled, scrubEvent } from './lib/analytics.js';
import {
  currentAccount,
  hasStoredSession,
  restore,
  signOut,
  type Account,
} from './lib/session.js';

/**
 * The app shell.
 *
 * ### Restore first, rather than fetch first
 *
 * Until sign-in existed this component rendered the squad screen immediately
 * and fell back to the landing page on a `401`, on the reasoning that a
 * signed-in player should not pay a round trip to reach their squads.
 *
 * **That optimism has no payoff now that tokens are held the way they are.**
 * The session token lives in memory only, so a page load never has one — the
 * optimistic request would `401` *every* time, for everybody, and the fallback
 * would be the normal path rather than the exception. So the shell asks
 * `session.ts` whether there is anything to restore, and only a player with a
 * stored renewal token waits on the network at all.
 *
 * **The footer sits outside the screen rather than inside it**, because the
 * policy links have to be on every screen 007–016 adds — including the ones
 * that do not exist yet. Putting it in `SquadsScreen` would make that a thing
 * to remember, and the day it is forgotten is the day the refund link
 * disappears.
 */
type Phase =
  | { readonly kind: 'restoring' }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'signed-in'; readonly account: Account };

/**
 * Which screen a signed-in player is on.
 *
 * **A battle is a screen rather than a mode**, and it is deliberately not
 * navigable away from by the nav: one battle at a time is a server rule, so
 * offering "Squads" mid-fight would offer a screen whose only outcome is
 * `409 battle_already_open`. The nav is hidden instead of disabled — a disabled
 * control invites the player to work out why.
 */
type Screen =
  | { readonly kind: 'squads' }
  | { readonly kind: 'attack' }
  | { readonly kind: 'battle'; readonly started: StartedBattle }
  /**
   * **One screen for both your profile and somebody else's**, carrying the id
   * it is showing. Two components would be two disclosure surfaces to keep in
   * step, and the difference between them is a single flag: whose controls to
   * render. The *data* difference is the server's job, not this union's.
   */
  | { readonly kind: 'profile'; readonly targetId: string }
  /**
   * **One screen for three states** — in a guild, not in one, and founding one.
   * Which you see is a server fact (`GET /v1/me/guild`), not a navigation choice,
   * so it is a single member here rather than three.
   */
  | { readonly kind: 'guild' }
  /**
   * **`ROSTER` is its own destination** (T045), as the rail draws it. It is a
   * study screen over content — all 27 are unlocked and identical for
   * everybody — and it is *not* the squad builder's hero list, which is an
   * allocation control that has to stay where the allocation happens.
   */
  | { readonly kind: 'roster' }
  /** The Codex (T065). Content only — the roster is already in the bundle. */
  | { readonly kind: 'codex' }
  /**
   * **The Rune Forge** (018 T003, T020).
   *
   * The store export's rail reads `SQUADS · ROSTER 27 · RUNE FORGE ·
   * MATCHMAKING · THE COURT · THE STORE · CODEX`, so the Forge is a top-level
   * destination rather than a section of anything. It arrives here the same
   * commit its screen does, which is FR-015 rather than bookkeeping.
   */
  | { readonly kind: 'forge' }
  /**
   * **The Store** (018 T032). One product, seven durations. It arrives with its
   * screen and not before — and it could not arrive at all until 011 Phase 8
   * made the pass actually pay, because a store selling a pass that does
   * nothing fails silently and takes the money.
   */
  | { readonly kind: 'store' }
  /**
   * **The battle record** (018 T040) — your last fifty battles, and the seven
   * days of them you can still watch. Feature 008 built the record, the replay
   * blob, the window, the sweep and both read routes, and neither route has
   * ever had a caller.
   */
  | { readonly kind: 'battles' }
  /**
   * **One replay, played from its stored log.** It carries the role rather
   * than looking it up, because the list already knows which side the player
   * fought on and the log does not say — an event names a *seat*, and "yours"
   * versus "theirs" is the one thing a viewer needs that the log cannot tell
   * it.
   */
  | { readonly kind: 'replay'; readonly battleId: string; readonly viewerRole: BattleRole };

/**
 * **The dev-only component gallery** (017 T032).
 *
 * `import.meta.env.DEV` is replaced by Vite with a literal `false` in a
 * production build, so the import and the whole branch are dead code the
 * bundler drops — the gallery never ships.
 *
 * It is checked here, in a wrapper, so the early return happens **before any
 * hook runs**. Putting it inside `GameApp` would make every hook below it
 * conditional, which is the bug that produces "rendered fewer hooks than
 * expected" on the next navigation.
 *
 * The registration matters as much as the component: a library nothing renders
 * is the defect this project has shipped five times, so the gallery is mounted
 * by the real app and `gallery.test.tsx` asserts it renders.
 */
const galleryRequested = (): boolean =>
  typeof window !== 'undefined' && window.location.hash === '#gallery';

export function App(): JSX.Element {
  if (import.meta.env.DEV && galleryRequested()) {
    return <GalleryScreen />;
  }
  return <GameApp />;
}

function GameApp(): JSX.Element {
  const [phase, setPhase] = useState<Phase>(() =>
    hasStoredSession() ? { kind: 'restoring' } : { kind: 'anonymous' },
  );
  const [screen, setScreen] = useState<Screen>({ kind: 'squads' });

  useEffect(() => {
    if (phase.kind !== 'restoring') return;

    let cancelled = false;
    void restore().then((account) => {
      if (cancelled) return;
      setPhase(account ? { kind: 'signed-in', account } : { kind: 'anonymous' });
    });

    return () => {
      cancelled = true;
    };
    // Deliberately empty: `restoring` is only ever the *initial* phase and is
    // never returned to, so this closes over the first render on purpose. A
    // dependency on `phase` would re-enter the effect on every sign-out.
  }, []);

  /**
   * **Reached only after renewal has already been tried and failed.** `api.ts`
   * renews and retries on a `401` before any caller sees one, so a `401` that
   * gets this far means the session is genuinely over — expired beyond renewal,
   * revoked, or its family killed by a reuse. The right response is the landing
   * page, not a retry.
   */
  const onUnauthenticated = useCallback(() => setPhase({ kind: 'anonymous' }), []);

  const onSignOut = useCallback(() => {
    setPhase({ kind: 'anonymous' });
    void signOut();
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {/**
       * **`SessionBar` is gone, and it was drawing a second header** (019 US2).
       *
       * It rendered a `banner` landmark with an LMNTLZ wordmark and the
       * username **directly above `AppShell`'s `Header`**, which draws an
       * LMNTLZ wordmark and the username. A player saw the game's name twice
       * and their own name twice, stacked, on every screen.
       *
       * `Header`'s own comment has named this as a real smell for two features
       * and left it alone because deleting `SessionBar` would take the visible
       * sign-out with it. So the sign-out moved into `Header` first — beside
       * the name it signs out of, which is where that comment said it belonged
       * — and then this came out.
       *
       * **One `Header`, here rather than in `AppShell`'s slot**, because a
       * signed-in player must always have a visible sign-out and not every
       * signed-in state renders the shell. The battle screen does not, and
       * neither does `ResumeBattle`'s *"Checking for a battle in progress…"* —
       * which is a dead end with no way out if `GET /battles/open` never
       * answers. `SessionBar` was accidentally covering that; nothing would
       * have been, so the header moved up instead of the bar coming back.
       */}
      {phase.kind === 'signed-in' ? (
        <Header
          /* No `shards` — the session payload carries no balance, and a
             placeholder 0 would be a false claim about money. `onProfile` is
             how the profile is reached (T020): one click on your own name,
             never a rail slot. */
          username={phase.account.username}
          onProfile={() => setScreen(screenFor('profile', phase.account.id))}
          onSignOut={onSignOut}
        />
      ) : null}

      <div className="flex-1">
        {phase.kind === 'restoring' ? <Restoring /> : null}

        {phase.kind === 'anonymous' ? (
          <>
            <LandingScreen />
            {/*
             * `max-w-5xl px-8` matches `LandingScreen`'s column exactly, and it has
             * to be said in both places because the panel is a sibling of the page
             * rather than a child of it. At `max-w-3xl` it centred 128px inboard of
             * everything above it — the door to the product sitting visibly out of
             * line with the pitch for it.
             */}
            <div className="mx-auto -mt-6 max-w-5xl px-8 pb-4">
              <SignInPanel
                onSignedIn={(account) => setPhase({ kind: 'signed-in', account })}
              />
            </div>
          </>
        ) : null}

        {phase.kind === 'signed-in' ? (
          /**
           * **A battle in progress outranks everything else**, because the
           * one-at-a-time rule means a player with an open battle cannot start
           * anything else — landing them on a builder whose only outcome is
           * `409 battle_already_open` would be showing them the one screen they
           * cannot use. So the resume check runs first and its fallback is the
           * ordinary app.
           *
           * **It is no longer the only route into `BattleScreen`.** It was, for one
           * feature: choosing an opponent needed the candidate set, which was 009.
           * 009 shipped, so `AttackScreen` is now the other route in — and the two
           * differ in exactly one way, which is that a start has an opening packet
           * and a resume does not.
           */
          <ResumeBattle
            onUnauthenticated={onUnauthenticated}
            fallback={
              screen.kind === 'battle' ? (
                <BattleScreen
                  started={screen.started}
                  onConcluded={() => {
                    /**
                     * **Left on the result rather than navigated away from.** The
                     * player just finished a fight and the outcome is what they came
                     * for; going back to a list would animate over it.
                     *
                     * This used to add that `GET /battles/open` answers `204` once a
                     * battle settles, so *"the next load lands them on the squad
                     * screen on its own"* — which is true, and was doing the work of
                     * an exit. The tab bar is hidden while `kind === 'battle'`, so
                     * **the result screen was terminal**: the only way on was to
                     * reload the browser. `onLeave` below is the way out; staying
                     * put is still the default.
                     */
                  }}
                  onLeave={() => setScreen({ kind: 'attack' })}
                  onUnauthenticated={onUnauthenticated}
                />
              ) : (
                <AppShell
                  rail={
                    <Rail
                      entries={railEntries()}
                      activeId={activeRailId(screen.kind)}
                      onSelect={(id) => setScreen(screenFor(id, phase.account.id))}
                    />
                  }
                  /* No `header` — one is rendered above the shell, for every
                     signed-in state rather than only the ones with a rail. */
                >
                  {/**
                   * **No wrapper `Panel` here, and that is the whole point of
                   * the re-layout** (017 T048–T057).
                   *
                   * Every screen used to be handed a single `<Panel span={12}>`
                   * and then declare a page container of its own —
                   * `mx-auto max-w-[1600px] px-8 py-10`, nine times over. Two
                   * consequences, and both were live: the shell's 12-column
                   * grid had exactly one child so **no screen could ever place
                   * a region on it**, and a second max-width fought the one in
                   * `AppShell`. The Codex asked for `span={6}` twice and got
                   * two stacked full-width blocks, because its `Panel`s were
                   * grandchildren of the grid rather than children.
                   *
                   * A screen is now a **fragment of `Panel`s** dropped straight
                   * into the grid, which is what the export draws: a 264px
                   * filter rail beside the roster, a 2fr/1fr profile, an
                   * inspector beside the squad board.
                   * `tests/site/layout.test.tsx` holds both halves of this.
                   */}
                  {screen.kind === 'attack' ? (
                    <AttackScreen
                      onBattleStarted={(started) => setScreen({ kind: 'battle', started })}
                      onViewProfile={(targetId) => setScreen({ kind: 'profile', targetId })}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : screen.kind === 'profile' ? (
                    <ProfileScreen
                      targetId={screen.targetId}
                      isSelf={screen.targetId === phase.account.id}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : screen.kind === 'guild' ? (
                    <GuildScreen
                      accountId={phase.account.id}
                      onViewProfile={(targetId) => setScreen({ kind: 'profile', targetId })}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : screen.kind === 'roster' ? (
                    <RosterScreen />
                  ) : screen.kind === 'codex' ? (
                    <CodexScreen />
                  ) : screen.kind === 'store' ? (
                    /* 018 T032 — the caller. 011 built the catalog, the
                       checkout, the webhook, the entitlement fold, the receipt
                       and the ceiling, and named no screen anywhere. */
                    <StoreScreen onUnauthenticated={onUnauthenticated} />
                  ) : screen.kind === 'forge' ? (
                    /* 018 T020 — the caller. Feature 010 built runes end to
                       end and no task anywhere created a screen, so shards
                       were earned with nothing to spend them on and gear
                       score never moved. */
                    <ForgeScreen onUnauthenticated={onUnauthenticated} />
                  ) : screen.kind === 'battles' ? (
                    /* 018 T040 — the caller. `GET /v1/me/battles` and
                       `GET /v1/replays/:id` have been in the gap audit since
                       it existed: every replay this game has written expired
                       without anybody being able to open one. */
                    <BattleListScreen
                      onWatch={(battle) =>
                        setScreen({
                          kind: 'replay',
                          battleId: battle.battleId,
                          viewerRole: battle.role,
                        })
                      }
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : screen.kind === 'replay' ? (
                    <ReplayViewer
                      battleId={screen.battleId}
                      viewerRole={screen.viewerRole}
                      /* T040's "give a finished replay a way out" — back to the
                         list it was opened from, not to the rail's default. */
                      onLeave={() => setScreen({ kind: 'battles' })}
                      onUnauthenticated={onUnauthenticated}
                    />
                  ) : (
                    <SquadsScreen
                      onUnauthenticated={onUnauthenticated}
                      /* The design's primary action on an attack squad. It
                         leaves for matchmaking rather than starting anything —
                         choosing an opponent is that screen's job. */
                      onFindBattle={() => setScreen({ kind: 'attack' })}
                    />
                  )}
                </AppShell>
              )
            }
          />
        ) : null}
      </div>

      <SiteFooter />

      {/**
       * **Beside the footer for the same reason the footer is here** — it has to
       * apply to every screen 009–016 adds, including the ones that do not exist
       * yet, and anything mounted inside a screen is a thing to remember.
       *
       * It renders no markup; it injects a script. See `lib/analytics.ts` for
       * why it is gated and what `beforeSend` removes. One caveat to know before
       * reading the dashboard: **this app is a single URL**, so every screen
       * reports as `/` and the five policy pages are the only distinct paths
       * there are. A per-screen funnel needs routes or custom events, neither of
       * which exists.
       */}
      {analyticsEnabled() ? <Analytics beforeSend={scrubEvent} /> : null}
    </div>
  );
}

/**
 * The screens, named for what they do.
 *
 * **Not a router.** The app is a single URL — deliberately, since the Steam build
 * loads from disk and there is no server to route on — so this is local state, and
 * `lib/analytics.ts` records the consequence: every screen reports as `/` in the
 * dashboard, and a per-screen funnel would need routes or custom events.
 */
/**
 * ---------------------------------------------------------------------------
 * The rail (017 T043, T044, T045 · FR-015)
 * ---------------------------------------------------------------------------
 *
 * This replaces four top tabs — Squads · Attack · Profile · Guild — with the
 * left rail every export draws.
 *
 * ### An entry cannot name a screen that does not exist
 *
 * FR-015, and it is enforced structurally rather than by care: `screenFor`
 * returns a `Screen`, so **a rail id with no screen does not compile**. There
 * is no href, no route table, and nothing to fall through to. Adding an entry
 * for an unbuilt destination means adding a `Screen` member first, which is
 * the point.
 *
 * ### What is deliberately absent, and why absent rather than disabled
 *
 * - **`CODEX`** — 017's own Phase 7 builds it. Registered when it exists.
 * - **`RUNE FORGE`, `THE STORE`** — 018.
 * - **`DISPATCHES`** — 016.
 * - **`CHAT`** — 014, and it joins THE COURT group when it lands.
 * - **`BATTLE RECORD`** — the export draws it inside THE COURT, but it is not
 *   a destination: it is a *section of the profile*
 *   (`features/profile/PublicProfile.tsx` renders `BattleRecord`). It becomes
 *   an entry if it ever becomes a screen, and not before.
 *
 * A disabled entry invites the player to work out why; an absent one says
 * nothing and promises nothing.
 *
 * ### THE COURT is where the social half lives, and PROFILE is not in it (T044)
 *
 * The Court is the game's word for the social half — a guild is a court, and
 * *Court-Champion* is a rank inside that vocabulary rather than a standings
 * page. `research.md` R6 established it from the active-state colour, which
 * marks THE COURT lit on Profile, Battle Record, Guild Roster and Guild Admin.
 *
 * **That is evidence about which entry is LIT, not about which entries are
 * children**, and the difference matters. The export's header design is
 * explicit that *profile hangs off the username rather than taking a rail
 * slot* (T020) — so Profile is reached by clicking your own name, and lights
 * THE COURT while you are there.
 *
 * Reading it the other way put Profile inside a collapsed group and made it
 * **two clicks**, which `e2e/profile.spec.ts` already forbids in as many
 * words: *"the profile must be one click away or it does not exist."* Two
 * independent sources, the same answer.
 *
 * THE COURT is a plain entry today because Guild is the only social screen
 * built. It becomes a group when 014 lands Chat beside it.
 */
type RailId = 'squads' | 'roster' | 'forge' | 'attack' | 'court' | 'battles' | 'store' | 'codex';

export function railEntries(): RailEntry[] {
  return [
    { id: 'squads', label: 'Squads' },
    { id: 'roster', label: 'Roster', badge: ROSTER_SIZE },
    /* 018 T020. The store export puts RUNE FORGE between ROSTER and
       MATCHMAKING, which is also the order a player meets them in: pick
       champions, improve them, then go and fight. */
    { id: 'forge', label: 'Rune Forge' },
    { id: 'attack', label: 'Matchmaking' },
    { id: 'court', label: 'The Court' },
    /**
     * **018 T040 — and it graduates off `rail.test.tsx`'s UNBUILT list**, which
     * is that list working as designed for the third time this feature.
     *
     * It sat there as *"a section of the profile, not a screen"*, and that was
     * true: `PublicProfile` renders `BattleRecord` for whoever you are looking
     * at. It is now also a destination, because **your own** record is the only
     * place a replay can be opened from.
     *
     * The export draws it *inside* the THE COURT group. THE COURT is still a
     * plain entry here — it becomes a group when 014 lands Chat beside it — so
     * this sits immediately after it, which keeps the adjacency without
     * restructuring the rail for one entry. It becomes a child of the group on
     * the day that group exists.
     */
    { id: 'battles', label: 'Battle Record' },
    /* 018 T032. The store export's rail reads
       `... MATCHMAKING · THE COURT · THE STORE · CODEX`. */
    { id: 'store', label: 'The Store' },
    /* T065 — registered now that the screen exists, and not one commit
       earlier. That ordering is FR-015, not bookkeeping. */
    { id: 'codex', label: 'Codex' },
  ];
}

/**
 * Rail id → screen. Total over `RailId`, so every entry above resolves and a
 * new entry cannot be added without a screen to land on.
 *
 * `accountId` is still taken because the profile route needs it — the header
 * uses the same function, since "my profile" is a profile *of somebody*.
 */
export function screenFor(id: string, accountId: string): Screen {
  switch (id as RailId | 'profile') {
    case 'roster':
      return { kind: 'roster' };
    case 'attack':
      return { kind: 'attack' };
    case 'court':
      return { kind: 'guild' };
    case 'codex':
      return { kind: 'codex' };
    case 'forge':
      return { kind: 'forge' };
    case 'battles':
      return { kind: 'battles' };
    case 'store':
      return { kind: 'store' };
    case 'profile':
      return { kind: 'profile', targetId: accountId };
    case 'squads':
    default:
      return { kind: 'squads' };
  }
}

/**
 * Which entry is lit. Exactly one.
 *
 * **`profile` lights THE COURT** — that is the active-state reading R6 settled,
 * and it is why the profile does not need a slot of its own. `battle` lights
 * nothing meaningful because the rail is not rendered during a battle at all:
 * a player with an open battle cannot start anything else.
 */
export function activeRailId(kind: Screen['kind']): string {
  switch (kind) {
    case 'guild':
    case 'profile':
      return 'court';
    /* Watching a replay lights the record it was opened from — the viewer is
       not a destination of its own and has no rail entry. */
    case 'replay':
      return 'battles';
    case 'battle':
      return 'squads';
    default:
      return kind;
  }
}

function Restoring(): JSX.Element {
  return (
    <main className="mx-auto max-w-[1600px] px-8 py-16">
      <p className="text-sm tracking-widest text-faint uppercase" role="status">
        Restoring your session…
      </p>
    </main>
  );
}

/**
 * `SessionBar` lived here and was deleted (019 US2).
 *
 * **A visible sign-out is not optional** — this is a shared-computer game with
 * a thirty-day renewal token in browser storage, and without a deliberate way
 * to end a session the only way off a machine is to clear site data. That
 * requirement is unchanged; it is now met by `Header`, which already carried
 * the username this duplicated.
 *
 * What went with it: a second `banner` landmark, a second LMNTLZ wordmark and
 * a second copy of the username, stacked above the real header on every
 * screen. `Header`'s comment had flagged the duplication for two features and
 * named the exact blocker — removing this would take the sign-out with it — so
 * the button moved first.
 */

/** Re-exported so a screen can name the signed-in account without importing two modules. */
export { currentAccount };
