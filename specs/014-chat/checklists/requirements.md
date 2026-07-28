# Specification Quality Checklist: Chat & Embeds

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

**FR-012 is stated as a prohibition because the natural implementation is the
wrong one.** *"Authorise, charge, persist, moderate, publish"* reads as a sensible
pipeline and would be a serious defect: the classifier batches 100 messages and
answers in minutes, so gating on it would stall a quiet guild channel for hours.
The rules place it **after send**, the batch shape makes gating impossible, and the
governing principle is *flag, never moderate* — three independent reasons, any one
sufficient. Two generated architecture diagrams drew it as a gate, which is why it
is a numbered requirement rather than a note.

**FR-007's subscribe-only is correctness, not hardening**, and the distinction
changes its priority. Some postings cost shards; a client able to publish directly
to the broker would bypass the charge. That makes it an economy requirement that
happens to look like a security one.

**FR-018's cap is on the rate, not the balance**, which is what defeats the
stockpile-then-spam failure. Capping the balance would have invited working around
it; capping posts per day makes accumulation pointless by construction.

**FR-013 is the load-bearing choice in the whole feature.** An embed is a
*reference* to server-held data, so **nothing in it is authored by a human** and it
carries **no moderation surface at all**. That is what makes paid postings cheap
enough to exist. An upload-based design would have needed image classification, a
review queue and a takedown path for every share.

**FR-015 has no exceptions and is written to have none.** *No embed may contain a
Hidden defense, by any route, including via a replay* — the replay clause matters
because a Visible-battle replay is embeddable and an ambush replay would otherwise
be a legitimate-looking hole. SC-002 counts routes, not cases.

**Two scope decisions recorded with their reasoning**, since both look like
omissions:

- **No league chat.** Promotion is one-way and permanent, so a league room would
  eject a player from their own conversations as a consequence of gearing up.
- **Envoys have no powers at all.** Volunteer moderators with real authority and no
  accountability is a well-mapped failure mode. They report as any player does and
  bypass no DM gating — the same *flag, never moderate* rule the classifier follows,
  applied to people.

**Beginner chat's risk profile is recorded rather than assumed.** A room of
brand-new players is where scams and grooming are aimed, and its occupants are
least equipped to recognise either — hence moderation priority over every other
scope.
