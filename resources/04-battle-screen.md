# Claude Design Prompt — 04 · Battle Screen & Combat Feedback

> **How to use:** The showcase screen. Run after the style system and hero card prompts. This is where the "engine runs defense, player runs offense" loop plays out.

---

## PROMPT

Design the **Battle screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, bold outlines, dark arcane UI, vivid element color) and the compact **battle-chip** hero form.

**The core loop to design around:** the player commands their **8-hero attack Wing** on offense, choosing which powers to fire and at which targets. The opposing **6-hero Standing Six is run by the game engine (AI)**. So the interface is asymmetric in two ways at once — rich, tactile offensive controls for the player's side against clear, readable telegraphing of the AI's actions on the other; and now **literally asymmetric in body count**, since the attacker fields eight against six.

Design a single battle layout with:

- **Two facing formations of different sizes.** The player's attack **Wing** is **8 heroes** in **3 front · 4 middle · 1 back** (bottom/near, its front row toward the enemy). The engine-run **Standing Six** is **6 heroes** in **2 front · 3 middle · 1 back** (top/far). **The board is deliberately not mirrored** — do not design a symmetric layout and then squeeze one side; the size difference is a real mechanic the player should feel, and the wider attacking front should read as pressure against a narrower wall. Both sides keep exactly one hero in the rearmost row, which is the visual anchor the two shapes share. Use the battle-chip form: portrait bust, HP bar, type badge. **Fourteen chips** plus row structure is a dense screen — it must stay legible at a glance even at the minimum 1280×720 window, since rows drive targeting.
- **The player's action bar** — for the active/selected hero, show their up-to-**5 powers** as clickable buttons, each with:
  - a power icon and name,
  - a **cooldown ring/timer** that visibly fills as it recharges (some powers are fast, some slow — show at least one ready and one mid-cooldown),
  - a cost/effect hint.
- **Targeting affordance** — when a power is selected, show how the player picks a target among the 6 defenders (from a Wing of 8, so most of the player's heroes are choosing among fewer targets than there are attackers), with a **type-effectiveness preview on the target**: "Super effective" (hitting a major weakness), "effective" (minor weakness), "resisted" (a strength), neutral. Use the type colors + strength/weakness cues from the card system. Show clearly which defenders are **reachable** — every hero has a **reach of 1 or 2** measured in rows, counting its own rows as well as the enemy's, so a given hero can only strike so deep. Out-of-reach defenders must read as *out of reach* rather than merely greyed out, and the UI should make the distance legible. Reachability also **changes during the battle**: fully empty rows stop counting, so clearing the enemy front row pulls the rows behind it into range.
- **Combat feedback** — design the moment of impact:
  - floating **damage numbers** scaled/colored by effectiveness (big, bright, type-colored crit for a major-weakness hit),
  - a clear **"Super Effective!" / "Resisted" flash**,
  - HP bar drain animation and a KO state for a downed hero,
  - status/buff/debuff icons on chips.
- **The AI defense telegraph** — how the engine-controlled side signals its incoming action (a wind-up glow, an intent icon over the acting defender, a target line) so the player can read and respond. This is what makes a fair PvP-vs-AI-defense battle feel skillful.
- **Turn / initiative flow indicator** and a battle log / recent-events ticker.
- **Top bar:** both squad banners, a surrender/menu control, and round/timer.

Show the screen mid-battle: a couple of heroes already damaged, one power mid-cooldown, a super-effective hit landing, and the AI defender telegraphing its next move — so all the feedback systems are visible at once. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts.

Because the server resolves every action, a committed power spends a moment **in flight**. Show that state: the action bar must communicate "sent, awaiting result" without stalling the animation, and there must be a legible treatment for **connection loss mid-battle**.

---

## DESIGN CANON REFERENCE

- **Player controls offense; the engine (AI) runs the opposing Standing Six.** Design the asymmetry deliberately.
- **The two sides are different shapes.** An attacking **Wing** is **8 heroes** in **3 front / 4 middle / 1 back**; a defending **Standing Six** is **6 heroes** in **2 front / 3 middle / 1 back**. Row position is a real mechanic, not decoration, and the board is not mirror-symmetric.
- **Reach (1 or 2) gates all targeting**, allies included, and is measured in occupied rows — the hero's own rows count against it. Empty rows are skipped, so range opens up as the battle goes on. See `mechanics/02-squads.md`.
- Effectiveness tiers map to the card relationships: **major weakness = super effective**, minor weakness = effective, own elements = resisted.
- Up to **5 powers per hero, each with its own cooldown** — cooldown state must be legible at a glance.
- Battle chips reuse the smallest hero-card form from `01-hero-card`.
