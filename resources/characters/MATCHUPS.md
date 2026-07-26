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

### Known imbalance — offensive reach per attacking type

Reach = how many of the 27 heroes a type hits for extra damage (Bane + Fault):

| Attacking as | Bane to | Fault to | Reach |
|---|---|---|---|
| Light, Dark | 3 | 6 | **9** |
| Earth, Air, Fire | 3 | 4 | 7 |
| Water | 3 | 3 | 6 |
| Slash, Pierce, Crush | 3 | 0 | **3** |

The melee types are worth a third of Light or Dark as counter-picks. This is
structural, not an authoring slip: since Fault derives from the 2nd attunement
and no melee hero can take a melee second, **a melee type can only ever become
someone's Fault if a magic hero takes a melee 2nd attunement.** Allowing that —
and rebalancing Light/Dark down toward 3 — is the open decision that would flatten
this table to a uniform reach of 6 across all nine types.

