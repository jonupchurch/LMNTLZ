# LMNTLZ · resources

Design-prompt library and lore codex for **LMNTLZ** (working title) — a fantasy battler where the engine runs squad **defense** and the player commands the **offense**.

## Claude Design prompts (one file = one prompt)

Run them in order — later prompts reuse the tokens the earlier ones establish. Paste each file's `## PROMPT` block into Claude Design.

| # | File | Produces |
|---|------|----------|
| 00 | `00-style-system.md` | Wordmark, 9-type color system, iconography, UI tokens — **generate first** |
| 01 | `01-hero-card.md` | The hero card at 3 scales (detail / grid tile / battle chip) |
| 02 | `02-roster-collection.md` | Collection browser with type + weakness filters |
| 03 | `03-squad-builder.md` | Pick-5 builder for attack squads and auto-run defense squads |
| 04 | `04-battle-screen.md` | Battle UI + combat feedback (player offense vs. engine defense) |
| 05 | `05-matchmaking-results.md` | Opponent scouting + post-battle results |

## Lore

- `LORE-and-flavor.md` — world (Aethrym), the Nine Forces, the 27-hero roster structure, House voices, drop-in flavor text, and the **Design Canon** single-source-of-truth block.

## The one-paragraph pitch

Nine damage types (6 magic: Earth, Air, Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each for 27 heroes. Every hero is strong to its 2 kindred elements and carries two open doors — a major weakness (Bane) and a minor weakness (Fault) — plus up to 5 powers on individual cooldowns. Players field 5 to attack and leave 5 to defend; you command your strikers while the engine runs everyone's defense. The game is counter-building: read the doors, don't stack your own.
