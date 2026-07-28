# Specification Quality Checklist: Guilds

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

**The deferral is stated as a coupling, not a cut.** A Wing exists *only* for an
event, so deferring events defers Wings — they are not separable, and pretending
otherwise would leave a structure with no purpose. Guilds still earn their place at
1.0 for an unrelated reason: **joining and founding are two of the four exits from
the starter league**, which puts them on the new-player path regardless of whether
anything competitive exists yet.

**FR-015 is the requirement most likely to go missing**, and it has already gone
missing three times. The starter-league warning hangs off *another* feature's
action, so it lives at a seam — which is exactly why
`resources/07-onboarding-flows.md` carries a `MUST SAY` block about it. It must
appear on **both** doors, and naming only one of the two losses does not satisfy
it. SC-002 tests both conditions together.

**FR-011 is a near-duplicate that is not redundant.** The invitation side carries a
similar-sounding line about withdrawal, which makes the application side *read* as
covered when it is not. The application is where the decision is actually made —
a player who applies and is admitted a day later would otherwise be graduated from
the starter league by **someone else's click**, at a moment they were not present
for.

**FR-022 is phishing-resistant by construction rather than by warning.** The
succession email needs no clickable action because **logging in is the reply**. So
the message can contain no link that grants anything, which forecloses the
*"click here to keep your guild"* lookalike entirely. Worth holding future
transactional mail to the same test.

**FR-026 is a definition change, not an exception**, and the distinction is why it
works. A newly founded guild is *considered active* for 14 days regardless of
headcount. Written as an exception it would need special-casing everywhere activity
is read; written as a definition it needs none.

**The succession fee's justification is recorded because it looks like revenue and
is not.** It prices a manual support ticket, makes the displaced master whole, and
is economically neutral — 650 moves between players. *Losing a guild you abandoned
is not the same as being robbed.* The asymmetry with disbanding is deliberate: the
rule is *a guild costs 650 to hold*, not *you get your money back*.

**One consequence of deferring guild funds is named rather than left implicit:** a
new guild cannot advertise using funds it does not have, so feature 14's **free
daily posting credits** are the only thing making recruitment possible at 1.0.
