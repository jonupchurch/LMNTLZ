# Quickstart: Roster & Squads

**Feature**: `006-roster-and-squads` | **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

```bash
pnpm --filter @lmntlz/api test squads
pnpm --filter @lmntlz/client test squad-builder
```

## The golden path — and it is the one from the plan

1. Build **both** defense zones. 12 heroes committed.
2. Build **three** overlapping attack squads from the remaining 15.
3. Move one hero from an attack squad to defense.
4. **All three attack squads invalidate, and the warning named all three.**

Step 4 is the whole feature. 3 × 6 = 18 seats drawn from 15 heroes, so a hero
sitting in all three squads is the ordinary case, not an edge case.

## The hold streak — the trap is the no-op

```
save a defense squad                          → streak 0
wait for it to hold                           → streak 14
open the editor, change nothing, save         → streak STILL 14, streakReset false
reorder two heroes back to where they started → streak STILL 14
change one hero's targeting FALLBACK          → streak 0
place a rune on a defending hero              → streak STILL 14
```

Line 3 is the case Q1 was asked about. **A no-op save must not cost a streak**, or
the reset becomes a trap and players learn never to open the editor.

Line 5 is the one that catches a lazy implementation: the fallback is the rule that
actually fires 49–80% of the time, so it belongs in the hash as much as the primary
does.

Line 6 is a judgement call worth confirming deliberately: the streak measures how
long a **plan** has held, and gear is not the plan. The alternative rule makes
"improve a defending hero" and "keep a streak" mutually exclusive.

**Test the hash, not the endpoint.** `canonicalForm` is a pure function; drive it
with pairs directly. Then one integration test to confirm the endpoint uses it and
not a client-supplied dirty flag.

## The eviction warning

Set up: three complete attack squads, one hero in all three. Then
`POST /v1/squads/defense/visible/preview-move`.

```
✓ evicts lists all THREE squads, by name, untruncated
✓ poolAfter reads { heroes: 14, squads: 3, seatsNeeded: 18 }
✓ the rendered copy leads with the COUNT, then the names
✓ nothing is auto-substituted into the gaps
```

Then the branches: a hero in **one** squad renders singular; a hero in **none**
skips the confirm entirely. The template is plural by default, so these are the
paths that get less exercise — test them explicitly.

## The scout view — the disclosure boundary

```bash
curl /v1/players/$OTHER/scout | jq
```

Assert **present**: six Visible heroes · both types each · the 2/3/1 formation ·
rune slot elements and stages · **both** hold streaks.

Assert **absent** — and assert it by searching the whole serialised response, not
by checking fields you remembered:

```
✗ any stat value, base or runed
✗ which stat any rune boosts
✗ which utility effect a completed slot holds
✗ targeting priority or power ranking, in EITHER zone
✗ any Hidden hero, in any form
```

**The Hidden zone contributes exactly one number: its streak.** Two different
disclosure rules in one response is why this route is its own contract — a shared
serialiser between `scout` and the profile read is precisely how the Hidden squad
leaks.

## The firing profile — no round trip

1. Open the squad builder, drag a ranking widget.
2. **Watch the network tab. Nothing is requested.**
3. Set a ranking of `1·2·3·4·5·0` and confirm the builder reports **both ultimates
   dead** — availability scales with `1/(cooldown+1)`, so cheap powers ranked high
   starve expensive ones to exactly zero.
4. Confirm the profile is computed over **9 turns**, not 60. At 60 turns the
   tier-0 auto-attack shows a ~5% share; in a real battle it usually never fires.
   The number on the screen must describe the game being played.

Step 2 is the assertion. `firingProfile` lives in `@lmntlz/sim/rules` and the
client imports it. If a request appears, it moved back to `ai/`.

## The warnings that must not block

```
reach-1 hero in the back seat  → warning, save SUCCEEDS
ranking that kills two powers  → warning, save SUCCEEDS
hero already on the other zone → 409, save FAILS
five seats instead of six      → 422, save FAILS
```

The first two are *surface, do not block*: the back seat is priced and documented,
and the ranking is the player's lever. The last two are structurally invalid
squads. Eviction is the only thing that takes a **confirm** — it is destructive and
non-obvious.
