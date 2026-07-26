# LMNTLZ — Lore & Flavor Codex

*Working title. Names, epithets, and House voices below are flavor drafts — starting points for writers and designers to tune. **The Forces, their `counter` map, and the weakness-derivation rule are not** — those are settled canon that the roster and the matchup table both depend on. See "What is settled vs. what is still soft" at the end.*

---

## The World: Aethrym

Before there were kingdoms, there was the **Sundering** — the moment the world-soul shattered into Nine Forces and scattered across a broken sky. Aethrym is what grew back around the shards: a realm of floating shard-isles, storm-seas, and buried god-bone, where every living thing carries a trace of one of the Nine.

Those born with a strong enough resonance are the **LMNTLZ** — *Elementals* — heroes who can shape their Force into weapon, ward, and wonder. They are courted, conscripted, and collected. In the age of the **Warden Courts**, the great houses no longer send armies. They send champions. Six to strike, six to stand. And the world watches.

To command LMNTLZ is to read the eternal argument between the Forces — for no Force is supreme, and every strength is a door that some other strength was made to open.

---

## The Nine Forces

The Nine are grouped by how they enter the world: the **Six Arcane** (magic, drawn from the shattered sky) and the **Three Martial** (melee, forged from the world's own bones).

### The Six Arcane (a closed ring)

The Six turn like a wheel, each opposed across the circle by its truest rival.

- **Earth** — *the Rooted Deep.* Patience, stone, and root. Slow to move, impossible to erase. Opposed to **Air**.
- **Air** — *the Untethered Breath.* Storm, sky, and momentum. Everywhere and nowhere. Opposed to **Earth**.
- **Fire** — *the Hungry Bloom.* Passion, ruin, rebirth. It gives everything and keeps nothing. Opposed to **Water**.
- **Water** — *the Patient Tide.* Memory, depth, and erosion. It wins by outlasting. Opposed to **Fire**.
- **Light** — *the First Word.* Revelation, order, judgment. It leaves nothing hidden. Opposed to **Dark**.
- **Dark** — *the Last Silence.* Mystery, undoing, mercy of the veil. It keeps what Light would burn away. Opposed to **Light**.

### The Three Martial (a turning triangle)

The Three are a wager with no winner, each answering the one before it.

- **Slash** — *the Open Line.* The wide cut, the duelist's art. Overwhelms the **Pierce** who steps in too close.
- **Pierce** — *the Single Point.* The thrust that finds the seam. Slips past the **Crush** before the weight can fall.
- **Crush** — *the Falling Weight.* Maul, gauntlet, and avalanche. Shatters the guard of the **Slash** who commits too far.

> *(Triangle: Slash ▸ Pierce ▸ Crush ▸ Slash — each beats the next. Settled; the derivation rule depends on it.)*

---

## How the Forces Argue (the effectiveness model, in flavor)

Every Elemental is born of **two kindred Forces** — a primary they wield and a secondary that runs in their blood — and against **both**, they stand **strong** (resistant). But no one is born whole. Each carries two open doors:

- **The Bane** — the one Force they are *very weak* to. Strike a hero's Bane and the blow lands as **Super Effective**.
- **The Fault** — the one Force they are *somewhat weak* to. A lesser opening; still worth exploiting.

So every hero reads as a small equation:

> **2 Strengths** (their kindred Forces) · **1 Bane** (major weakness) · **1 Fault** (minor weakness)

The whole game of LMNTLZ is holding those equations in your head — building six heroes whose Banes don't line up, and choosing six attackers whose Forces are keys to the enemy's doors.

### The doors are not chosen — they are consequences

A hero's two weaknesses are **derived**, never hand-authored. Each Force is answered by exactly one other, and a hero's openings are simply what answers the two Forces they carry:

```
strengths = { primary, secondary }
Bane      = counter(primary)      // very weak — Super Effective
Fault     = counter(secondary)    // somewhat weak
```

| Force | Answered by (`counter`) |
|-------|--------------------------|
| Earth | Air |
| Air | Earth |
| Fire | Water |
| Water | Fire |
| Light | Dark |
| Dark | Light |
| Slash | Crush |
| Pierce | Slash |
| Crush | Pierce |

Because `counter` is exact and never crosses between the Arcane ring and the Martial triangle, three things follow and hold for the whole roster:

- **A hero's Bane is fixed by their primary.** All three champions of a House share it, so a type badge tells you a hero's major weakness on sight. It is not a tunable number.
- **The Fault is the only thing the designer chooses**, and only indirectly — by choosing the secondary.
- **No Elemental of the Martial can take a second Martial discipline.** The triangle is a closed cycle of three: of the two other disciplines, one is already that hero's Bane, and the other would make their Fault their own primary. Both collide. So every Slash, Pierce, and Crush champion carries an Arcane attunement — a shard-trace in a body forged from bone.

The full worked roster, and the effectiveness spread it produces, live in `characters/MATCHUPS.md`. It can be re-verified at any time with `pwsh tools/validate-matchups.ps1`.

---

## The Roster (structure)

Nine Forces. **Three champions each. Twenty-seven Elementals in all.** Every champion wields up to **five Powers**, and no two Powers breathe at the same rhythm — some rekindle in a heartbeat, some only once a battle turns. Learning a hero's cooldowns is learning their song.

Each of the Nine is a **House** with its own creed, colors, and troublemakers. Below: the House voice and three champion seeds per Force to hand to writers and character artists.

### Earth — House of the Rooted Deep
*"The mountain does not hurry. The mountain does not lose."*
- **Bramwen, the Slow Wrath** — a warden whose anger takes years to arrive and never leaves.
- **Ossic, Keeper of Bones** — speaks to the god-bone under the isles; walls rise where he kneels.
- **Terragosa, the Green Crown** — coaxes ruin into orchard; her mercy is a kind of siege.

### Air — House of the Untethered Breath
*"Catch me and you'll only be holding weather."*
- **Zephyrine, the Thin Blade of Wind** — duels at a distance no one can close.
- **Cirrolan, Whisper of the High Reach** — carries rumors and storms in the same breath.
- **Vael, the Falling Sky** — jumps first and lets gravity file the paperwork.

### Fire — House of the Hungry Bloom
*"Everything I love, I love completely — then it's ash, and I love again."*
- **Ember Saelith, the First Spark** — laughs while the room warms; stops laughing when it doesn't.
- **Pyrrhic, the Glad Ruin** — wins by having less left to lose than you.
- **Cindara, Daughter of the Long Burn** — quiet, patient heat; the coal, not the flame.

### Water — House of the Patient Tide
*"I was here before your walls. I will be here after."*
- **Marisel, the Deep Remembering** — drowns you in your own past mistakes.
- **Tidewarden Coll** — a bulwark that gives ground only to take a coastline.
- **Nix of the Still Pool** — perfectly calm, which is the last thing you see.

### Light — House of the First Word
*"Nothing you did is secret. Kneel or be shown."*
- **Seraphel, the Verdict** — a paladin whose gaze itself is an accusation.
- **Lucen, the Unhidden** — strips illusions, wards, and excuses alike.
- **Auriel Dawnkeep** — the last lantern on the wall; will not go out.

### Dark — House of the Last Silence
*"Some things Light would burn. I keep them. Even you."*
- **Nyxara, the Kind Veil** — an executioner who is gentle about it.
- **Umbriel, the Undoing** — unwrites what should never have been written.
- **Corvane, Shepherd of Endings** — knows the hour of every soul on the field.

### Slash — Blades of the Open Line
*"One clean cut. Everything else is just the wind-up."*
- **Kaellis, the Duelist Immaculate** — has never needed a second stroke.
- **Reyna Two-Rivers** — fights like a current: wide, fast, everywhere at once.
- **Grieve, the Wide Reaper** — clears a room the way a scythe clears a field.

### Pierce — Points of the Single Truth
*"There is always a seam. I am the answer to it."*
- **Vantric, the Threading Spear** — finds the one gap in a wall of shields.
- **Silka Pinquick** — small, quick, already behind you.
- **Lord Aiguille, the Long Point** — reaches you before you've decided to move.

### Crush — Weights of the Falling Sky
*"I don't find the opening. I make one."*
- **Boldrek, the Avalanche** — arrives all at once, like bad news.
- **Hettamar Ironfall** — a walking end-of-argument.
- **Mauless the Undenied** — guards break; then everything under them breaks too.

---

## Flavor Text Bank (drop-in copy)

### Loading-screen / lore whispers
- *"The sky broke into Nine. We are the pieces that learned to fight back."*
- *"Every strength is a locked door. Every weakness is the key someone else was born holding."*
- *"Send six to strike. Leave six to stand. Pray your Banes never line up."*
- *"No Force rules. That is the only law the Sundering left us."*
- *"A wall of shields still has a seam. Ask any Pierce."*

### Battle barks (by outcome)
- **Super Effective (Bane hit):** *"There — the open door!"* / *"Struck to the root!"*
- **Resisted (hit a strength):** *"Kindred to the core. That'll cost you."* / *"You struck the wall, not the seam."*
- **KO:** *"Returned to the shard."* / *"One less voice in the argument."*
- **Victory:** *"The Court has its answer."* / *"Six stood. Six struck. The isle is yours."*
- **Defeat:** *"Your doors were read. Rebuild, and return."*

### UI microcopy
- **Attack squad label:** *The Striking Six*
- **Defense squad label:** *The Standing Six*
- **Empty squad slot:** *An open place at the wall.*
- **Cooldown (power recharging):** *Gathering…*
- **Strong-coverage praise:** *No shared door. A closed formation.*
- **Shared-weakness warning:** *Three of yours bleed to the same Bane.*

### Rank / tier names (draft ladder)
Shardless ▸ Ember-Sworn ▸ Warden ▸ Court-Champion ▸ Sky-Named ▸ **Sundered Crown** (apex).

---

## Design Canon (single source of truth)

Keep this consistent across all prompt files and the build:

- **9 damage types:** 6 magic (Earth, Air, Fire, Water, Light, Dark) + 3 melee (Slash, Pierce, Crush).
- **Roster:** 3 champions per type = **27 heroes** total.
- **Powers:** up to **5 per hero**, each with its **own cooldown rate**.
- **Squads:** exactly **6 heroes**, arranged in a fixed three-row formation — **2 front · 3 middle · 1 back**. Each player keeps an **attack** squad (player-controlled on offense) and a **defense** squad (**engine/AI-run** when attacked).
- **Reach:** every hero has a **reach of 1 or 2**, measured in rows across a single 1–6 battlefield axis (attacker 1–3, defender 4–6). A hero's *own* rows count against its reach, and fully empty rows are skipped — so range opens up as a battle wears on. See `mechanics/02-squads.md`.
- **Per-hero relationship profile:** **2 strengths** (own/kindred elements) · **1 major weakness / Bane** (very weak, "super effective") · **1 minor weakness / Fault** (somewhat weak). All four slots are **derived from just two authored fields** — `primary` and `secondary` — via `Bane = counter(primary)`, `Fault = counter(secondary)`. Never hand-author a hero's weaknesses, and never hand-author the 9×9 matrix; both are generated.
- **A Martial hero always carries an Arcane secondary.** A second Martial discipline is impossible — see "The doors are not chosen" above.
- **Combat is turn-based.** Each power recharges over N *turns*; cooldowns are integer turn counts, never milliseconds.
- **Core loop:** scout an opponent's defense → build/pick attackers to exploit its doors → command offense while the engine runs their defense → results & rating.

## What is settled vs. what is still soft

**Settled — do not contradict these:** the nine Forces and their `counter` map; the derivation rule and its three distinctness constraints; 27 heroes at 3 per Force; squads of 6 in a 2/3/1 formation; reach of 1–2 rows gating all targeting; turn-based cooldowns; player-offense / engine-defense.

**Still soft — tune freely:** hero names, epithets, House voices, and all flavor text; the damage multipliers (only the Bane's "+50%" is pinned, in `01-hero-card.md`); stats, powers, and cooldown lengths; the rank ladder.

Names and numbers are a creative seed. The relationship system is not — it is load-bearing for the whole counter-building loop.
