# Claude Design Prompt — 05 · Matchmaking & Battle Results

> **How to use:** Run after the style system and hero card prompts. Bookends the battle loop — finding an opponent's defense to attack, and the post-battle payoff.

---

## PROMPT

Design **two connected screens** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the hero cards: **(1) Matchmaking / opponent select** and **(2) Battle results**.

### Screen 1 — Matchmaking / Opponent Select

Players attack other players' **engine-run defense squads**. Design the screen where a player, with their attack squad locked, chooses or is matched to a target:

- **Opponent cards** showing another player's handle, rank/rating, and a **preview of their two defense zones** — each zone's 6 defenders as hero busts with type badges, laid out in their 2/3/1 formation, so the attacker can scout type coverage *and* positioning before committing. Every player defends two zones, so an opponent card previews **12 heroes across two squads**, and the design must keep them distinct rather than blurring into one wall of portraits.
- A **"scout" readout** that hints at the defense's collective weakness/strength spread (how much can this attacker's squad exploit it?), reinforcing counter-play.
- **A "your attack squad" strip** pinned for reference, with a quick "swap squad" shortcut.
- Rank tier, potential rating gain/loss, and a strong **"Attack"** CTA.
- Optional: a few match offerings to choose from (risk/reward — tougher defenses for more rating).

### Screen 2 — Battle Results

The post-battle payoff, for both win and loss (design both variants):

- **Outcome banner** — victory / defeat, dramatic and type-flavored, in the LMNTLZ voice.
- **Squad recap** — the player's 6 heroes with survival state and standout performers (MVP, biggest super-effective hit).
- **Rewards** — rating change (with a rank progress bar), currency, hero XP, any drops/shards, presented with satisfying reveal hierarchy.
- **Battle stats** — total damage, super-effective hits landed, powers used.
- **Next actions** — "Battle Again," "Rematch," "Back to Roster," and (on defense-relevant losses) a nudge to review the defense squad.

Keep both screens cohesive with the rest of the app. Show believable populated examples. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts.

---

## DESIGN CANON REFERENCE

- PvP is **attacker (player-controlled) vs. defender (engine-run)**; you attack other players' set defenses.
- Squads are 6 heroes in a fixed 2 front / 3 middle / 1 back formation; scouting a defense's type coverage, weaknesses, **and row placement** is part of the pre-battle skill.
- Every player defends **two zones**, so scouting means reading **12 heroes across two squads**. Since all players own the same 27 heroes, seeing an opponent's 12 defenders also tells you a great deal about the 15 they have left to attack with.
- Keep the 9-type color language and strength/weakness cues consistent with the card and battle screens.
