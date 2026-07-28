# Specification Quality Checklist: Progression — Shards, Runes & Rating

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 1 — all items pass.**

**This feature is the origin of Constitution XIV.** FR-009 — a replaced rune is
destroyed with no refund — is what makes a nerf *write off a player's spend*
rather than merely adjust a number. Everything in the balance-upward rule follows
from that one mechanic, and FR-015 is its counterpart: granted shards land even at
the cap, which is what makes *"grant shards to everybody"* a workable compensating
move rather than a slogan.

**Three payout ratios are load-bearing and are stated as such**, not as tuning:

- **A hold pays half an attack victory.** At parity, passive income would be
  **47%** of a typical player's shards — logging off competing with playing. At
  half it is **30%**. SC-002 tests the outcome rather than the constant.
- **Ambush doubles both shards and rating**, on both sides, which is what makes an
  attack streak an asset being built toward rather than a liability carried.
- **The daily tier taper** is what keeps hours from beating skill.

**FR-007 needed stating positively.** The Rune Forge screen enforced a
*distinct-stat* rule that was reversed — the three boosts **may** stack, and the 75
cap is the only constraint. Forbidding it would eliminate all **57 exact fills** on
the roster, which is the most satisfying thing a rune can do. Written as an
allowance plus one constraint so the reversal cannot be re-introduced by someone
reading the screen.

**Rating's convergence is specified by what it disarms.** A convergent number
means beating a much weaker opponent moves almost nothing, so **farming one weak
defender and grinding curated bots are both handled by the shape of the number
rather than by a rule**. SC-004 tests that directly, which is stronger than
testing the formula.

**Two scope boundaries held firmly:**

- **Gear is not in rating** (FR-023, SC-009). Feature 09 owns the gear axis; this
  one owns skill. Collapsing them would treat a well-played weak account and a
  badly-played strong one as identical.
- **Shards cannot be bought.** This feature owns what shards *do*; feature 11
  owns money, and money never becomes shards directly.

**Recorded as tuning rather than decision:** convergence band values, daily tier
boundaries, and the 33 utility magnitudes. In each case the *shape* is settled and
the number waits on a simulated population or the hero-numbers pass.
