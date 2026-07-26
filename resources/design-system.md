# Claude Design Prompt — UI Design System

> **How to use:** Paste the `## PROMPT` block into Claude Design. This is the in-app UI kit — foundations (tokens) and components — that all the screen prompts (`01`–`05`) draw from. It pairs with `brand-identity.md` (the outward brand). Generate the brand identity first so the wordmark and accent color are settled, then build this.
>
> The **TECHNICAL CONTEXT** block is not background reading — it changes what components the system needs. Keep it in the prompt.

---

## PROMPT

Design a complete **UI design system** for **LMNTLZ**, a competitive fantasy battler game, presented as a single reference page (foundations + a component library sampler). The system must match the game's world: **stylized / semi-anime**, dark and arcane, vivid element color, crisp and readable at a glance — premium **desktop game UI**, not a generic SaaS kit and not a mobile app. **Dark theme is the default;** include a light variant for text-heavy panels.

### TECHNICAL CONTEXT — this shapes the system, don't skip it

LMNTLZ ships as a **desktop application** built in web technology, plus the same build served in a desktop browser. Concretely:

- **Electron desktop client**, distributed on **Steam** and as a standalone installer, plus a **desktop browser** build from the same static bundle.
- **Vite + React + Tailwind CSS.** A static single-page app — there is no server-side rendering.
- **Server-authoritative gameplay.** Every combat action is a network round trip to an API; the server computes the result and the client renders what it's told.
- **Scheduled maintenance windows.** The game is taken offline deliberately for deploys.
- **Two sign-in paths:** Steam (in the Steam build) and Google (everywhere), on one linkable account.

**Design implications — these are requirements, not suggestions:**

1. **Desktop only. No mobile, no tablet, no touch.** Do not produce phone layouts or touch-target guidance. Assume a **mouse and keyboard**: hover is a reliable, load-bearing state, and pointer precision means controls do not need finger-sized hit areas. Keyboard focus states are still mandatory.
2. **Viewport range.** Minimum supported window **1280×720**; design primarily for **1600×900**; degrade gracefully up to ultrawide. The window is freely resizable — layouts must not assume a fixed size, but they also never need to collapse to a single column.
3. **No SSR means the app boots empty.** First paint is an app shell. **Loading skeletons and empty states are first-class components**, not afterthoughts, and every data-backed surface needs one.
4. **Every action has latency.** Because the server resolves combat, each player action is in flight for a moment. The system needs an explicit **pending/in-flight** state on interactive controls, and a considered answer for **connection loss mid-battle** — a component, not an error toast.
5. **Maintenance is a designed experience.** Include a **full-screen maintenance state**, an in-app **"maintenance starting soon" banner** for the drain window, and a **"battle discarded — nothing was lost"** notice. These are guaranteed to be seen and are usually forgotten until launch week.
6. **Electron means no browser chrome.** The desktop build owns its **window frame**: design a custom title bar with window controls (minimise / maximise / close), and account for the browser build *having* chrome instead.
7. **Express tokens for Tailwind.** Deliver colors, spacing, radii, and motion as **CSS custom properties with names that map cleanly onto a Tailwind theme config** — not loose hex values in a swatch grid. Engineering will paste these into `tailwind.config`.

### FOUNDATIONS (tokens)

- **Color tokens.** Surfaces on a deep arcane base: `bg` `#141221`, `surface` `#1C1930`, `surface-raised` `#241F38`, plus a light parchment surface for text-heavy panels. Text on dark at high/medium/low emphasis. Semantic tokens: `strong`/CTA = gold `#F2C744`, `danger` = red `#C0313A`, `success`, `warning`, `info`. **The nine element accents as named tokens** (used for type badges, card frames, meters, glows): Earth `#4E7C3A` · Air `#8FCFE0` · Fire `#E8552B` · Water `#2A7FB8` · Light `#F2C744` · Dark `#7A3FA0` · Slash `#C0313A` · Pierce `#3B5BD1` · Crush `#B5732E`, each with a light-accent and deep-shadow step. Show them as documented tokens, not just a palette.
- **Typography.** A display face (headers, hero names) + a legible UI/body face + a distinct **numeric/stat** treatment for HP, cooldowns, and damage numbers. Provide a type scale: display, H1, H2, H3, body, caption, and a mono-ish stat numeral. Size it for desktop viewing distance.
- **Spacing & layout.** A base-4 or base-8 spacing scale, container widths, and a desktop layout grid with a persistent **side navigation** — not a responsive mobile grid.
- **Radius, elevation, motion.** A radius scale, an elevation system tuned for a dark UI (glow-based rather than heavy drop-shadow), and motion tokens (durations/easings) for hover, cooldown fills, reveals, and **in-flight/pending pulses**.

### COMPONENT LIBRARY

Show each with its full state set — **default, hover, active/pressed, focus-visible, disabled, loading, and pending** — on the dark theme.

- **Buttons:** primary (gold CTA), secondary, ghost/tertiary, destructive, icon button. Include sizes. The **pending** state matters most here: a committed combat action awaiting the server.
- **Type badge:** the signature component — element icon + label chip in that type's color. Show all nine.
- **Strength/weakness indicators:** small badges for the 2 strengths / 1 major weakness (Bane) / 1 minor weakness (Fault) strip, distinguishable by **shape as well as color**.
- **Hero card:** reference the established card (detail / grid tile / battle chip) as a system component — pull it in, don't redesign it.
- **Power slot + cooldown ring:** a power icon with a radial cooldown timer, in ready / recharging / disabled / **awaiting-server** states.
- **Reach indicator:** a compact treatment for a hero's reach value (1 or 2) and, in context, which rows it can currently touch. Reach drives all targeting, so it needs to be readable on a card and on the battlefield.
- **Stat pill, meter/coverage bar** (type-colored), **progress bar**, and a **9-type mini heat readout**.
- **Inputs & forms:** text field, search field, dropdown/select, toggle, slider, segmented control / tabs.
- **Navigation:** top app bar (wordmark + currency + account), **persistent side navigation**, a squad/loadout switcher, and the **custom window title bar** with its controls.
- **Containers & overlays:** cards, list rows, modal dialog, **side panel / drawer** (not a bottom sheet), tooltip/flyout (e.g. the type-effectiveness tooltip), toast/snackbar, and empty states.
- **Connection & system states:** in-flight indicator, **reconnecting** state, **disconnected / battle interrupted** dialog, full-screen **maintenance** page, and a **maintenance-imminent** banner.
- **Account:** sign-in screen offering **Steam** and **Google**, plus a small **linked-accounts** surface showing both identities on one account.
- **Feedback:** loading skeletons and a combat-style floating number / effectiveness flash reference.

### QUALITY BARS

- **Accessibility:** WCAG-AA text contrast on the dark base and **clearly visible keyboard focus rings on every interactive element** — the app must be fully keyboard-navigable. Do **not** specify touch target minimums; this is a pointer-driven application.
- **Consistency:** every element accent derives from the nine tokens. No off-palette colors. Glows and rims use the accent step, never arbitrary hues.
- **Applied vignette:** show a small worked example (e.g. a squad-builder row, or a battle chip mid-cooldown with an action pending) so the components read as a working system rather than loose parts.

Lay it out as a clean, self-contained design-system reference page — the single source of truth engineering and design build the app from.

---

## Reference

- Palette, art direction, and the nine types: `brand-identity.md` and `characters/`.
- Screens that consume this system: `01-hero-card.md` … `05-matchmaking-results.md`.
- Systemic rules behind the strength/weakness components: `characters/MATCHUPS.md`.
- Reach, rows, and the two formations — an attack **Wing** of 8 in 3/4/1 against a defense **Standing Six** of 6 in 2/3/1: `mechanics/02-squads.md`.
- Hero stats that appear on cards: `mechanics/01-stats.md`.
