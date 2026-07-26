# Claude Design Prompt — 05 · Matchmaking & Battle Results

> **How to use:** Run after the style system and hero card prompts. Bookends the battle loop — finding an opponent's defense to attack, and the post-battle payoff.

---

## PROMPT

Design **two connected screens** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the hero cards: **(1) Matchmaking / opponent select** and **(2) Battle results**.

### Screen 1 — Matchmaking / Opponent Select

Players attack other players' **engine-run defense squads**. Design the screen where a player, with their attack squad locked, chooses or is matched to a target:

- **Opponent cards showing the Visible defense — the only squad anyone can choose to attack.** All 6 defenders as hero busts with type badges in their 2/3/1 formation, so the attacker can scout coverage *and* positioning and counter-build deliberately.
- **A hold-streak badge on that squad** — *"has turned away 12 attackers"* — the most useful thing an attacker can learn beyond composition, since it reflects how the squad actually performs rather than how it looks.
- **The Hidden Six as a presence, not a panel.** Every player also keeps a second, Hidden squad that **can never be selected** — the only way into it is to be ambushed. Show that it exists and show *its* hold streak (*"their Hidden Six has held 9 times"*) while revealing nothing of its composition. It should read as a rising reputation with no visible shape: a threat you can measure but not see. Never as a locked panel, a loading state, or missing data.
- A **"scout" readout** that hints at the defense's collective weakness/strength spread (how much can this attacker's squad exploit it?), reinforcing counter-play.
- **A "your attack squad" strip** pinned for reference, with a quick "swap squad" shortcut.
- Rank tier, the rating at stake, and a single strong **"Attack"** CTA — there is only one squad to choose.
- **A win-streak and ambush readout, framed as a reward.** Each consecutive attack win raises the chance the player is instead pulled into that opponent's Hidden defense — a harder fight that **pays more**. Show it plainly: **"14 wins · 28% chance of ambush."** This is aspirational, not a warning: the streak is the only thing that buys access to Hidden battles, so the number should feel like progress toward better content rather than accumulating danger. It must never be concealed — an unannounced switch of opponent reads as the game cheating.
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
- Every player defends **two zones with fixed roles**: a **Visible** squad, scoutable and the only one anyone can choose to attack, and a **Hidden** squad that is never shown and **never selectable**. The sole way into a Hidden battle is to be **ambushed**, and Hidden battles pay more.
- **Both defense squads track their own hold streak**, and both streaks are public — even the Hidden squad's, which gives it a reputation without revealing its composition.
- Since all players own the same 27 heroes, a revealed defense also tells the attacker what is *not* available to attack with. Exposing only one zone halves that leak.
- Keep the 9-type color language and strength/weakness cues consistent with the card and battle screens.
