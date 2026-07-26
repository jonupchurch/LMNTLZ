# LMNTLZ · resources

Design-prompt library and lore codex for **LMNTLZ** (working title) — a fantasy battler where the engine runs squad **defense** and the player commands the **offense**.

## Claude Design prompts (one file = one prompt)

Run them in order — later prompts reuse the tokens the earlier ones establish. Paste each file's `## PROMPT` block into Claude Design.

| Order | File | Produces |
|---|------|----------|
| **1st** | `brand-identity.md` | Wordmark suite, monogram/app icon, the nine colors as one brand spectrum, voice — **generate first** |
| **2nd** | `design-system.md` | The in-app UI kit: tokens + component library, **with the tech stack that shapes it** |
| 3rd | `01-hero-card.md` | The hero card at 3 scales (detail / grid tile / battle chip) |
| 4th | `02-roster-collection.md` | Collection browser with type + weakness filters |
| 5th | `03-squad-builder.md` | Pick-6 builder in the 2/3/1 formation, for attack and auto-run defense squads |
| 6th | `04-battle-screen.md` | Battle UI + combat feedback (player offense vs. engine defense) |
| 7th | `05-matchmaking-results.md` | Opponent scouting + post-battle results |

## Generated design output

- `designsystem/` — the rendered Claude Design deliverables. **Anything landing in this folder is intentional and gets committed.**
  - `LMNTLZ Brand Book.dc.html` — output of `brand-identity.md`
  - `LMNTLZ Design System.dc.html` — output of `design-system.md`

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

Nine damage types (6 magic: Earth, Air, Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each for 27 heroes. Every hero is strong to its 2 kindred elements and carries two open doors — a major weakness (Bane) and a minor weakness (Fault), both *derived* from those two elements rather than authored — plus up to 5 powers on individual turn-based cooldowns. Players field 6 to attack and leave 6 to defend — each squad in a fixed 2 front / 3 middle / 1 back formation — and you command your strikers while the engine runs everyone's defense. The game is counter-building: read the doors, don't stack your own.
