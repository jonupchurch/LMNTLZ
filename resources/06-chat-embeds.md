# Claude Design Prompt — 06 · Chat Postings

> **How to use:** Run after the style system, hero card and squad builder prompts — the squad postings reuse all three. Covers the four rich message types players pay shards to send.

---

## PROMPT

Design **four special chat message types** for LMNTLZ, a fantasy battler using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color) and the existing hero cards.

Chat is mostly plain text. These four are **promotional or helpful postings that cost in-game currency to send**, and they should **stand out significantly against ordinary chat** — the fee is what buys the prominence.

> **Bold, but bounded.** They are rare by construction — a fee plus a rate limit means one appears every few dozen messages — so they can be visually arresting: framed, lit, element-colored, unmistakably not text. What they must not be is *tall*. A reader scrolling a busy channel should pass one without losing their place. Treat height as the budget and spend everything else freely.

### 1 — Guild promotion

Posted by a guild recruiting members. The most-read of the four, and the one that should look best.

- **The guild's chosen avatar** — picked from a **curated set we author**, never uploaded. Design it doing real work in the composition rather than sitting in a corner, and show several different guilds so the set reads as a family.
- **Guild name**, and **open slots** — a guild holds up to **24 players in three Wings of 8**, so show `19 / 24` and which Wings have room.
- **The recruiting message**, authored once and **stored in the guild profile** rather than typed per post — so the same pitch appears each time and reads as a standing advertisement, not a chat line.
- Supporting signal: language, activity, recent event standing.

### 2 — Looking for a guild

The other direction, posted by an unguilded player. Deliberately **lighter than the guild card**, so a channel carrying both reads as two clearly different things.

- **Player name**
- **League** — the gear-based band they sit in
- **Roster power** — their gear score, the single number that says how built-out they are
- **Language**

### 3 — A defense you are facing

*"How do I beat this?"* — a player posts an opponent's **Visible defense** to ask for help against it. In a game built on reading an enemy's weaknesses, this is the most useful thing chat can carry.

- All 6 defenders as hero cards with type badges in the fixed **2 front / 3 middle / 1 back** formation.
- The **weakness/strength spread** — the exposed Banes and Faults are the entire question being asked.
- The squad's **hold streak** — *"has turned away 12 attackers"* — which is what makes it worth asking about.

> **Visible defenses only.** Every player also keeps a **Hidden** defense that is never shown and never selectable. It must not appear in this flow at all — not as a disabled option, not as a locked panel, not as a refusal. Design no affordance for it.

### 4 — A squad of your own

*"Is this any good?"* — a player posts one of **their own** squads for feedback. Same card treatment as above, framed as a question about their build rather than about an opponent's.

- Their attack squad, or their own Visible defense.
- Same formation, badges and weakness spread.
- The two should be **visually distinguishable at a glance** — asking about *someone else's* defense and asking about *your own* squad are different conversations, and a reader should know which one they are being pulled into before reading a word.

### The composer, and the cost

- Choosing what to attach, from things the player owns or has recently fought.
- **The cost stated before sending, never after.** It is a small price against a large balance, so the point is that posting is *deliberate* — not that it stings. Do not make it feel like a toll booth.
- A preview of exactly what will appear.

Keep everything cohesive with the rest of the app. Show believable populated examples, including **a busy channel with a realistic mix** — mostly plain text with these appearing occasionally — so the contrast can actually be judged. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts.

---

## DESIGN CANON REFERENCE

- Squads are **6 heroes in a fixed 2 front / 3 middle / 1 back formation**, drawn from a roster of 27 that is **identical for every player** — so a shared squad is a statement about *choices*, never about collection.
- Every player defends **two zones**: a **Visible** squad, scoutable and the only one anyone can choose to attack, and a **Hidden** squad that is never shown and never selectable. **The Hidden squad must not appear in any posting surface.**
- Both defense squads track a **public hold streak**, reset when the squad is edited.
- Guilds hold **up to 24 players in three Wings of 8**, plus an uncapped Grounded bench. A Wing is a grouping of players, not heroes, and never appears in a battle.
- **Roster power** is the gear score — the sum of a player's placed runes, and what sorts them into leagues.
- Chat has **six scopes**: Global · Guild · Direct · Admin · Guild Ads · Beginner. The guild promotion and looking-for-guild postings live in **Guild Ads**; squad postings are usable in any scope.
- Keep the 9-type color language and the strength/weakness cues consistent with the card, squad builder and battle screens.

---

## OPEN — decide before generating

- ~~Is the guild avatar chosen from a curated set, or uploaded?~~ **Settled 2026-07-28: curated.** A guild picks from a set we author, so nothing is uploaded and nothing is reviewed — the most-read surface in the game carries no moderation queue. It also guarantees every guild card looks right, which an upload cannot, and makes avatars a **guild-funds sink** (`mechanics/11-social.md`). Design the set as a set: a coherent family a guild chooses an identity from, not a slot awaiting an image.
- **Posting someone else's defense is a mild targeting surface.** A Visible defense is already public and attackable by anyone, so nothing is leaked — but broadcasting one with *"help me beat this"* energy is louder than it being merely findable. Probably benign, since **a defender profits from being attacked when they hold**, and the hold streak is public bragging. Worth watching rather than designing around.
- **Battle replays are postable per the mechanics** (`11-social.md`), Visible battles only, but are **out of scope for this prompt.** Add them in a later pass rather than crowding four message types into five.
