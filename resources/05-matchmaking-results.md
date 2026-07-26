# Claude Design Prompt — 05 · Matchmaking & Battle Results

> **How to use:** Run after the style system and hero card prompts. Bookends the battle loop — finding an opponent's defense to attack, and the post-battle payoff.

---

## PROMPT

Design **two connected screens** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the hero cards: **(1) Matchmaking / opponent select** and **(2) Battle results**.

### Screen 1 — Matchmaking / Opponent Select

Players attack other players' **engine-run defense squads**. Design the screen where a player, with their attack squad locked, chooses or is matched to a target:

- **Opponent cards presenting two very different fights.** Every player defends **two zones**, and the attacker picks one:
  - **The seen zone** — fully surfaced. All 6 defenders as hero busts with type badges in their 2/3/1 formation, so the attacker can scout coverage *and* positioning and counter-build deliberately. Lower rating reward.
  - **The blind zone** — nothing shown. The attacker knows it exists and knows nothing else. **Higher rating reward.**

  This risk/reward choice is the centrepiece of the screen and should be its most dramatic moment — certainty against points. Design the blind zone as a deliberate, tempting absence: six sealed or shrouded slots that feel like a wager, not like a loading state or missing data. The two options must never read as one squad of 12.
- A **"scout" readout** that hints at the defense's collective weakness/strength spread (how much can this attacker's squad exploit it?), reinforcing counter-play.
- **A "your attack squad" strip** pinned for reference, with a quick "swap squad" shortcut.
- Rank tier and **the two different rating stakes side by side** — the seen zone's reward against the blind zone's premium — so the gamble is quantified at the moment of choosing, not buried. Two distinct **"Attack"** CTAs, one per zone.
- **A win-streak and ambush-risk readout.** Each consecutive attack win raises the chance that choosing the *seen* zone lands the player in the *blind* one instead — lured past the bait. Show it plainly: **"14 wins · 28% chance of ambush."** This must never be a hidden number; overriding a stated choice without warning reads as the game cheating. Displayed, it becomes strategy — at a high enough risk, taking the blind fight for the premium is simply correct, since the danger is already being carried.
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
- Every player defends **two zones**: one **surfaced** during matchmaking and scoutable, one **blind**. The attacker chooses which to hit, and the blind zone pays more rating. Certainty traded for points — this is the screen's core decision.
- Since all players own the same 27 heroes, a revealed defense also tells the attacker what is *not* available to attack with. Exposing only one zone halves that leak.
- Keep the 9-type color language and strength/weakness cues consistent with the card and battle screens.
