# Claude Design Prompt — 03 · Squad Builder Screen

> **How to use:** Run after the style system, hero card, and roster prompts. This screen is where LMNTLZ's strategy lives — picking an 8-hero attack Wing and setting two 6-hero defenses.

---

## PROMPT

Design the **Squad Builder screen** for LMNTLZ, a fantasy battler, using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the established hero cards.

In LMNTLZ, **attack and defense are different shapes, and the builder must build both.** This is the single most important thing about this screen:

- An attacking **Wing** is **exactly 8 heroes** in a fixed **3 front row · 4 middle row · 1 back row**.
- A defending **Standing Six** is **exactly 6 heroes** in a fixed **2 front row · 3 middle row · 1 back row**.

Both have three rows and both keep exactly one hero in the back seat; they differ in front and middle width. The builder therefore has **two grid layouts**, not one, and switching modes changes the shape of the board — design that transition deliberately rather than letting slots appear and vanish.

There are two distinct build modes the screen must support — make the distinction clear:

1. **Attack Wings** — up to **3 saved Wings** the player personally controls on offense. These *may share heroes with each other*; the same champion can appear in all three.
2. **Defense zones** — the player must defend **two** zones, each held by its own Standing Six, both run automatically by the game engine when other players attack. (The player sets them up; the AI plays them.) **The two zones have fixed, opposite roles:** the **Visible** defense is surfaced to attackers, can be scouted and counter-built against, and is the only squad anyone can choose to attack — so it absorbs the volume of every attack in the game. The **Hidden** defense is never shown and never selectable; the only way in is an ambush, so it faces few attackers but every one of them is on a win streak. Building for many average attacks is a different problem from building for a handful of excellent ones, and the builder must make plain which squad is which.
- **A hold-streak display on each defense squad**, plus a clear warning that **editing a defense squad resets its streak.** That is a real cost: a long-held defense is worth protecting, and pulling a hero back for a Wing means breaking it.

**The roster constraint is the heart of this screen.** Every player has all **27 heroes** from the start — no collection, no unlocking, identical for everyone. But **12 are committed to the two defense zones, and a hero on defense cannot attack.** That leaves 15 for offense, drawn on by all three attack Wings — and since a Wing is 8, each one commits more than half of everything the player has free.

Two consequences the UI must handle head-on:

- **Three disjoint Wings are impossible, and heavy overlap is guaranteed.** 3 × 8 = 24 slots against 15 available heroes, and any two Wings must share at least one hero. A Wing uses more than half the free roster, so overlap is the normal case rather than an edge case — show which heroes are shared across Wings prominently rather than hiding it.
- **Assigning a hero to defense evicts it from every Wing it appears in, invalidating each.** Because Wings overlap heavily, a single swap can break all three at once — and with 8 of 15 heroes committed per Wing, a randomly chosen hero is more likely than not to be in one. Warn *before* the change lands, naming exactly which Wings will be left short — this is the most destructive action on the screen and must never be a surprise.

Include:

- **The slot grid, in whichever shape the current mode calls for** — **8 slots as 3 / 4 / 1** for an attack Wing, **6 slots as 2 / 3 / 1** for a defense Six. The rows must read as meaningfully different positions, not just a decorative arrangement; the single back-row slot in particular should feel like the protected seat it is, and it stays singular in both shapes. Empty slots invite clicking to fill.
- **A reach readout on placement.** Every hero has a **reach of 1 or 2**, and reach counts *rows*, including the hero's own — so what a hero can touch changes completely depending on the slot it's dropped into. A reach-1 hero in the back row can reach neither the enemy nor its own front line. Show what a hero would actually be able to target from the slot it's hovering over, so that consequence is learnable at build time rather than discovered mid-battle. Warn, don't scold — a player is allowed to make that choice.
- **A hero picker** — the roster grid (reuse grid-cards) alongside or beneath the slots, filterable by type and by weakness, so players can counter-build.
- **A live squad-synergy / coverage panel** — the strategic centerpiece. As heroes are added, surface:
  - **Type coverage:** which of the 9 damage types the squad can deal.
  - **Collective vulnerability:** an at-a-glance readout of what this squad is, as a whole, weak to (e.g. "4 of your 8 are weak to Fire — risky"). Use type-colored meters or a small 9-type heat readout. **The alarm threshold should differ by shape** — three shared weaknesses out of six defenders is dangerous, three out of eight attackers is ordinary.
  - **Cooldown / tempo hint:** a rough sense of the squad's burst vs. sustain based on the heroes' power cooldowns.
- **A mode switcher** across all five squads — 3 attack Wings and 2 defense Sixes — with the rules differences clear (defense emphasizes durability and coverage since the AI runs it, and defense assignments lock heroes out of offense entirely). Switching between an attack Wing and a defense Six also changes the board's shape, so the switcher carries more weight than a normal tab strip.
- **An invalidated-squad state.** A squad short a member because a hero was pulled to defense must read as broken and un-battleable, with an obvious path to refill it.
- **Save / name loadout** controls for the 3 attack Wings.
- **A clear primary action:** "Find Battle" (from an attack Wing) or "Set as Defense."

The emotional goal: building a squad should feel like solving a puzzle. Reward the player visually when their coverage is strong and warn them (without nagging) when they've stacked a shared weakness. Show **both** shapes populated with mixed-type heroes — a full 8-hero Wing in 3/4/1 and a full 6-hero Standing Six in 2/3/1 — so the coverage panel is doing real work in each and the difference between the two boards is obvious. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts. Drag-and-drop between slots is available and worth designing for, since placement is the core interaction here.

---

## DESIGN CANON REFERENCE

- An attacking **Wing** is **8 heroes** in **3 front / 4 middle / 1 back**; a defending **Standing Six** is **6 heroes** in **2 front / 3 middle / 1 back**. Every player maintains up to **3 attack Wings** and **2 auto-run defense zones**.
- All **27 heroes are unlocked from the start** and identical for every player. **12 are locked to defense** and cannot attack, leaving 15 for offense. Full rules in `mechanics/02-squads.md`.
- Engine powers the defense; the player controls offense — so the defense builder is about setup, not live control.
- Each hero: 1 type, 2 strengths, 1 major + 1 minor weakness, up to 5 powers with individual cooldowns.
- Counter-building against a known/expected weakness spread is a core skill the UI should enable.
