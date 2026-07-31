# Tasks: The Design Port

**Input**: Design documents from `/specs/017-design-port/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/components.md](contracts/components.md) ·
[quickstart.md](quickstart.md) · **features 005–013 built and deployed**

**Tests**: **Included**, and shaped by `research.md` R7 — a component gallery, a
comment-stripped anti-vacuity token scan, keyboard assertions, and the existing
Playwright suites re-run unchanged. **No screenshot diffing, deliberately**: this
port intentionally changes every pixel of eleven screens, so every baseline is
invalid on the commit that matters, and rebaselining a diff nobody reads is how a
visual suite becomes a rubber stamp.

> ### Three rules this list encodes, because each is a compile-or-fail guard
>
> 1. **No component takes a colour.** It takes the force and derives (FR-007, XV).
> 2. **A multiplier is `Effectiveness`**, the `1.5 | 1.25 | 1.0 | 0.8 | 0.5` union —
>    so the `×1.2` four exports print is a **type error** (FR-019).
> 3. **A cooldown is turns**, never a clock (FR-008, XIII).

---

## Phase 1: Setup

- [x] T001 Add `@fontsource/chakra-petch`, `@fontsource/barlow` and `@fontsource/jetbrains-mono` to `apps/client/package.json` — **exact weights only**: Chakra Petch 500/600/700, Barlow 400/500/600/700, JetBrains Mono 400/500/700
- [X] T002 Add `"icons:build": "tsx tools/build-icons.ts"` to the root `package.json`, beside the existing `content:build`
- [X] T003 [P] Create `apps/client/src/components/{shell,controls,type,hero,readouts,system,icons}/` — grouped by the Design System export's own sections, **not by feature**, because a component under `features/` is one no other feature will find
- [X] T004 [P] Create `apps/client/tests/components/` for the gallery and per-component suites

---

## Phase 2: Foundational — tokens

**⚠️ Blocks every component.** A component built before its tokens exist inlines a
hex, which is the one regression this feature exists to prevent.

- [X] T005 Extract the **type scale, spacing scale, radius and motion** values from `resources/designsystem/LMNTLZ Design System.dc.html` § *Typography, spacing, radius, motion* into `@theme` in `apps/client/src/styles/base.css`, beside the nine-force colours already there
- [X] T006 Write `apps/client/tests/components/tokens.test.ts` — the token scan. **Strip comments before scanning** (a rule forbidding `#rrggbb` matches the comment explaining the ban) and **assert files were found before asserting their content** (a glob that matches nothing passes forever). Both have bitten this repo
- [X] T007 Reconcile any hex in an export with no matching token: it is **either a token that was missed or a one-off that must become one** (FR-003). Record each decision in a comment in `base.css`; do not inline
- [X] T008 [P] Add the `Effectiveness` re-export path in `apps/client/src/components/type/` so no component imports a bare `number` for a multiplier

**Checkpoint**: tokens complete; component work can begin.

---

## Phase 3: User Story 1 — The game is written in its own hand (Priority: P1) 🎯 MVP

**Goal**: LMNTLZ renders in Chakra Petch, Barlow and JetBrains Mono instead of the
operating system's default sans.

**Independent Test**: Load any screen in a fresh profile; the computed
`font-family` on a heading, on body copy and on a stat readout resolves to the
intended family. Then disable the network entirely and reload — they still render.

**Why this is the MVP**: it touches no component, ships in one commit, and improves
**every screen already built**. It is also a live defect — three families have been
declared in `base.css` and never loaded since feature 006, so every screen ever
shipped has rendered in `system-ui`.

- [x] T009 [US1] Import the nine faces in `apps/client/src/main.tsx` (`@fontsource/…/{weight}.css`), **latin subset, no italics** — nine faces, not the full families
- [x] T010 [US1] ~~Set `font-display: swap`~~ — **already the @fontsource default**, verified in `latin-500.css`. Nothing to override, and an override would be a second copy to keep in sync. Original intent — the fallback stack in `base.css` is deliberate, and a flash of fallback beats a flash of nothing on a screen a player is mid-decision on
- [x] T011 [US1] Replace the deferral comment in `apps/client/index.html` with what actually happened — it currently says fonts arrive *"with the first screen that needs them"*, and every screen needed them
- [x] T012 [P] [US1] Write `apps/client/tests/site/fonts.test.ts` — assert each of the three CSS variables resolves to its intended family and **not** to `system-ui`
- [x] T013 [US1] Write `apps/client/e2e/fonts.spec.ts` — **block all requests to `fonts.googleapis.com` and `fonts.gstatic.com`, then assert the fonts still render.** This is the Steam-from-disk case and the reason they are self-hosted (Constitution XIX)
- [x] T014 [US1] **WIRING** — confirm the imports are reached: `main.tsx` is the app entry, so assert in `fonts.test.ts` that a rendered heading computes to Chakra Petch. **A stylesheet imported by nothing is the same defect as a component rendered by nothing**

**Checkpoint**: the game reads in its own typeface, offline. Report two claims
separately — *tasks closed and gates green*, and *a player sees the change*.

---

## Phase 4: User Story 2 — One set of furniture (Priority: P1)

**Goal**: One button, one badge, one meter, each with every state the design
specifies, in `apps/client/src/components/`.

**Independent Test**: The gallery renders every component in every state and is
reviewable side by side with the Design System export without running the game.

**Blocks**: every screen in Phase 6, the Codex in Phase 7, and all of 014, 015, 016
and 018.

### Tests first

- [ ] T015 [P] [US2] Write `apps/client/tests/components/gallery.test.tsx` — render every component in every state; **the test fails if a state named in the export has no case**
- [ ] T016 [P] [US2] Write `apps/client/tests/components/noColourProp.test.ts` — scan `components/` and **fail on any prop named `color`, `colour`, `tint` or `hex`** (FR-007, Constitution XV). Comment-stripped and anti-vacuity guarded like T006
- [ ] T017 [P] [US2] Write `apps/client/tests/components/focus.test.tsx` — every interactive component shows a visible ring on `:focus-visible` and **no component sets `outline: none`**

### The layer

- [ ] T018 [US2] `components/shell/AppShell.tsx` — the 12-column grid, gutter 24, content capped 1400 and centred above ~2100, rail pinned left. **Reserve the Electron title-bar/drag region as a slot it does not fill** — there is no Electron at 1.0
- [ ] T019 [US2] `components/shell/Rail.tsx` + `RailGroup.tsx` — fixed-width left rail, exactly one active entry, groups expandable from the keyboard. **`RailEntry` carries no destination that does not exist** (FR-015)
- [ ] T020 [US2] `components/shell/Header.tsx` — shard balance, username, connection state; profile hangs off the username rather than taking a rail slot
- [ ] T021 [P] [US2] `components/controls/Button.tsx` — **all seven states**, every one rendered in the gallery. A state that exists in the export and not here is the defect T015 catches
- [ ] T022 [P] [US2] `components/controls/` inputs and form fields — rest, focus, error, disabled
- [ ] T023 [P] [US2] `components/type/TypeBadge.tsx` — takes a `DamageType` and **derives its colour**; nine forces
- [ ] T024 [US2] `components/type/RelationshipStrip.tsx` — **five tiers**, read from `@lmntlz/content`: Bane ×1.50 · Fault ×1.25 · neutral ×1.00 · secondary ×0.80 · primary ×0.50. **The export draws four and is wrong**; canon wins, and the discrepancy is already logged in `resources/README.md`
- [ ] T025 [US2] Type the strip and the grid on `Effectiveness`, never `number` — this is what makes the design's `×1.2` a **compile error rather than a review catch** (FR-019)
- [ ] T026 [P] [US2] `components/hero/HeroCard.tsx` — three scales carrying **the same data**, differing only in density, so a caller never loses information by choosing a smaller one
- [ ] T027 [P] [US2] `components/hero/PowerSlot.tsx` + `CooldownRing.tsx` — the ring is a fraction of **`turnsRemaining / turnsTotal`**. No `Date`, no `setInterval`, no milliseconds (FR-008, Constitution XIII)
- [ ] T028 [P] [US2] `components/readouts/Meter.tsx` and `Pill.tsx`
- [ ] T029 [US2] `components/readouts/EffectivenessGrid.tsx` — the nine-type heat readout, **every cell from the generated matrix** and none transcribed
- [ ] T030 [P] [US2] `components/system/ConnectionState.tsx` and the maintenance state (*"the courts are in recess"*)
- [ ] T031 [US2] `apps/client/src/components/index.ts` — the single public entry point 014/015/016/018 import from
- [ ] T032 [US2] **WIRING** — build the gallery route and **register it in `apps/client/src/App.tsx`**, dev-only. Assert in `gallery.test.tsx` that it renders, then remove the registration and confirm the test fails. A component library nothing renders is exactly the defect this project has hit five times

**Checkpoint**: the layer exists, every state is visible, and nothing accepts a colour.

---

## Phase 5: User Story 4 — Heroes and effects have faces (Priority: P2)

**Goal**: 27 hero icons resolve by hero, and a missing one **fails the build**.

**Independent Test**: `pnpm --filter @lmntlz/client typecheck` fails when an icon
is removed or a hero renamed.

**Deliberately before US3** — the icons land in the Phase 4 components, and the
screens in Phase 6 consume both.

- [ ] T033 [US4] Write `tools/build-icons.ts` — read `resources/designsystem/hero-icons/` and `status-icons/`, copy the SVGs into `apps/client/src/assets/icons/`, emit a **generated** manifest. Sibling of `tools/build-content.ts`, same header: *GENERATED — DO NOT EDIT*
- [ ] T034 [US4] Map a hero to its icon by **slug minus its leading ordinal** (`01-earth-bramwen` → `earth-bramwen.svg`). Verified total: 27/27, no orphans. **Exclude `00-overview-3x9` by name**, not by a filter that would also swallow a real miss
- [ ] T035 [US4] Type `HERO_ICONS` as `Record<HeroId, string>` keyed off `@lmntlz/content`, so **a missing or misspelled hero icon is a compile error** (FR-010) — `tsc --noEmit` already runs before `vite build`
- [ ] T036 [P] [US4] `components/icons/HeroIcon.tsx`, consumed by `HeroCard` and `RosterView`
- [ ] T037 [P] [US4] `components/icons/StatusPip.tsx` + the 71-icon registry
- [ ] T038 [US4] Write `apps/client/tests/components/icons.test.ts` — **assert the positive case**: all 27 heroes resolve, and no two share an icon. A test that only checks "no crash" passes on an empty map
- [ ] T039 [US4] **Mutation-test the guard.** Copy `packages/content/src/heroes.generated.ts` to a temp path, rename one hero's slug, `pnpm icons:build`, and confirm `typecheck` **fails**. Restore **from the copy** and assert the file is byte-identical. **Never `git checkout`** — it restores HEAD, not your edit, and has silently destroyed work in this repo twice
- [ ] T040 [US4] ⚠️ Document the status-icon guard as **vacuous today** in `components/icons/README.md`: `StatusInstance.kind` is an open `string`, nothing constructs one, and `apps/api/src/battle/board.ts:123` hardcodes `statuses: []`. **The engine emits no statuses**, so "every status has an icon" is an assertion over an empty set
- [ ] T041 [US4] Write the **anti-vacuity guard** in `icons.test.ts` — it must **start failing** the moment `StatusInstance.kind` becomes a union or an authored status vocabulary appears and does not match the registry. It may not keep passing quietly once there is something to check
- [ ] T042 [US4] **WIRING** — `HeroCard` and `RosterView` render `HeroIcon`; assert the caller, then cut it and watch the test fail. **`StatusPip` is deliberately NOT wired** — there is no data for it, and wiring it would create a component with no producer

**Checkpoint**: every hero has a face; the status registry exists and says honestly
that it is unwired.

---

## Phase 6: User Story 3 — The screens look like their designs (Priority: P2)

**Goal**: The eleven built surfaces match their exports.

**Independent Test**: Each screen beside its export at 1600×900 — same regions,
same hierarchy, same type ramp — **and its feature's existing Playwright pass still
green**.

**The rail lands first** so every port is reachable as it completes.

- [ ] T043 [US3] Replace the four top tabs in `apps/client/src/App.tsx` with `AppShell` + `Rail`. **Register only destinations that exist**: Squads · Roster · Matchmaking · The Court · Codex. `RUNE FORGE` and `THE STORE` arrive with 018, `DISPATCHES` with 016
- [ ] T044 [US3] Model `THE COURT` as a **rail section** grouping Profile · Battle Record · Guild — established from the active-state colour across the exports (`research.md` R6), and Chat joins it when 014 lands
- [ ] T045 [US3] Split `ROSTER` out of `SquadsScreen` into its own destination, as the rail draws it
- [ ] T046 [US3] Write `apps/client/tests/site/rail.test.tsx` — **every entry leads to a registered screen**, exactly one is active per screen, and the unbuilt entries are **absent rather than disabled** (FR-015)
- [ ] T047 [P] [US3] Port `features/landing/LandingScreen.tsx` + `features/auth/SignInPanel.tsx` against `LMNTLZ Onboarding Flows.dc.html`
- [ ] T048 [P] [US3] Port `features/squads/RosterView.tsx` against `LMNTLZ Roster.dc.html`
- [ ] T049 [P] [US3] Port `features/squads/{SquadsScreen,SquadBuilder,DefenseConfig,EvictionWarning,FiringProfile}.tsx` against the Design System's *Applied — squad builder row*. **Keep the 2/3/1 formation grid fixed** — it wrapped 2+1 once and reads as a formation that does not exist
- [ ] T050 [P] [US3] Port `features/battle/BattleScreen.tsx` against `LMNTLZ Battle.dc.html`, **keeping the exit control** added after a finished battle had no way out
- [ ] T051 [P] [US3] Port `features/battle/TurnQueue.tsx` against `LMNTLZ Turn Sequence.dc.html` — the projected queue, never a tick counter (Constitution XIII)
- [ ] T052 [P] [US3] Port `features/attack/{AttackScreen,ScoutPanel}.tsx` against `LMNTLZ Matchmaking and Results.dc.html`, **preserving the scout disclosure boundary** — the port must not surface a field the serialiser withholds (Constitution XVII)
- [ ] T053 [P] [US3] Port `features/profile/{ProfileScreen,PublicProfile}.tsx` against `LMNTLZ Profile.dc.html`
- [ ] T054 [P] [US3] Port `features/profile/BattleRecord.tsx` against `LMNTLZ Battle Record.dc.html` — a short list must still read as *"they have not fought many"*, never as *"entries were removed"*
- [ ] T055 [P] [US3] Port `features/guilds/GuildRoster.tsx` against `LMNTLZ Guild Roster.dc.html`
- [ ] T056 [P] [US3] Port `features/guilds/GuildScreen.tsx` against `LMNTLZ Guild Admin.dc.html`
- [ ] T057 [P] [US3] Port `features/guilds/{EmblemDesigner,ApplicationForm,GuildBrowser,InviteList,SuccessionPanel}.tsx` against `LMNTLZ Guild Creation.dc.html`. **The export prices founding at ◈ 2 500 and it costs 650** — read `FOUNDING_COST_SHARDS`, never the screen (FR-019; logged in `resources/README.md`)
- [ ] T058 [US3] Re-run `pnpm --filter @lmntlz/client e2e` — **every pre-existing pass green, unchanged** (FR-012). A re-skin that breaks a journey is a regression, not a port
- [ ] T059 [US3] **WIRING** — every ported screen is reachable from the rail and **leavable without a page reload** (FR-016). Assert each route renders from `App.tsx`; a screen that only a URL can reach is not wired

**Checkpoint**: the eleven screens match, and every journey that worked still works.

---

## Phase 7: User Story 5 — The Codex (Priority: P3)

**Goal**: A player reads the Laws of Aethrym and all 27 champions.

**Independent Test**: Reachable from the rail, rendering all 27 heroes and all nine
forces from real content, matching `LMNTLZ Codex.dc.html`.

- [ ] T060 [P] [US5] Write `apps/client/tests/codex/codex.test.tsx` — all 27 champions render; **Bane and Fault are shown as derived**, never as authored fields (Constitution XV)
- [ ] T061 [US5] Build `features/codex/CodexScreen.tsx` — *THE LAWS* and *THE CHAMPIONS*, over `@lmntlz/content`. **No new route**: the client already loads the roster
- [ ] T062 [US5] Render the counter ring from the **generated bijection**, so it cannot disagree with the engine
- [ ] T063 [US5] Render the effectiveness table from the **generated matrix**. ⚠️ **The export prints `FAULT ×1.2` and omits ×0.80 entirely** — read all five tiers from `@lmntlz/content` so the screen is correct by construction and cannot drift again (FR-019, SC-010)
- [ ] T064 [US5] Add a test that **changing the generated source changes the screen** — the proof that no number was transcribed
- [ ] T065 [US5] **WIRING** — add `{ kind: 'codex' }` to the `Screen` union in `App.tsx`, render it, and activate its rail entry. Assert the caller, then cut it and watch the test fail

**Checkpoint**: the Codex is reachable and every number in it is generated.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T066 Run the token scan across the **whole** client — zero colour literals outside `base.css` (SC-002)
- [ ] T067 [P] `rg` for transcribed multipliers: every `1.25`, `0.8`, `1.5`, `0.5` in `apps/client/src` must be an import from `@lmntlz/content`, never a literal (SC-010)
- [ ] T068 [P] Confirm `git diff --stat resources/mechanics/` is **empty** — 017 changes no rule, and a moved mechanics file means a number leaked from an export into canon (FR-017, SC-008)
- [ ] T069 [P] Full keyboard pass: every interactive element reachable with a visible focus ring, rail groups expandable from the keyboard (SC-006)
- [ ] T070 [P] Viewport pass at **1280 / 1600 / 2400** — no horizontal page scroll at the floor, no reflow to one column, content capped and centred at the top end (SC-007)
- [ ] T071 [P] Write `apps/client/src/components/README.md` — the three rules from `contracts/components.md`, why colour is derived, and why the ladder is five tiers where the export draws four
- [ ] T072 Add `icons:build` to CI and **diff the generated manifest against a fresh build**, exactly as `heroes.generated.ts` is diffed today
- [ ] T073 Run the full [quickstart.md](quickstart.md) manual pass, including the offline font check and the icon-guard mutation

---

## Dependencies

```
Setup (1) ─→ Tokens (2) ─┬─→ US1 fonts (3)        ── independent, ship first
                          └─→ US2 components (4) ─┬─→ US4 icons (5)
                                                   ├─→ US3 ports (6)
                                                   └─→ US5 Codex (7) ─→ Polish (8)
```

- **US1 depends on nothing but Setup** and is independently shippable.
- **US2 blocks US3, US4, US5** — and 014, 015, 016 and every screen in 018.
- **US4 before US3** by choice: icons land in the components, screens consume both.
- **US5 last**: a new screen needs the whole layer.

## Parallel opportunities

| Phase | Parallel |
|---|---|
| 4 | T021–T023, T026–T028, T030 — different files, no shared state |
| 5 | T036, T037 |
| **6** | **T047–T057 — eleven ports, one per screen, all independent** |
| 8 | T067–T071 |

## Implementation strategy

**MVP is US1 alone.** One commit, no component work, and it changes every screen
already built — the game stops rendering in the operating system's default sans.
Ship it before anything else.

Then **US2 as early as possible**, because it is the layer 014's chat UI, 015's
moderation queue, 016's dispatches and all three of 018's screens will be built on.
Every feature that ships a screen before it exists is another screen to unpick.

**Phase 6 is eleven independent ports** and is where the wall-clock is. Nothing in
it blocks anything else in it.

---

## Notes

- **This feature changes no rule, no number and no schema.** If a task appears to
  need a migration or a mechanics edit, the task is wrong.
- **Where an export and canon disagree, canon wins and the export is left alone**
  (Constitution XX). Two are already known and logged in `resources/README.md`: the
  four-tier effectiveness ladder, and guild founding priced at ◈ 2 500 against a
  real cost of 650.
- **A `.dc.html` is look and feel.** It is never a source of a rule, a cap or a
  threshold — and a fidelity pass is precisely when somebody forgets that.
- Commit after each task or logical group; work goes straight to `main`.
