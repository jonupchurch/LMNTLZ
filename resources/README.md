# LMNTLZ · resources

Design-prompt library and lore codex for **LMNTLZ** (working title) — a fantasy battler where the engine runs squad **defense** and the player commands the **offense**.

## Claude Design prompts (one file = one prompt)

Run them in order — later prompts reuse the tokens the earlier ones establish. Paste each file's `## PROMPT` block into Claude Design.

| Order | File | Produces |
|---|------|----------|
| **1st** | `brand-identity.md` | Wordmark suite, monogram/app icon, the nine colors as one brand spectrum, voice — **generate first** |
| **2nd** | `design-system.md` | The in-app UI kit: tokens + component library, **with the tech stack that shapes it** |
| 3rd | `01-hero-card.md` | The hero card at 3 scales (detail / grid tile / battle chip) |
| 4th | `02-roster.md` | Roster browser — allocation state, type + weakness filters |
| 5th | `03-squad-builder.md` | Pick-6 builder in the 2/3/1 formation, for attack and auto-run defense squads |
| 6th | `04-battle-screen.md` | Battle UI + combat feedback (player offense vs. engine defense) |
| 7th | `05-matchmaking-results.md` | Opponent scouting + post-battle results |

## Generated design output

- `designsystem/` — the rendered Claude Design deliverables. **Anything landing in this folder is intentional and gets committed.**
  - `LMNTLZ Brand Book.dc.html` — output of `brand-identity.md`
  - `LMNTLZ Design System.dc.html` — output of `design-system.md`
  - `LMNTLZ Hero Card.dc.html` — output of `01-hero-card.md`. Current; includes the reach treatment.
  - `LMNTLZ Matchmaking and Results.dc.html` — output of `05-matchmaking-results.md`. Current: single Attack CTA, the Hidden Six unselectable, ambush framing, and both defensive hold streaks (`zoneStreak` / `hiddenStreak`). **One defect:** the ambush chance is computed as `MY_STREAK * 2` with no cap, so it will display above 100% past a 50-win streak. It needs clamping to the 90% cap.
  - `LMNTLZ Battle.dc.html` — output of `04-battle-screen.md`. Not yet verified against the mechanics.
  - `LMNTLZ News.dc.html` — an in-app **Dispatches** feed (news, patch notes, codex, event calendar). No prompt file produced it; it is a seventh screen beyond the six above. Mechanics read correctly — ambush at 2%/win, the reach rule including own-row cost and free empty rows, Bane as underivable, 27 − 12 = 15. **Two defects:** the balance article's dek says "six of nine types were already identical" (it is seven — the body's own 1.037 / 1.019 figures are right), and the service article says a dropped connection discards the battle, which contradicts re-derivation from the action log; discard is the *maintenance* rule only. It also invents policy we have not settled: maintenance drain windows, seasons with a pass timer, timed event modes, and two new destinations (The Court, Codex).
  - `LMNTLZ Roster.dc.html` — output of `02-roster.md`. **Stale — do not build from it.** It was generated before the roster rules changed and still carries the collection model: an owned / "Unrecruited" filter, a locked-hero count, and an `X / 27` collection meter. None of those exist any more, and it lacks the assignment-status filter and allocation header that replaced them. Regenerate from the current `02-roster.md`.
  - `LMNTLZ Chat.dc.html` — chat across four channels (realm-wide, guild, and two read-only system feeds), with squad/replay attachments. No prompt file produced it; an eighth screen. Mechanics read correctly — ambush arithmetic (`4 wins → 8%`), the Hidden squad as the thing you are ambushed *into*, the maintenance discard rule stated correctly here, and a shared six whose "nothing shares a Bane" claim actually checks out. **Two defects:** the guild cap is shown as **20**, not 24, and there is no sign of the three-Banner event split — the guild card tracks one flat weekly goal instead. It also assumes realtime infrastructure the stack does not have (see `docs/tech-stack.md` → Still open) and invents moderation policy: slow mode, a 240-character cap, MOD/OFFICER roles and a reporting flow.
  - `LMNTLZ Guild Roster.dc.html` — the guild's three Wings and their members. **The most accurate export so far, and currently the reference for guild vocabulary:** `23 / 24` wardens against the real cap, three Wings at `cap: 8` named FIRST / SECOND / THIRD WING, per-member contribution scores with a sort-by-contribution control, and every rank tier drawn from the real ladder. Two gaps rather than defects: the weekly goal is a single flat guild-wide number rather than per-Wing leaderboard placement, and "rotates into First Wing weekly" implies a promotion system that is not specified anywhere.
  - `LMNTLZ Guild Admin.dc.html` — GM/Officer management: invite, remove, recruitment mode, tagline, and Wing assignment. Enforces `CAP = 8`, demands a **swap** when a target Wing is full so filling one never leaves another short, and **implements the event lock faithfully**: an `open` / `locked` phase with a countdown both ways, reassignment refused while locked, and removal tracked per Wing in a `vacated` counter that `countIn` adds back — so a vacated seat still reads as occupied and genuinely cannot be refilled, then releases when the event ends. **One gap:** there is no **Grounded** state. Every member carries `wing: "1" | "2" | "3"`, so a mid-event recruit has nowhere to sit and `WINGS[m.wing].name` has no null branch. Invitations are correctly still enabled during a lock, which makes the gap reachable rather than theoretical — someone can be invited mid-event and then cannot be represented. **Grounded needs to be a fourth value of `wing`** — an uncapped slot shown alongside the three Wings, freely assignable in both directions while unlocked, frozen while locked, and applied automatically to anyone who joins mid-event. See `mechanics/08-guilds.md`.
  - `LMNTLZ Codex.dc.html` — the in-game codex: world, the Nine Forces, the derivation rule, squads, reach, stats, powers and the Courts, plus a full 27-hero compendium. **The best-verified export in the folder.** It does not hand-author weaknesses — it computes `bane = COUNTER[primary]` and `fault = COUNTER[secondary]` from a `COUNTER` map that matches the canon bijection exactly, which is the derivation rule implemented rather than described. All 27 heroes' type/secondary pairs were compared against `characters/MATCHUPS.md`: **0 mismatches.** Squads are correctly 6 in 2/3/1. It also **assigns reach to all 27 heroes** — 12 at reach 1, 15 at reach 2, with every type having at least one of each — which answers an open question in `mechanics/02-squads.md`. Minor: it supplies epithets for the five heroes that `MATCHUPS.md` lists without one (Tidewarden Coll, Auriel Dawnkeep, Reyna Two-Rivers, Silka Pinquick, Hettamar Ironfall).
  - `LMNTLZ Profile.dc.html` — a player's own page: avatar picker, season/lifetime records, most-fielded champions, Force-share breakdown, guild standing and milestones. Vocabulary is right — *"Sworn to The Rooted Deep · First Wing · Officer"*, a `WING SHARE` contribution figure, ambush-survival counts, and a Force-share table that sums to exactly 100%. **Two defects:**
    - **It describes a knockout bracket.** *"Trial of the Nine · Wing trial, three rounds"* and *"Your wing took the third round and fell in the semifinal to Ninefold Vigil"* is head-to-head elimination against a named rival. Wings **compete via tallies on a global board and never battle each other** — there are no rounds, no semifinals and no opponent. This is the guild-vs-guild format that was considered and rejected.
    - **A collection milestone.** *"Full roster — All 27 champions recruited — 27/27"* revives the removed collection model; all 27 are unlocked from the start, so this achievement is unearnable-by-definition and describes a system that does not exist. Same class of error as the stale Roster screen.
  - `hero-icons/` — 27 hero emblems + a 3×9 overview sheet.

Typefaces settled by these: **Chakra Petch** (display), **Barlow** (UI/body), **JetBrains Mono** (numeric/stat). The base surface also tightened to `#0E0C17`, slightly darker than the `#141221` the prompts specified — treat the generated system as the source of truth where the two differ.

> These exports reference a sibling `./support.js` that isn't in the folder, so they won't render standalone in a browser as-is.

## Platform

LMNTLZ is a **desktop game**: an Electron client shipped on Steam and as a standalone installer, plus the same static build served in a desktop browser. Mouse and keyboard, minimum window 1280×720, designed for 1600×900. **There is no mobile or touch target** — every design prompt here assumes a pointer.

Gameplay is **server-authoritative**: the client sends an intent, the server resolves it and returns the result, so every action carries network latency and needs an in-flight state. See `design-system.md` for the full technical context designers need.

## Mechanics

- `mechanics/` — the systems layer: how the game actually resolves. `01-stats.md` (the ten stats + damage pipeline) is drafted; powers, turns, status effects, progression, and defense AI are still to come. See `mechanics/README.md` for the running index and what blocks what.

## Lore & roster

- `LORE-and-flavor.md` — world (Aethrym), the Nine Forces, the **weakness-derivation rule**, House voices, drop-in flavor text, and the **Design Canon** single-source-of-truth block.
- `characters/` — one art brief per hero (27 files), an `INDEX.md`, and `MATCHUPS.md`: the full worked strength/weakness table plus the effectiveness spread it produces.

Verify the roster against the derivation rule at any time:

```powershell
pwsh tools/validate-matchups.ps1
```

## The one-paragraph pitch

Nine damage types (6 magic: Earth, Air, Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each for 27 heroes. Every hero is strong to its 2 kindred elements and carries two open doors — a major weakness (Bane) and a minor weakness (Fault), both *derived* from those two elements rather than authored — plus up to 5 powers on individual turn-based cooldowns. All 27 are unlocked from the start and identical for every player — nothing to collect, so nobody can out-roster anyone. Each player defends **two zones**, which locks 12 heroes away from offense and leaves 15 to attack with, across up to 3 saved squads. Squads are 6 heroes in a fixed 2 front / 3 middle / 1 back formation; you command your strikers while the engine runs everyone's defense. The game is counter-building: read the doors, don't stack your own.
