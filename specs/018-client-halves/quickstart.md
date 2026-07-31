# Phase 1 — Quickstart: verifying the client halves

**Date**: 2026-07-30 · **Plan**: [plan.md](plan.md)

Three screens, three journeys. **The audit that found these gaps is the test that
closes them.**

---

## 0 · The acceptance test, first

```bash
py tools/gap-audit.py
```

On 2026-07-30 it reported 16 gaps. When 018 is done, these five must be **gone**
from its output:

```
GET  /catalog            POST /checkout          GET /me/entitlements
POST /heroes/:p/runes/:p GET  /replays/:p
```

That is SC-008, and it is checkable rather than argued.

---

## 1 · A player places a rune (US1, SC-001–003)

**Precondition**: an account with ≥ 150 shards.

1. Open **Rune Forge** from the rail. All 27 heroes listed, filterable by
   *ALL / OPEN / BARE*.
2. Pick a hero, pick a slot. **Three slots — one primary, one secondary, one
   common** — and the element offered must match `slotAccepts()`.
3. **Plan without committing.** Move points between stats, watch the stat line
   update, then navigate away. Nothing was charged and nothing stored (FR-002):

   ```bash
   psql -c "select count(*) from shard_ledger where reason='rune-stage'"   # unchanged
   ```

4. Try to exceed **75 on one stat** — refused, with the cap named, before any
   charge (FR-004).
5. Try to commit with fewer shards than the stage costs — refused, and it says what
   is short.
6. Commit stage 1. Confirm: balance falls by **150**, the stat rises by **+20**, one
   `rune-stage` ledger row appears, and **gear score moves**.
7. Select a different element for an occupied slot. **The destroy warning must
   appear before the confirmation, name the consequence, and not be the default
   action** (FR-003, SC-003).

**Then the check that catches a transcribed number:**

```bash
rg -n "\b(150|200|650|75|20|10|5)\b" apps/client/src/features/forge --type tsx
```

Every one must come from `config.*` or `STAT_CAP` — never a literal (SC-002, R2).

---

## 2 · A player buys a pass (US2, SC-004–005)

> **⛔ Do not start this until 011 Phase 8 is green.** Until the boost actually
> doubles the first ten victories, this screen sells something that does nothing.
> Verify first:
>
> ```bash
> pnpm --filter @lmntlz/api test -- boost
> ```

**With a test rail installed** (no vendor needed — R5):

1. Open **The Store**. Seven durations, prices **from `GET /v1/catalog`**.
2. Confirm no price is hardcoded:
   ```bash
   rg -n "\$?(5|10|15|20|50|90|160)\b" apps/client/src/features/store --type tsx
   ```
3. Select a duration → the **statement descriptor appears adjacent to the pay
   control**, not in a footer (FR-007, 011 T026).
4. Complete a purchase against the test rail. The entitlement appears with its end
   date.
5. Buy again while active — **days add**, and the screen shows the combined end
   date, never a replacement.
6. Attempt a purchase that would breach the ceiling — **refused before the rail is
   reached** (FR-010).
7. **Uninstall the rail entirely** and reload. The store must say purchasing is
   unavailable — **not** offer a button that raises `NoRailError` on click (FR-009).
8. Confirm the reset time is **rendered from `today.nextBoundaryAt`**, not the
   string `00:00 UTC`:
   ```bash
   rg -n "00:00|UTC" apps/client/src/features/store    # expect no match
   ```

---

## 3 · A player watches a replay (US3, SC-006–007)

1. Open the battle list. Each entry shows whether it is watchable — **using the
   server's flag**, not a date the client computed:
   ```bash
   rg -n "Date\.now|concludedAt.*[<>]" apps/client/src/features/replays   # expect none
   ```
2. Watch a battle from the last seven days. It plays from the stored log.
3. Open an expired one. It must read **"no longer watchable"** — the outcome and
   record remain, and it must never look deleted (FR-012).
4. **The immutability check.** Watch a battle recorded before a balance change, then
   apply one, then watch it again — **identical** (SC-007). This is Constitution
   XVI, and the reason there is no re-simulation path:
   ```bash
   rg -n "resolver|seed|rand" apps/client/src/features/replays   # expect none
   ```
5. Request a replay for a battle you were not in — **`404`, never `403`**, so
   existence is not confirmed (FR-013, Constitution XVII).

---

## 4 · The boundary that must not move (Constitution XVII)

`GET /v1/me/runes` exposes stat allocations **to their owner**. The scout path must
still withhold them:

```bash
pnpm --filter @lmntlz/api test -- scout
```

Then read the serialised scout response by hand and confirm `allocations` is absent.
**Two functions, two files** — a shared serialiser with an `includeAllocations` flag
is one boolean away from publishing every player's build.

---

## 5 · Across all three (SC-009)

- Every screen reachable **from the rail** — `RUNE FORGE` and `THE STORE` now
  appear, since their destinations exist (FR-015).
- Every screen **leavable without a page reload** (FR-016). A finished purchase, a
  finished replay and a committed rune each need a way back.
- Every screen built from **017's components** — no private button, no colour
  literal:
  ```bash
  pnpm --filter @lmntlz/client test -- tokens
  ```

---

## Done when

- [ ] `py tools/gap-audit.py` no longer lists the five routes above
- [ ] A rune can be placed; the balance falls, the stat rises, gear score moves
- [ ] Planning charges nothing; the cap and the balance both refuse before charging
- [ ] No rune is destroyed without an explicit, non-default confirmation
- [ ] **011 Phase 8 green**, then all seven durations purchasable against a test rail
- [ ] With no rail, the store says so rather than failing on click
- [ ] A replay plays identically across a balance change; a non-participant gets `404`
- [ ] The scout response still omits `allocations`
- [ ] Zero transcribed numbers in `forge/` or `store/`
