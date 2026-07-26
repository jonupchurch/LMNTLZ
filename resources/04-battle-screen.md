# Claude Design Prompt — 04 · Battle Screen & Combat Feedback

> **How to use:** The showcase screen. Run after the style system and hero card prompts. This is where the "engine runs defense, player runs offense" loop plays out.

---

## PROMPT

Design the **Battle screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, bold outlines, dark arcane UI, vivid element color) and the compact **battle-chip** hero form.

**The core loop to design around:** the player commands their **5-hero attack squad** on offense, choosing which powers to fire and at which targets. The opposing **5-hero defense squad is run by the game engine (AI)**. So the interface is asymmetric — rich, tactile offensive controls for the player's side; clear, readable telegraphing of the AI defense's actions on the other side.

Design a single battle layout with:

- **Two facing formations** of 5 heroes each — the player's squad (bottom/near) and the engine-run defenders (top/far). Use the battle-chip form: portrait bust, HP bar, type badge.
- **The player's action bar** — for the active/selected hero, show their up-to-**5 powers** as tappable buttons, each with:
  - a power icon and name,
  - a **cooldown ring/timer** that visibly fills as it recharges (some powers are fast, some slow — show at least one ready and one mid-cooldown),
  - a cost/effect hint.
- **Targeting affordance** — when a power is selected, show how the player picks a target among the 5 defenders, with a **type-effectiveness preview on the target**: "Super effective" (hitting a major weakness), "effective" (minor weakness), "resisted" (a strength), neutral. Use the type colors + strength/weakness cues from the card system.
- **Combat feedback** — design the moment of impact:
  - floating **damage numbers** scaled/colored by effectiveness (big, bright, type-colored crit for a major-weakness hit),
  - a clear **"Super Effective!" / "Resisted" flash**,
  - HP bar drain animation and a KO state for a downed hero,
  - status/buff/debuff icons on chips.
- **The AI defense telegraph** — how the engine-controlled side signals its incoming action (a wind-up glow, an intent icon over the acting defender, a target line) so the player can read and respond. This is what makes a fair PvP-vs-AI-defense battle feel skillful.
- **Turn / initiative flow indicator** and a battle log / recent-events ticker.
- **Top bar:** both squad banners, a surrender/menu control, and round/timer.

Show the screen mid-battle: a couple of heroes already damaged, one power mid-cooldown, a super-effective hit landing, and the AI defender telegraphing its next move — so all the feedback systems are visible at once. Provide desktop and mobile layouts.

---

## DESIGN CANON REFERENCE

- **Player controls offense; the engine (AI) runs the opposing 5-hero defense.** Design the asymmetry deliberately.
- Effectiveness tiers map to the card relationships: **major weakness = super effective**, minor weakness = effective, own elements = resisted.
- Up to **5 powers per hero, each with its own cooldown** — cooldown state must be legible at a glance.
- Battle chips reuse the smallest hero-card form from `01-hero-card`.
