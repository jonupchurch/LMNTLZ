# LMNTLZ · resources

Design-prompt library and lore codex for **LMNTLZ** (working title) — a fantasy battler where the engine runs squad **defense** and the player commands the **offense**.

## Claude Design prompts (one file = one prompt)

Run them in order — later prompts reuse the tokens the earlier ones establish. Paste each file's `## PROMPT` block into Claude Design.

| Order | File | Produces |
|---|------|----------|
| **1st** | `brand-identity.md` | Wordmark suite, monogram/app icon, the nine colors as one brand spectrum, voice — **generate first** |
| **2nd** | `design-system.md` | The in-app UI kit: tokens + component library, **with the tech stack that shapes it** |
| 3rd | `01-hero-card.md` | The hero card at 3 scales (detail / grid tile / battle chip) |
| 4th | `02-roster.md` | Roster browser — allocation state, type + weakness filters |
| 5th | `03-squad-builder.md` | Pick-6 builder in the 2/3/1 formation, for attack and auto-run defense squads |
| 6th | `04-battle-screen.md` | Battle UI + combat feedback (player offense vs. engine defense) |
| 7th | `05-matchmaking-results.md` | Opponent scouting + post-battle results |
| 8th | `06-chat-embeds.md` | The four paid chat postings — guild promotion, looking-for-guild, a defense you're facing, your own squad |
| 9th | `07-onboarding-flows.md` | Guild invites, applications, the officer review queue, and profile setup — **carries the beginner warning as a MUST SAY block** |
| 10th | `status-icons.md` | In-battle status pips — 16 new glyphs plus pip-scale variants of the ten stat icons |

## Generated design output

> **These are for look and feel, not rules.** When a screen disagrees with a
> decision made in discussion, the discussion wins and the screen is wrong —
> however finished it looks. The rules live in `../CLAUDE.md`, `mechanics/` and
> `LORE-and-flavor.md`. Anything a screen appears to settle is a **proposal to
> confirm**, not a decision. The notes below record discrepancies so nobody
> builds from them; they are not a fix queue.

- `designsystem/` — the rendered Claude Design deliverables. **Anything landing in this folder is intentional and gets committed.**
  - `LMNTLZ Brand Book.dc.html` — output of `brand-identity.md`
  - `LMNTLZ Design System.dc.html` — output of `design-system.md`
  - `LMNTLZ Hero Card.dc.html` — output of `01-hero-card.md`. Current; includes the reach treatment.
  - `LMNTLZ Matchmaking and Results.dc.html` — output of `05-matchmaking-results.md`. Current: single Attack CTA, the Hidden Six unselectable, ambush framing, and both defensive hold streaks (`zoneStreak` / `hiddenStreak`). **One defect:** the ambush chance is computed as `MY_STREAK * 2` with no cap, so it will display above 100% past a 50-win streak. It needs clamping to the 90% cap.
  - `LMNTLZ Battle.dc.html` — output of `04-battle-screen.md`. Not yet verified against the mechanics.
  - `LMNTLZ Guild Creation.dc.html` — founding a guild and editing its stored properties. **Correct on the emblem system** (`36 EMBLEMS · 12 INKS`), on **three wings of eight · 24 seats**, and on the **recruiting pitch being a stored guild property** validated for length rather than typed per post — which is what keeps the Guild Ads promotion free of a per-post moderation surface. **Three defects.** (1) **Founding costs 2,500 shards** (`canAfford = s.shards >= 2500`); the decided price is **650 — one full rune** (`mechanics/08-guilds.md`). (2) **8 grounds, not 12**, giving 3,456 combinations against the specified 5,184. (3) **The contrast check is a gate, and it must be a warning.** Surfacing the ratio is *useful* and the readout should stay — *"Ink and ground are too close · 1.4:1"* is good feedback. What is wrong is that it **blocks submission**: the two palettes are meant to be **disjoint so illegibility is unreachable by accident**, and a guild is **explicitly allowed** to blank its icon into a solid block on purpose. Gating turns a deliberate aesthetic choice into an error message. **Harm is a gate; taste is a note.** **It also omits the beginner warning**, and founding is a **third door** out of the starter league — reachable in 1.5 days at the beginner earn rate. **Four proposals it invented.** The **2–4 character guild tag** is **rejected** — it is the only free-text field short enough to be un-moderatable, since three characters cannot be read in context and compression is exactly what defeats a blocklist (`mechanics/08-guilds.md`). Still open: **the name being permanent**, where player renames are merely *sold*; a **160-character MOTD** distinct from the recruiting pitch; and an **event window** declaring when a wing gathers.
  - `LMNTLZ Onboarding Flows.dc.html` — guild invites, guild applications and profile setup. Generated before a prompt existed; **`07-onboarding-flows.md` was written afterwards from this screen plus the corrections below**, so a regeneration should now hold. **Correct on most of the rules settled 2026-07-28:** applications are **free**, capped at **5** (`3 OF 5 APPLICATIONS OPEN`), expiring (`EXPIRES IN 6 DAYS`); invites state **`ACCEPTING ANY ONE WITHDRAWS THE REST`**; the event lock reads right (*"Wings lock during an event… a vacated seat stays held until the event closes"*); and profile setup says outright **"Nothing here exposes your Hidden Six."** **The starter-league warning was added 2026-07-28 and is now on both doors** — *"YOU WILL LEAVE THE BEGINNER LEAGUE · Joining ends your beginner protection immediately and permanently — you keep every champion, rune and rating…"*, with a remaining-time counter. Naming what is *kept* is better than the rule asked for. The **×1.5 shard bonus is now named** in the same sentence, so both losses are stated as `09-matchmaking.md` requires. **One defect was corrected by hand on 2026-07-28, at Jon's explicit request** — the only screen in this folder that has been edited rather than regenerated. It read *"you will be scouted by wardens far above you"*, which **contradicted the league guarantee**: a graduating player enters Bronze at the 1,500 floor and meets at most **1.67×** that, with bots padding Bronze so the bound holds when the league is thin. It made graduating sound dangerous when the entire point of leagues is that it is not, aimed at exactly the players least able to tell — and it was **self-defeating**, since guild joining is the retention loop the warning sits in front of. Now reads *"you will face real wardens instead of bots"*, closing with *"Your league keeps you matched near your own strength."*

    > **The correction is now pinned in `07-onboarding-flows.md`** as a *MUST SAY* block, along with the two divergences below. Before that it lived only in this artifact and any regeneration would have reintroduced it. **Two divergences to confirm:** it shows `ONE APPLICATION PER GUILD PER DAY` as a blanket limit, where the mechanics set a 24h cooldown only **after a dismissal** — stricter and simpler, possibly better; and it never states the **first-acceptance-wins** contract on the application side, which the mechanics say must appear where a player applies. **Proposals for the still-open 4.10 (profiles):** it makes profile visibility **player-configurable** — roster power, battle record, squads, hours, online — rather than fixing what is public, and defaults **battle record to visible**, which is the one field worth arguing about since a public win/loss is what makes players avoid battles to protect a number.
  - `LMNTLZ Broadcast Messages.dc.html` — output of `06-chat-embeds.md` (note the name differs from the prompt file). **Correct on the rule that mattered most:** the wall report states *"the visible wall only, never the Hidden Six,"* so the Hidden zone is excluded rather than shown-and-disabled. Also right on `5 / 24` open slots, league + roster power on the looking-for-guild post, and guild shards as a balance distinct from personal ones. **One defect:** posting costs are **150–400**, against the decided **5 shards** (`mechanics/11-social.md`). At 388 shards/day the screen's numbers are 39–103% of a full day's income for one chat message, which is not "nothing outrageous." The rule wins; the screen is wrong. **Two proposals worth confirming, both good:** a wall report **expires in 1 hour and requires a live scout** — a stale defense posting is worthless once the defender edits, and nothing in the mechanics says so; and looking-for-guild posts are **guildless players only**, which forecloses guild-shopping from inside a guild. Neither is decided. It also names an **officer-and-above** permission for spending guild funds, which is consistent with the guild-leader delegation lever but has never been specified.
  - `LMNTLZ News.dc.html` — an in-app **Dispatches** feed (news, patch notes, codex, event calendar). No prompt file produced it; it is a seventh screen beyond the six above. Mechanics read correctly — ambush at 2%/win, the reach rule including own-row cost and free empty rows, Bane as underivable, 27 − 12 = 15. **Two defects:** the balance article's dek says "six of nine types were already identical" (it is seven — the body's own 1.037 / 1.019 figures are right), and the service article says a dropped connection discards the battle, which contradicts re-derivation from the action log; discard is the *maintenance* rule only. It also invents policy we have not settled: maintenance drain windows, seasons with a pass timer, timed event modes, and two new destinations (The Court, Codex).
  - `LMNTLZ Roster.dc.html` — output of `02-roster.md`. **Stale — do not build from it.** It was generated before the roster rules changed and still carries the collection model: an owned / "Unrecruited" filter, a locked-hero count, and an `X / 27` collection meter. None of those exist any more, and it lacks the assignment-status filter and allocation header that replaced them. Regenerate from the current `02-roster.md`.
  - `LMNTLZ Chat.dc.html` — chat across four channels (realm-wide, guild, and two read-only system feeds), with squad/replay attachments. No prompt file produced it; an eighth screen. Mechanics read correctly — ambush arithmetic (`4 wins → 8%`), the Hidden squad as the thing you are ambushed *into*, the maintenance discard rule stated correctly here, and a shared six whose "nothing shares a Bane" claim actually checks out. **Two defects:** the guild cap is shown as **20**, not 24, and there is no sign of the three-Banner event split — the guild card tracks one flat weekly goal instead. It also assumes realtime infrastructure the stack does not have (see `docs/tech-stack.md` → Still open) and invents moderation policy: slow mode, a 240-character cap, MOD/OFFICER roles and a reporting flow.
  - `LMNTLZ Guild Roster.dc.html` — the guild's three Wings and their members. **The most accurate export so far, and currently the reference for guild vocabulary:** `23 / 24` wardens against the real cap, three Wings at `cap: 8` named FIRST / SECOND / THIRD WING, per-member contribution scores with a sort-by-contribution control, and every rank tier drawn from the real ladder. Two gaps rather than defects: the weekly goal is a single flat guild-wide number rather than per-Wing leaderboard placement, and "rotates into First Wing weekly" implies a promotion system that is not specified anywhere.
  - `LMNTLZ Guild Admin.dc.html` — GM/Officer management: invite, remove, recruitment mode, tagline, and Wing assignment. Enforces `CAP = 8`, demands a **swap** when a target Wing is full so filling one never leaves another short, and **implements the event lock faithfully**: an `open` / `locked` phase with a countdown both ways, reassignment refused while locked, and removal tracked per Wing in a `vacated` counter that `countIn` adds back — so a vacated seat still reads as occupied and genuinely cannot be refilled, then releases when the event ends. **One gap:** there is no **Grounded** state. Every member carries `wing: "1" | "2" | "3"`, so a mid-event recruit has nowhere to sit and `WINGS[m.wing].name` has no null branch. Invitations are correctly still enabled during a lock, which makes the gap reachable rather than theoretical — someone can be invited mid-event and then cannot be represented. **Grounded needs to be a fourth value of `wing`** — an uncapped slot shown alongside the three Wings, freely assignable in both directions while unlocked, frozen while locked, and applied automatically to anyone who joins mid-event. See `mechanics/08-guilds.md`.
  - `LMNTLZ Codex.dc.html` — the in-game codex: world, the Nine Forces, the derivation rule, squads, reach, stats, powers and the Courts, plus a full 27-hero compendium. **The best-verified export in the folder.** It does not hand-author weaknesses — it computes `bane = COUNTER[primary]` and `fault = COUNTER[secondary]` from a `COUNTER` map that matches the canon bijection exactly, which is the derivation rule implemented rather than described. All 27 heroes' type/secondary pairs were compared against `characters/MATCHUPS.md`: **0 mismatches.** Squads are correctly 6 in 2/3/1. It also **assigns reach to all 27 heroes** — 12 at reach 1, 15 at reach 2, with every type having at least one of each — which answers an open question in `mechanics/02-squads.md`. Minor: it supplies epithets for the five heroes that `MATCHUPS.md` lists without one (Tidewarden Coll, Auriel Dawnkeep, Reyna Two-Rivers, Silka Pinquick, Hettamar Ironfall).
  - `LMNTLZ Profile.dc.html` — a player's own page: avatar picker, season/lifetime records, most-fielded champions, Force-share breakdown, guild standing and milestones. Vocabulary is right — *"Sworn to The Rooted Deep · First Wing · Officer"*, a `WING SHARE` contribution figure, ambush-survival counts, and a Force-share table that sums to exactly 100%. **Two lines of flavor text contradict settled rules and are both deliberately left alone** — noted so nobody builds from them, not queued as fixes:
    - *"Wing trial, three rounds"* / *"fell in the semifinal to Ninefold Vigil"* describes a knockout bracket. Wings tally against a global board and never battle each other. **Event design is parked until much later**; `mechanics/08-guilds.md` is authoritative when it resumes.
    - *"Full roster — All 27 champions recruited — 27/27"* implies a collection system. **All 27 heroes are unlocked from the start** — the milestone is unearnable by definition. Do not read a recruitment or unlock system into it.
  - `LMNTLZ Battle Record.dc.html` — battle history with attack/defense filtering, replay links, a guild-member breakdown and a guild leaderboard. **Models the Visible/Hidden mechanic exactly right:** `wall: attack ? (ambush ? "HIDDEN SIX" : "VISIBLE") : "YOUR WALL"` — an ordinary attack meets the Visible squad, an ambush routes to the Hidden Six, and defending shows your own wall. Ambush is correctly generated only on attacking battles, squads are 6, and all 15 guilds on the leaderboard sit at or under the 24 cap. **One data defect:** the member list puts **9 wardens in First Wing against a cap of 8** (7 / 7 in Second and Third, 23 total). Guild Admin enforces `CAP = 8`, so the two screens disagree. Minor: the opponent list mixes guild names (*Ninefold Vigil*, *Umbral_Court*) in with player handles, though you attack players' defenses rather than guilds.
  - `LMNTLZ Turn Sequence.dc.html` — the five-phase turn, one panel per phase with sub-steps, formulas, stats in play and edge cases. **The closest an export has come to matching the mechanics.** Phases, order and names match `mechanics/04-turns.md` exactly; the reach formula is stated correctly (`occupied_rows_between ≤ reach`, target's row counted, actor's not, empty rows free); the attack builds `Might × multiplier → type effectiveness → crit` in the right order with the crit rolled attacker-side; riders stage in Attack and are contested per-rider against `Resolve` in Defense; Defense is explicitly per target; and **cooldowns step in Resolution**, matching the decision made the same day. It also catches a case the doc had missed — **no legal target in reach → the champion passes**. Worked example checks out on the derivation: Nyxara is Dark/Water, Auriel Dawnkeep is Light/Water, and Dark is indeed Auriel's Bane.
    - **Two internal contradictions, both real logic defects.** *Durations:* phase 5 says every timed effect "on the actor, the target, and everyone else" decrements once per turn, but phase 1 ticks damage-over-time only on the bearer's own turn. With 12 champions on the field a 3-turn burn would expire after a quarter of a round while having dealt damage once. Durations must tick on the **bearer's** turn, in step with Upkeep — `mechanics/04-turns.md` now says so explicitly. *Cooldowns:* the section-01 caption has the **round** advance stepping every ring, while phase 5 step D has the **actor's** Resolution stepping them. Only the latter is right. Separately, the header banner claims "a miss … short-circuits to resolution", which contradicts the screen's own per-target model — a miss on one of three targets cannot end the turn.
    - **It predates one decision:** a power dealing neither damage nor healing skips phase 3 entirely and is contested in phase 4. The screen has no such path.
    - **One proposal adopted from it:** **reactive powers** — a defender's counter firing at a fixed point inside the attacker's phase 4, one layer deep, forbidden from triggering another reaction. Taken up into `mechanics/04-turns.md` along with the screen's five-step ordering for that phase. This is the export earning its keep: it proposed a mechanic, and the mechanic was good.
    - **Still proposals, not decisions.** Damage multipliers are tagged SETTLED but only the Bane's ×1.5 is — **Fault ×1.2 and a ×0.5 against either of the target's own Forces are new**, and `../CLAUDE.md` lists multipliers beyond the Bane as undecided. Also new: **shields/wards** as an absorb layer ahead of the health pool, a **minimum 1 damage** floor, **silence** blocking powers but not the rank-0 auto-skill, and **late resistance** — re-testing long control against `Resolve` as it ticks, which the screen honestly tags OPEN.
    - Minor: Nyxara is drawn at reach 2 against the reach 1 proposed in `characters/hero-stats.xlsx` (reach is parked, so this is cosmetic), "Veilstep" is not one of her six power names, and "Light is not her Bane" is wrong on the natural reading — Light *is* Nyxara's Bane; the sentence only works if "her" means Auriel.
  - `LMNTLZ Rune Forge.dc.html` — the rune shop: pick a hero, pick one of three slots, advance it a stage or destroy and rebuild. No prompt file produced it; a fifteenth screen. **The most faithful export in the folder**, and it implements `mechanics/06-progression.md` rather than describing it. `STAGE_META` is exactly `[+20 @150, +10 @150, +5 @150, utility @200]` for 650 a rune; `slotElement(hero, i)` returns `i===0 ? hero.type : i===1 ? hero.second : null`, which is the primary / secondary / common model precisely; the header reads *"PLANNING IS FREE · COMMITTING IS PERMANENT"*; utility is gated behind completion (*"PASSIVES FROM COMPLETED RUNES"*); the stat line caps at 75 and shows BASE / PLACED / DRAFT / TOTAL; and the complete-slot copy states the no-piecemeal rule outright — *"To change what it does, the rune must be destroyed and rebuilt from stage one."* Rebuild is correctly one transaction rather than four.
    - **One logic defect: it enforces a distinct-stat rule that was reversed.** The picker is captioned **"MUST BE A DISTINCT STAT"** and a `takenSet` blocks a stat already used elsewhere in the same rune. Settled 2026-07-27: **the three boosts may stack on one stat, and the 75 cap is the only constraint.** The rule the screen enforces forbids all **57 exact fills** on the roster — the 50 hero-stat pairs where 20+10+5 lands precisely on 75, and the 7 where 20+10 does — which is the most satisfying thing a rune can do. It also reduces the trace boost to a throwaway third stat. See `mechanics/06-progression.md` → *The boosts may stack on one stat*.
    - **One naming defect: 8 of its 23 proposed utility effects reuse existing power names.** `Find the Seam` (Pierce House passive), `It Catches` (Fire House passive), `The Cut Reopens` (Slash House passive), `It All Comes Back` (Marisel), `Nothing Left to Take` (Pyrrhic), `Open Line` (Kaellis/Reyna tier-0), `The Undenied` (Mauless tier-5) and `The Undoing` (Umbriel tier-5) all already exist in `characters/hero-stats.xlsx`. Two more are near-collisions — `Single Truth` against `The Single Truth`, `Unhidden` against `The Unhidden Hour`. Two different mechanics sharing a name is a real problem for a game whose whole vocabulary is power names.
    - **Its 23 utility effects are a genuine proposal, and the pools are an open item.** 5 common — `The Longer Look` (+1 reach), `Opening Ward` (shield worth 12% of the pool), `Certain Opening` (first strike cannot miss), `Unmoved Once` (ignores the first control effect), `Last Word` (+15% below a third pool) — plus 18 elemental. Worth reviewing on merit and renaming; **not adopted**.
    - Minor: the `SEED` comment calls five partially-runed heroes "the starter grant", but the starter is **12 heroes carrying one complete rune each** (7,800 shards). The seeded 4,260-shard balance is a demo state, not a claim about starting funds.
  - `LMNTLZ Architecture.dc.html` and `LMNTLZ Architecture Chart.dc.html` — output of `../docs/architecture-diagram-prompt.md`. **The first non-game exports in the folder**, and unlike a screen they are downstream of a decision record rather than proposals about one: `../docs/tech-stack.md` is authoritative and a disagreement is a defect in the chart, not an idea to weigh. The first is a document-style read-through, the second a node-and-edge chart with numbered edges; they carry the same content.
    - **The seam survived, which was the whole test.** Both draw `packages/sim` as **two blocks** — RULES (client + server, *pure · no randomness*) and RESOLVER (*server only · consumes randomness*) — with the seed line drawn as a **boundary, not a data flow**. Collapsing that into one box named after the package was the failure mode the prompt's *MUST SHOW* block existed to prevent, and neither export did it. Both also carry the *why*: the client holds rules so it can draw targeting, project the turn queue and preview effectiveness without asking the server anything.
    - **Correct on everything else checked:** the API holds no open socket and the client's WebSocket goes **directly to Ably**, drawn as two arrows rather than one line through the API; subscribe-only is framed as **correctness, not hardening**, with the reason (a direct publisher would bypass the shard charge); the three maintenance states read `live` / `draining` / `down` with the right in-flight behavior each; **no in-progress battle state** is stored; Vercel Blob expires at 7 days with cleanup **driven by a Postgres query, never by listing the bucket**; Edge Config carries the flag *and nothing else*; Sentry receives from **both** client and API; Google and Steam **converge on one account**; entitlements belong to the account, never the storefront; and Steam is called out as a second shell rather than a second backend.
    - **One defect: the relational store is labeled `KEPT FOREVER` / `FOREVER` across its whole contents, with chat listed among them.** Only **battle metadata** is permanent. `mechanics/11-social.md` → *Retention* keeps chat messages in **their own tables under a retention policy** — durations still open (*short / ~30 days / longest* is the shape), with **Direct holding the longest history** because reported content must outlive its channel. The own-tables separation is lost too, and it is deliberate: it is what makes moving chat to its own store later mechanical rather than a rewrite. A blanket permanence label would mislead anyone building the schema.
    - **One omission, and it is the prompt's fault rather than the export's.** Neither chart has a node for the **AI moderation classifier**, though both draw the chat flow through *"authorizes, charges, persists and **moderates**"* — a step that leaves our infrastructure entirely. `mechanics/11-social.md` settled it on 2026-07-27: **Claude Haiku 4.5**, every message read and **nothing sampled**, batched **100 to a call** through the batch API, at **$68 / $338 / $675 a month** at 10k / 50k / 100k DAU. That is the **largest managed-service line in the stack** — more than Ably, Resend and Sentry combined at the top end — and it had never reached `../docs/tech-stack.md`'s table, so the prompt never asked for it.
    - **Both were corrected on 2026-07-28 and both fixes verified.** The store now reads `PERMANENT` against `CHAT TABLES · RETENTION-BOUND` (the chart headers it `MIXED RETENTION`), each carrying the own-tables reason; and both gained an `AI chat moderation · EVERY MESSAGE` node marked `AN OUTBOUND CALL LEAVING ZONE 2`.
    - **The second fix introduced a third defect, and that one is also the prompt's.** Both now render flow ② as *"authorizes, charges, persists, **then calls the classifier** — and only then publishes"*, because the prompt said *"calls the classifier → **then** publishes."* **The classifier is not a gate.** `mechanics/11-social.md` → *Moderation* places it **after send** and what actually gates a message is the **slur blocklist**, rate limit and length cap — all local, none shown on either chart. It cannot be a gate for three independent reasons: the rules put it after send; a batch API accumulates 100 messages before dispatch and answers in minutes, so a quiet guild channel would stall for hours; and the governing principle is **flag, never moderate** — withholding a message until classified *is* moderating. **Moderation is two tiers — a synchronous cheap gate and an asynchronous thorough flag — and the classifier arrow belongs alongside delivery, not inside it.** Prompt and stack record both fixed; regenerate.
    - **A third pass on the chart (2026-07-28) was layout-only** — edge labels shortened to fit (`read / write` → `r/w`, `publish over REST` → `publish`). **The classifier defect persists in both files** and `LMNTLZ Architecture.dc.html` was not touched at all. No regressions: the two-block seam, the seed boundary, the mixed-retention split and *holds no open socket* all survive. **The prompt already carries the correction in three places**, so it is a matter of re-running rather than of anything further to write down.
  - `hero-icons/` — 27 hero emblems + a 3×9 overview sheet.
  - `status-icons/` — output of `../status-icons.md`. 71 SVGs (**26** `status-*`, **43** `pip-*`, **2** `overlay-*`) plus `LMNTLZ Status Icons.dc.html`. **The most conformant asset delivery so far.** Every SVG carries a `0 0 64 64` viewBox, an `id` matching its filename, and no fonts or `<text>`; the `#14121F` keyline is present on all 71, implemented as a **double-draw** — the glyph stroked at width 10 in the keyline colour, then redrawn at 3.5 in the fill colour — rather than `paint-order: stroke`. That is the more robust technique and renders identically in engines without `paint-order` support. The mechanical copy was checked line by line against `mechanics/05-status.md` and is **correct throughout**: `Slow` folds onto the Speed debuff, shred folds onto Armor / Magic Resist at −20 / −30 / −40%, magnitudes read ±10 / ±15 / ±20 / ±25, durations tick on the bearer's own turn, damage-over-time stacks to 3 per target, and the four uncleansable sources are named with the correct note that all of them still expire. All **eight** deliberately-iconless effects match the spec exactly, and the worked chip orders its pips crowd control → damage-over-time → everything else with the ward correctly carrying no numeral.
    - **One data defect: the worked chip shows Pyrrhic at `980 / 1 720`.** `HP = Toughness × 50` and Pyrrhic's `Toughness` is **25**, so max HP is **1,250**. No buff reaches 1,720 either — a tier-1 `Toughness` buff gives 35 → 1,750 and a tier-4 gives 45 → 2,250. The figure derives from nothing.
    - **One duration defect, and the prompt was equally wrong:** `Exposed` is labelled `REST OF BATTLE`. It comes from the Light rune `Held in the Light`, which stops enemies *below half HP* from dodging — heal them above half and it stops applying. It is **conditional**, not persistent. `status-icons.md` defined only three duration classes and now defines a fourth; regenerate against the updated prompt.
    - **One open question the prompt introduced rather than the screen:** `All One Piece` (cannot be critically hit) gets a pip while `Straight Past` (attacks ignore shields) is on the iconless list, though both are permanently true from the first moment of a battle. The distinction that probably wants making is **whose champion the effect sits on** — a defender's rune effects are invisible to the attacker and have to announce themselves, while a player already knows their own. Not settled.
    - Minor: no `00-overview.svg` companion of the kind `damage-types/` ships. The `.dc.html` does overview duty instead.

Typefaces settled by these: **Chakra Petch** (display), **Barlow** (UI/body), **JetBrains Mono** (numeric/stat). The base surface also tightened to `#0E0C17`, slightly darker than the `#141221` the prompts specified — treat the generated system as the source of truth where the two differ.

> These exports reference a sibling `./support.js` that isn't in the folder, so they won't render standalone in a browser as-is.

## Platform

LMNTLZ is a **desktop game**: an Electron client shipped on Steam and as a standalone installer, plus the same static build served in a desktop browser. Mouse and keyboard, minimum window 1280×720, designed for 1600×900. **There is no mobile or touch target** — every design prompt here assumes a pointer.

Gameplay is **server-authoritative**: the client sends an intent, the server resolves it and returns the result, so every action carries network latency and needs an in-flight state. See `design-system.md` for the full technical context designers need.

## Mechanics

- `mechanics/` — the systems layer: how the game actually resolves. `01-stats.md` (the ten stats + damage pipeline) is drafted; powers, turns, status effects, progression, and defense AI are still to come. See `mechanics/README.md` for the running index and what blocks what.

### Discrepancies found by the Phase 0 pass — **2026-07-28**

Running the specs' Phase 0 research meant re-deriving several recorded figures from
the authored workbook. **Almost everything reproduced exactly**; these did not. Both
scripts live in `../tools/` and are read-only, so any of this can be re-checked in
seconds.

- **`07-defense-ai.md` — the `1·0` rule is wrong by one, and it is self-contradicting.**
  It states *"Exactly 12 of 720 orderings are healthy for all 27 heroes, and every one
  of them ends `1·0` … That is a structural rule, not a style."* **Eleven do.** The
  twelfth is **`4·3·2·1·5·0`**, which ends `5·0` — and it is the **published Tank
  default**, described three paragraphs later as *"the only safe ordering that trades
  the ultimate for uptime."*
  **The real structural rule is *tier 0 last*, and unlike the `1·0` claim it is
  provable rather than measured**: a power fires only when everything above it is on
  cooldown, and the tier-0 auto-attack has cooldown 0 and no gate, so anything below it
  never fires. All 12 satisfy it. It is *necessary but not sufficient* — 120 of 720
  orderings end in tier 0 and only 12 are safe.
  Everything else in that analysis reproduced **exactly**: greedy's tier distribution
  to the decimal, the 19,440-pair histogram (16.7 / 16.7 / 19.2 / 24.4 / 20.2 / **3.0**),
  the count of 12, and the median of 13 per hero. **The ladder has not moved; the claim
  was always wrong by one.** `py tools/characterize-orderings.py`.

- **`07-defense-ai.md` — a fifth instance of the stale-155 cascade.** *"A battle runs
  roughly **13 turns per hero** (`01-stats.md`)"* is `155 / 12`, from before the `+20`
  accuracy edge. The current figure is `102 / 12` = **8.5**, so the argument built on
  it — *"a three-power script configures under a quarter of a hero's fight"* — is
  really about **35%**. **The conclusion still stands** (a ranking governs every turn
  from one setting, and the gate argument is untouched); the arithmetic no longer says
  what it says. The other four instances were corrected in `06-progression.md`.

- **`01-stats.md` — the accuracy table mixes two rounding conventions, and one cell is
  a transcription.** `py tools/verify-accuracy.py` reproduces the **mean, p10, p90,
  min, the 315 and 0 pairs missing >50%, the 57.4% → 87.0% hit rate, the 1.51×
  throughput ratio, the derived ~102 hero-turns, and the 42 auto-hits / 0 auto-misses**
  — all exactly. Two order statistics differ:
  - **`floor(Luck × 1.5)` is canon** — the prose says *"a hero with `Luck` 15 rolls
    1–22"*, and it is the convention the recorded means reproduce. The recorded
    symmetric **max of 82.5%** comes from a half-up die.
  - **The `+20 max` cell reads 45.2%, which is the symmetric *median* from the cell
    diagonally above it.** Under every rounding convention the true value is **46.2%**.
  Nothing in the document's reasoning depends on either.

- **Two Phase 0 questions were already answered in canon** and the plans that raised
  them did not know it. `09-matchmaking.md` sets the inactivity threshold (30 days idle,
  activity = an attack or a squad edit) that feature 009's plan asks to *"define"*; and
  `06-progression.md` sets the daily income brackets (1–5 at 1.5×, 6–20 at 1.0×, 21+ at
  0.5×) that feature 010's plan calls *"not decided"*. **Not defects — a reminder that
  the mechanics docs are ahead of the specs in places, and worth reading before
  deciding.**

**These are noted so nobody builds from them. Per the standing rule, nothing was
rewritten** — the corrections belong in the mechanics docs when someone edits them
deliberately.

### Discrepancies found specifying the design port (017) — **2026-07-30**

Reading the exports as *designs to build from* rather than as reference surfaced one
defect, and it is **systematic rather than a typo**.

- **The design library models effectiveness as four tiers; canon has five.** Every
  export that shows the ladder shows the same wrong one:

  | | Design exports | Canon (`CLAUDE.md`, `01-stats.md`) |
  |---|---|---|
  | Bane | ×1.5 | ×1.50 ✅ |
  | Fault | **×1.2** | **×1.25** |
  | Neutral | ×1.0 | ×1.00 ✅ |
  | Secondary | **— absent —** | **×0.80** |
  | Primary | ×0.5 | ×0.50 ✅ |

  `FAULT ×1.2` appears in **four** exports — `Codex`, `Design System`, `Hero Card`
  and `Turn Sequence`. `Turn Sequence` states the collapse outright: *"Bane ×1.5,
  Fault ×1.2, either of the target's own Forces ×0.5"* — **either**, where canon
  distinguishes the secondary (×0.80) from the primary (×0.50). A scan of all
  twenty exports finds **no occurrence of ×0.80 anywhere**; the only `0.8` in the
  library is an HP fraction in `Matchmaking and Results`.

  Consequence for the port: the **relationship strip and the hero card must render
  five tiers, not the four they are drawn with**, and every multiplier a player
  reads is required to come from the generated matrix at render time rather than be
  transcribed (017 FR-019). That makes this class of drift impossible to repeat —
  the screen cannot disagree with the engine, because it has no number of its own.

- **`THE COURT` is a rail destination with no screen.** It is named in the shell of
  almost every export, but no `Court.dc.html` exists, and *Court-Champion* turns out
  to be a **league name** — `Matchmaking and Results` shows it beside the rating,
  and *"three courts will hear you"* describes match offerings. **Not a defect in
  the exports**; noted because porting the rail verbatim would ship a navigation
  entry that leads nowhere.

**Nothing was rewritten here either.** The exports stay as generated and are left to
be regenerated; canon is unchanged and unchallenged.

## Lore & roster

- `LORE-and-flavor.md` — world (Aethrym), the Nine Forces, the **weakness-derivation rule**, House voices, drop-in flavor text, and the **Design Canon** single-source-of-truth block.
- `characters/` — one art brief per hero (27 files), an `INDEX.md`, and `MATCHUPS.md`: the full worked strength/weakness table plus the effectiveness spread it produces.

Verify the roster against the derivation rule at any time:

```powershell
pwsh tools/validate-matchups.ps1
```

## The one-paragraph pitch

Nine damage types (6 magic: Earth, Air, Fire, Water, Light, Dark · 3 melee: Slash, Pierce, Crush), three champions each for 27 heroes. Every hero is strong to its 2 kindred elements and carries two open doors — a major weakness (Bane) and a minor weakness (Fault), both *derived* from those two elements rather than authored — plus up to 5 powers on individual turn-based cooldowns. All 27 are unlocked from the start and identical for every player — nothing to collect, so nobody can out-roster anyone. Each player defends **two zones**, which locks 12 heroes away from offense and leaves 15 to attack with, across up to 3 saved squads. Squads are 6 heroes in a fixed 2 front / 3 middle / 1 back formation; you command your strikers while the engine runs everyone's defense. The game is counter-building: read the doors, don't stack your own.
