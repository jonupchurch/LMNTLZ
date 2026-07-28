# Claude Design Prompt — 07 · Onboarding & Guild Joining

> **How to use:** Run after the style system and hero card prompts. Covers the three flows that decide whether a new player ever finds people: **guild invites**, **guild applications**, and **profile setup**.
>
> **This file exists because the beginner warning kept getting lost.** The screen was regenerated three times before it said what it had to. The *MUST SAY* block below is not decoration — it is the reason this prompt is written down.

---

## PROMPT

Design **three connected flows** for LMNTLZ, a fantasy battler using the LMNTLZ style system (stylized / semi-anime, dark arcane UI, vivid element color): **(1) receiving guild invites**, **(2) applying to guilds**, and **(3) profile setup**.

New players spend their first week in a **beginner league where every opponent is a bot**. Joining a guild ends that week immediately and permanently. These three flows are where that happens, so they carry more weight than their size suggests.

### MUST SAY — the beginner warning

A player still in the beginner league must be warned **before** they can join a guild, and the warning appears in **two places, not one**:

- **On receiving an invitation** — before accepting.
- **On submitting an application** — because a player who applies and is admitted a day later would otherwise be graduated by *someone else's click*, at a moment they were not present for. **The application is where the decision is actually made.**

It must name **both** things that end — a player told only one has not been told the other:

| | |
|---|---|
| **Beginner status** | bot-only opponents, and the protection that comes with it |
| **The beginner bonus** | **×1.5 on attack income** |

It must also **say what is kept** — every champion, rune and rating — and show **how much of the beginner week remains**.

> **And it must not frighten them out of it.** Graduating is *safe*: a player enters the lowest league at the gear floor and meets opponents at **no more than 1.67× their own gear**, with bots padding that league so the bound holds even when it is thin. Copy suggesting they will be crushed by far stronger players is **factually wrong** and works against the retention loop this whole flow exists to serve. **Close by asserting the guarantee, not a threat.**

Wording that satisfies all of the above:

> **YOU WILL LEAVE THE BEGINNER LEAGUE**
> Joining ends your beginner protection **immediately and permanently** — you keep every champion, rune and rating, but you will face real wardens instead of bots — and your **×1.5 shard bonus ends with it**. *Your league keeps you matched near your own strength.*

### Flow 1 — Invitations received

A player holds several invitations at once and picks between them.

- Each invitation as a **guild card**: avatar (chosen from a curated set, never uploaded), name, **filled / 24**, which of the three **Wings of 8** have room, language, activity, recent event standing, and the guild's standing recruiting pitch.
- **State plainly that accepting any one withdraws the rest.**
- **Accepting joins immediately.** The player is the one being asked, so their yes is the decision — no second confirmation step.
- Invitations **expire**; show the remaining time.
- Say what the **event lock** means for someone joining now: Wings lock during an event, only the guild master can move or remove you, and a vacated seat stays held until the event closes.

### Flow 2 — Applications sent

The other direction, and the one with more rules on it.

- **Free to send**, and **capped at 5 concurrent** — show the count as a budget (*3 of 5 applications open*), not as an error the player discovers.
- Applications **expire after 7 days**; show the remaining time on each.
- **State the contract at the point of applying:** *apply to as many as you like — the first guild to say yes is the one you join, and the rest are withdrawn automatically.* This is the single most important sentence in the flow and it is easy to omit, because the invite side carries a similar-sounding line and the application side then reads as if it is covered.
- A **dismissed** application is shown as dismissed rather than silently vanishing, with a **24-hour cooldown** before reapplying to that guild.

### Flow 3 — The guild's side: reviewing applications

What an officer sees. Guilds hold up to 24, and **only officers and above** may act.

- The queue, each applicant showing what a recruiter actually filters on: **league, roster power, languages, activity, and their message.**
- **Accept** and **Dismiss**, with dismissal being a plain decline — **no reason field.** A free-text rejection aimed at someone who was just turned down is a harassment vector with no upside.
- **Outstanding invitations are capped at 10** for the guild; show that budget too.
- **The last slot is a race.** A guild may hold ten invitations and a full queue against one open seat — the first acceptance to commit takes it, and every other acceptance fails with **the guild is full**. Design that message; it is a normal outcome, not an error state.

### Flow 4 — Profile setup

The first thing a new account does, and it should feel like being handed a place rather than filling in a form.

- **Username** — the identity everything else hangs off.
- **Languages**, ordered, with the first being the one a *Looking for a Guild* posting reads from.
- **Avatar.**
- **Visibility controls** — let the player choose what a public profile shows: roster power, battle record, squads, hours played, online status.
- **Sensible defaults already set**, so the screen can be skipped entirely.

> **Nothing here may expose the Hidden Six.** Every player keeps a second defense squad that is never shown and never selectable. It must not appear as a toggle, as a disabled option, or as anything at all — including a control that promises to keep it private. Say plainly that it is never visible.

Keep everything cohesive with the rest of the app. Show believable populated examples. **Desktop only** — mouse and keyboard, minimum window 1280×720, designed for 1600×900. No mobile or touch layouts.

---

## DESIGN CANON REFERENCE

- **Guilds hold up to 24 players in three Wings of 8**, plus an uncapped Grounded bench. A Wing is a grouping of **players, not heroes**, exists only for events, and never appears in a battle.
- **Whoever is asked, answers.** A player applies and the guild decides; a guild invites and the player decides. In both cases the deciding party's acceptance completes the join, with no second confirmation.
- **No member of a guild is ever in the beginner league**, and leaving the guild later does not restore it.
- **Roster power** is the gear score — the sum of a player's placed runes, and what sorts them into leagues. **Leagues bound the gear a player can face to 1.67×**; a rating orders opponents within a league but never restricts the pool.
- **A guild emblem is composed from parts we author**, never uploaded: **one of 36 icons, an icon colour from a vivid palette of 12, and a background colour from a separate dark palette of 12** — **5,184 combinations**, every one legible because the two palettes never overlap. Guilds get real expression and nothing needs moderating. **One deliberate exception:** an explicit *match background* option lets a guild blank the icon into a solid block of colour — silly but harmless, and theirs to choose. Illegibility should be unreachable by accident and one click away on purpose. **A contrast readout may warn but must never gate** — it cannot disable the save or mark the emblem invalid. Harm is a gate; taste is a note.
- Every player defends **two zones**: a **Visible** squad, scoutable and the only one anyone can choose to attack, and a **Hidden** squad, never shown and never selectable.
- Keep the 9-type color language consistent with the card, roster and battle screens.
