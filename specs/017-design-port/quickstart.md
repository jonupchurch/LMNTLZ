# Phase 1 — Quickstart: verifying the design port

**Date**: 2026-07-30 · **Plan**: [plan.md](plan.md)

How to prove 017 works. Every check below maps to a success criterion in
[spec.md](spec.md).

---

## Prerequisites

```bash
pnpm install                 # picks up the three @fontsource packages
pnpm icons:build             # regenerates the icon manifest
pnpm --filter @lmntlz/client dev
```

---

## 1 · The type actually loads (SC-001)

**The failure this catches has been live since feature 006** — three families
declared in `base.css` and none of them ever fetched.

1. Open the app in a **fresh profile** with an empty cache.
2. DevTools → Network → filter `Font`. **Expect `woff2` responses served from the
   app's own origin.** Any request to `fonts.googleapis.com` or `fonts.gstatic.com`
   is a failure — Constitution XIX and the Steam-from-disk build both forbid it.
3. Inspect a heading, body copy and a numeric readout:

   ```js
   getComputedStyle($0).fontFamily     // Chakra Petch / Barlow / JetBrains Mono
   ```

   `system-ui` anywhere means the token still resolves to nothing.

4. **Then kill the network entirely** (DevTools → Offline) and hard-reload from the
   built bundle. The fonts must still render — this is the Steam case, and it is the
   reason they are self-hosted rather than linked.

---

## 2 · Every component exists in every state (SC-003)

```bash
pnpm --filter @lmntlz/client test -- components
```

Then open the gallery route and read it beside
`resources/designsystem/LMNTLZ Design System.dc.html`:

- **Seven** button states, visually distinct.
- Nine type badges — and confirm none takes a colour prop.
- The relationship strip shows **five** tiers. The export draws four; **canon
  wins**, and `×0.80` must be present.
- Hero card at three scales, same data in each.
- A cooldown ring at 3 of 5 turns. **It must not animate against a clock** — step
  the turn and watch it move in one discrete jump.

---

## 3 · No number came from a screen (SC-002, SC-008, SC-010)

The single most important check in this feature.

```bash
# every player-visible multiplier must come from the generated matrix
rg -n "1\.2\b|0\.8\b|1\.25|1\.5" apps/client/src --type ts --type tsx
```

Every hit must be an import from `@lmntlz/content`, never a literal. Then:

```bash
git diff --stat resources/mechanics/    # MUST be empty
```

**017 changes no rule.** If a mechanics document moved, a number leaked from an
export into canon, which is exactly what FR-017 forbids.

Finally, the token scan:

```bash
pnpm --filter @lmntlz/client test -- tokens
```

It strips comments before scanning (a scan forbidding hex matches the comment
explaining the ban) and asserts it **found files** before asserting their content
(a glob that matches nothing passes forever). Both have bitten this repo.

---

## 4 · Icons resolve, and a miss fails the build (SC-004)

```bash
pnpm --filter @lmntlz/client typecheck
```

Then prove the guard is real rather than decorative:

```bash
# mutation test — copy first, restore from the copy, never `git checkout`
cp packages/content/src/heroes.generated.ts /tmp/heroes.orig
# rename one hero's slug, regenerate the manifest, and typecheck
pnpm icons:build && pnpm --filter @lmntlz/client typecheck   # MUST fail
cp /tmp/heroes.orig packages/content/src/heroes.generated.ts
md5sum packages/content/src/heroes.generated.ts /tmp/heroes.orig   # must match
```

> **`git checkout` is not an undo here.** It restores HEAD, not your edit, and has
> silently destroyed work in this repo twice. Copy, restore from the copy, and
> assert the restore.

**Status icons**: the registry loads, but nothing renders one from live data —
the engine emits no statuses (`research.md` R3). Confirm the guard **says so**
rather than passing quietly.

---

## 5 · The screens match, and still work (SC-005)

For each of the eleven ports, side by side with its export at **1600×900**:

- same regions, same hierarchy, same type ramp;
- **the data is unchanged** — the port must not add or remove a field.

Then the part a human cannot eyeball:

```bash
pnpm --filter @lmntlz/client e2e        # every pre-existing pass, unchanged
```

A re-skin that breaks a journey is a regression, not a port (FR-012).

---

## 6 · The shell holds at both ends (SC-007, SC-009)

| Width | Expect |
|---|---|
| **1280** | no horizontal page scroll, no reflow to one column; the inspector may become a drawer |
| 1600 | as drawn |
| **2400** | content capped ~1400 and centred, rail pinned left |

And the rail itself:

- **Every entry leads somewhere.** Click all of them (FR-015). `RUNE FORGE` and
  `THE STORE` must be **absent** until 018 builds them; `DISPATCHES` absent until 016.
- `THE COURT` expands to Profile · Battle Record · Guild.
- Exactly one entry is active per screen.

---

## 7 · Keyboard only (SC-006)

Unplug the mouse. Tab through every screen:

- every interactive element reachable, in a sensible order;
- **a visible focus ring on each** — `base.css` forbids removing it, and this is a
  keyboard-and-mouse game with no touch, so the ring is the only thing telling a
  player where they are;
- the rail is reachable and its groups expand from the keyboard.

---

## Done when

- [ ] Fonts render offline, from our own bundle
- [ ] Gallery covers every component × every state
- [ ] Zero colour literals, zero transcribed multipliers, `resources/mechanics/` untouched
- [ ] 27/27 hero icons resolve; a deliberate miss **fails typecheck**
- [ ] Eleven ports match their exports; every prior e2e pass still green
- [ ] 1280 / 1600 / 2400 all hold; every rail entry leads somewhere
- [ ] Full keyboard pass with visible focus throughout
