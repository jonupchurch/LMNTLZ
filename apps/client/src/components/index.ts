/**
 * `apps/client/src/components` — **the single public entry point** (017 T031).
 *
 * Features 014, 015, 016 and every screen in 018 import from here and not from
 * a file path inside this directory. That is what makes the layer a contract
 * rather than a folder: the internal arrangement can change without touching a
 * consumer, and a component re-implemented privately under `features/` is
 * visibly not coming from this list.
 *
 * **Re-implementing any of these inside a feature is the debt this layer exists
 * to retire.** If something here does not fit, widen it here.
 *
 * @see specs/017-design-port/contracts/components.md
 */

// --- shell -----------------------------------------------------------------
export { AppShell, Panel } from './shell/AppShell.js';
export type { AppShellProps, PanelProps } from './shell/AppShell.js';
export { Rail } from './shell/Rail.js';
export type { RailProps, RailEntry } from './shell/Rail.js';
export { RailGroup } from './shell/RailGroup.js';
export type { RailGroupProps } from './shell/RailGroup.js';
export { Header } from './shell/Header.js';
export type { HeaderProps } from './shell/Header.js';

// --- controls --------------------------------------------------------------
export { Button } from './controls/Button.js';
export type { ButtonProps, ButtonVariant, ButtonState, ButtonSize } from './controls/Button.js';
export { TextField, Toggle } from './controls/TextField.js';
export type { TextFieldProps, ToggleProps } from './controls/TextField.js';

// --- type & relationships --------------------------------------------------
export { TypeBadge } from './type/TypeBadge.js';
export type { TypeBadgeProps, TypeBadgeSize } from './type/TypeBadge.js';
export { RelationshipStrip, rungsFor, formatMultiplier } from './type/RelationshipStrip.js';
export type { RelationshipStripProps } from './type/RelationshipStrip.js';
/**
 * The `Effectiveness` union and its five named tiers. Re-exported so a
 * consumer never reaches for a bare `number` for a multiplier — the design's
 * `×1.2` is a compile error against this type (FR-019).
 */
export type { Effectiveness } from './type/effectiveness.js';
export {
  BANE,
  FAULT,
  NEUTRAL,
  RESISTED_SECONDARY,
  RESISTED_PRIMARY,
} from './type/effectiveness.js';
export { FORCE_ABBR, FORCE_DEEP, FORCE_FILL, FORCE_RING, FORCE_TEXT } from './type/forceClasses.js';

// --- hero ------------------------------------------------------------------
export { HeroCard, maxHpOf } from './hero/HeroCard.js';
export type { HeroCardProps, HeroCardScale } from './hero/HeroCard.js';
export { PowerSlot, stateOf } from './hero/PowerSlot.js';
export type { PowerSlotProps, PowerSlotState } from './hero/PowerSlot.js';
export { CooldownRing } from './hero/CooldownRing.js';
export type { CooldownRingProps } from './hero/CooldownRing.js';

// --- readouts --------------------------------------------------------------
export { Meter } from './readouts/Meter.js';
export type { MeterProps, MeterTone } from './readouts/Meter.js';
export { Pill } from './readouts/Pill.js';
export type { PillProps, PillTone, PillTrend } from './readouts/Pill.js';
export { EffectivenessGrid, exposure, isConcentrated } from './readouts/EffectivenessGrid.js';
export type { EffectivenessGridProps, ForceExposure } from './readouts/EffectivenessGrid.js';

// --- system ----------------------------------------------------------------
export { ConnectionState, MaintenanceNotice } from './system/ConnectionState.js';
export type {
  ConnectionStateProps,
  ConnectionStatus,
  MaintenanceNoticeProps,
} from './system/ConnectionState.js';

// --- the site around the game ----------------------------------------------
export { SiteFooter } from './SiteFooter.js';
