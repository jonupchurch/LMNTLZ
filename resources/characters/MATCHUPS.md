# LMNTLZ · Hero Matchup Table

Strength/weakness profile for all 27 heroes. Rules: a hero **resists** its primary type and its 2nd attunement; its primary's counter is the **Bane** (major weakness / super-effective against it); its attunement's counter is the **Fault** (moderate weakness).

Element oppositions — Earth↔Air · Fire↔Water · Light↔Dark. Melee triangle — Slash ▸ Pierce ▸ Crush ▸ Slash (each is Bane-weak to the one that beats it).

**Constraint:** all four slots must stay distinct, so `2nd ≠ primary`, `counter(primary) ≠ 2nd`, and `counter(2nd) ≠ primary`. A consequence worth stating plainly: **a melee hero can never take a melee 2nd attunement** — the triangle is a 3-cycle, so both remaining options collide (one is already the hero's Bane, the other makes the Fault equal the hero's own primary). Every melee hero therefore carries a magic attunement.

| # | Hero | Type | Attuned 2nd | Strong to (resists) | Very weak — Bane | Moderately weak — Fault |
|---|------|------|-------------|---------------------|------------------|--------------------------|
| 1 | Bramwen — "The Slow Wrath" | Earth | Fire | Earth · Fire | Air | Water |
| 2 | Ossic — "Keeper of Bones" | Earth | Dark | Earth · Dark | Air | Light |
| 3 | Terragosa — "The Green Crown" | Earth | Light | Earth · Light | Air | Dark |
| 4 | Zephyrine — "The Thin Blade of Wind" | Air | Light | Air · Light | Earth | Dark |
| 5 | Cirrolan — "Whisper of the High Reach" | Air | Water | Air · Water | Earth | Fire |
| 6 | Vael — "The Falling Sky" | Air | Dark | Air · Dark | Earth | Light |
| 7 | Ember Saelith — "The First Spark" | Fire | Air | Fire · Air | Water | Earth |
| 8 | Pyrrhic — "The Glad Ruin" | Fire | Light | Fire · Light | Water | Dark |
| 9 | Cindara — "Daughter of the Long Burn" | Fire | Earth | Fire · Earth | Water | Air |
| 10 | Marisel — "The Deep Remembering" | Water | Dark | Water · Dark | Fire | Light |
| 11 | Tidewarden Coll | Water | Earth | Water · Earth | Fire | Air |
| 12 | Nix — "of the Still Pool" | Water | Air | Water · Air | Fire | Earth |
| 13 | Seraphel — "The Verdict" | Light | Fire | Light · Fire | Dark | Water |
| 14 | Lucen — "The Unhidden" | Light | Air | Light · Air | Dark | Earth |
| 15 | Auriel Dawnkeep | Light | Water | Light · Water | Dark | Fire |
| 16 | Nyxara — "The Kind Veil" | Dark | Water | Dark · Water | Light | Fire |
| 17 | Umbriel — "The Undoing" | Dark | Fire | Dark · Fire | Light | Water |
| 18 | Corvane — "Shepherd of Endings" | Dark | Earth | Dark · Earth | Light | Air |
| 19 | Kaellis — "The Duelist Immaculate" | Slash | Light | Slash · Light | Crush | Dark |
| 20 | Reyna Two-Rivers | Slash | Water | Slash · Water | Crush | Fire |
| 21 | Grieve — "The Wide Reaper" | Slash | Dark | Slash · Dark | Crush | Light |
| 22 | Vantric — "The Threading Spear" | Pierce | Air | Pierce · Air | Slash | Earth |
| 23 | Silka Pinquick | Pierce | Dark | Pierce · Dark | Slash | Light |
| 24 | Lord Aiguille — "The Long Point" | Pierce | Light | Pierce · Light | Slash | Dark |
| 25 | Boldrek — "The Avalanche" | Crush | Light | Crush · Light | Pierce | Dark |
| 26 | Hettamar Ironfall | Crush | Dark | Crush · Dark | Pierce | Light |
| 27 | Mauless — "The Undenied" | Crush | Earth | Crush · Earth | Pierce | Air |

## Distribution (whole roster, all 27)

**2nd attunement — what each element was chosen as (27 total):**  
Earth ×4 · Air ×4 · Fire ×3 · Water ×4 · Light ×6 · Dark ×6  
*No melee type appears as a 2nd attunement: a melee hero cannot take a melee
second (see the constraint above), and no magic hero was given one.*

**Bane / major weakness — perfectly uniform by construction (27 total):**  
Earth ×3 · Air ×3 · Fire ×3 · Water ×3 · Light ×3 · Dark ×3 · Slash ×3 · Pierce ×3 · Crush ×3  
*This is forced: Bane derives from the primary, and there are exactly 3
champions per type. It is not a tunable value.*

**Fault / moderate weakness — follows the attunement spread above (27 total):**  
Air ×4 · Earth ×4 · Water ×3 · Fire ×4 · Dark ×6 · Light ×6  
*Zero for Slash, Pierce, and Crush.*

### Effectiveness spread per attacking type

Counting only the Bane and Fault hits a type lands is misleading, because a
hero also **resists** both of its own types. A type that is many heroes' Fault
is also, necessarily, resisted by many heroes — the two move together and
cancel. The honest measure includes all four buckets. Every hero falls in
exactly one of them (the distinctness constraints guarantee no overlap):

| Attacking as | Super-eff. | Effective | Resisted | Neutral | Avg multiplier |
|---|---|---|---|---|---|
| Air, Earth | 3 | 4 | 7 | 13 | 1.028 |
| Light, Dark | 3 | 6 | 9 | 9 | 1.028 |
| Slash, Pierce, Crush | 3 | 0 | 3 | 21 | 1.028 |
| Fire | 3 | 4 | 6 | 14 | 1.037 |
| Water | 3 | 3 | 7 | 14 | 1.019 |

**Seven of the nine types are exactly equal.** Melee's zero Faults are paid
back by being resisted by only 3 heroes instead of 9. Light and Dark's six
Faults are paid for by nine heroes resisting them.

What differs is not power but **character**: melee is flat and dependable
(21 neutral matchups — it does what it says against almost anyone), while
Light and Dark are swingy (9 boosted, 9 blunted — they reward scouting and
punish blind picks). That is a texture worth keeping, not a bug to sand off.
It also happens to match the lore: the Martial are forged from the world's
own bones, the Arcane drawn from a shattered sky.

The only real asymmetry is **Fire (1.037) vs. Water (1.019)**, and it is
unavoidable. A type's standing is driven entirely by
`count(2nd == counter(T)) − count(2nd == T)`, so an opposed pair is balanced
exactly when both are used as a 2nd attunement equally often. That needs an
even sum per pair — but there are 27 heroes across three magic pairs, and 27
is odd, so **at least one pair must always be off by one.** Earth/Air (4·4)
and Light/Dark (6·6) are balanced; Fire/Water (3·4) carries the remainder.
This distribution is therefore already optimal under the current rule.

(A perfectly uniform spread is reachable only by letting magic heroes take
melee 2nd attunements — 9 buckets divide 27 evenly where 6 do not. That was
considered and deliberately declined: the flat-vs-swingy contrast above is
worth more than the last 0.018 of parity.)

Re-check any time with `pwsh tools/validate-matchups.ps1`.

