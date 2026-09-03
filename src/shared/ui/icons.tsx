/**
 * The icon system.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * Before this phase the product drew its iconography with Unicode: `◐` for the
 * theme switch, `«`/`»` for the sidebar, `☰` for the drawer, `✕` for close, and
 * twenty different geometric characters — `⌾ ▣ ◬ ≡ ⬡ ▥ ◫ ▦ ❑ ◷ ◑ ⊞ ◔ ⌗ ⇄ ⚙ ⛨
 * ◈ ◎ ◇` — for the twenty navigation destinations. Those characters render in
 * whatever the operating system happens to supply, so the same build looked
 * different on Windows, macOS and a Linux kiosk; several of them have no
 * relationship to what they represent; and a few had no glyph at all in some
 * system fonts and fell back to a box.
 *
 * This module is the single source of the replacement. Everything below is
 * `lucide-react`, one library, and every icon in the product comes from here
 * rather than being imported ad hoc — so a screen cannot quietly acquire a
 * second visual language, and the size and stroke conventions are stated once.
 *
 * ── What this module deliberately does NOT own ──────────────────────────────
 *
 * **The brand mark.** The aperture in the top-left of the shell and on the
 * sign-in screen is hand-drawn SVG and stays that way. It is the product's
 * identity, it is derived from the viewfinder ticks on the camera tiles, and it
 * is not an interface icon.
 *
 * **Status indicators that animate or encode a proportion.** `LiveDot` pulses
 * because "a frame arrived recently" is a continuous fact; `Spinner` rotates;
 * `Meter` draws a bar. Those are not icons and swapping them for glyphs would
 * lose the thing they carry.
 *
 * **Prose.** An em dash in a figure that has no value, a `·` separator, an
 * arrow inside a code comment: content, not iconography, and untouched.
 */

import type { CSSProperties } from 'react';
import {
  Activity,
  Armchair,
  ArrowRight,
  Ban,
  Camera,
  Cctv,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleX,
  ClipboardList,
  Contrast,
  Cpu,
  Diamond,
  Dot,
  ExternalLink,
  EyeOff,
  Fingerprint,
  FlaskConical,
  FileText,
  Gauge,
  HardHat,
  Image,
  Inbox,
  Info,
  Menu,
  OctagonAlert,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Plug,
  PowerOff,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Slice,
  Star,
  TestTube,
  TriangleAlert,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon };

/* ────────────────────────────────────────────────────────────────────────────
   The conventions

   Four sizes and one stroke, and nothing outside this list. An icon set whose
   sizes are chosen per call site is a set that drifts, and drift is exactly
   what made the previous glyphs read as placeholders.
   ──────────────────────────────────────────────────────────────────────────── */

export type IconSize = 'inline' | 'control' | 'nav' | 'feature';

/**
 * Sizes, in pixels, each tied to the type size it sits beside.
 *
 *   inline   13px — beside `--text-2xs`/`--text-xs`: badges, list markers,
 *                   table cells, the marker on a navigation entry.
 *   control  15px — inside an `IconButton` or a `Button`'s `icon` slot, where
 *                   the label runs at `--text-xs`/`--text-sm`.
 *   nav      16px — the navigation rail, where an icon is scanned rather than
 *                   read and sits in a fixed 1rem column.
 *   feature  20px — the one icon that heads a region or a state frame.
 *
 * Chosen against the existing type scale rather than invented: an icon reads as
 * belonging to its label when its optical height matches the label's cap
 * height, and these four are the only label sizes the product uses.
 */
const SIZE: Record<IconSize, number> = {
  inline: 13,
  control: 15,
  nav: 16,
  feature: 20,
};

/**
 * One stroke weight for the whole product.
 *
 * Lucide's default is 2, which is correct at 24px and heavy at 13–16px, where
 * almost every icon here renders. 1.75 keeps the strokes from filling in at
 * `inline` size while staying legible on the dark theme's low-contrast
 * surfaces. It is stated once, and no call site overrides it.
 */
const STROKE = 1.75;

export interface IconProps {
  /** The icon to draw. Always one of the mappings below, never an ad-hoc import. */
  icon: LucideIcon;
  size?: IconSize;
  /**
   * An accessible name, for the rare icon that is the *only* carrier of its
   * meaning and is not already inside a labelled control.
   *
   * Leave it out for everything else. An icon beside its own label, or inside
   * an `IconButton` that already has `aria-label`, must be `aria-hidden` — two
   * accessible names on one control is a worse defect than none, because a
   * screen reader reads both.
   */
  label?: string;
  /** Inherits the surrounding text colour unless a state demands otherwise. */
  color?: string;
  style?: CSSProperties;
}

/**
 * Draw an icon.
 *
 * `flexShrink: 0` because an icon in a flex row must never be squeezed — a
 * half-width icon is worse than no icon. `display: block` because an inline SVG
 * otherwise sits on the text baseline and picks up the line box's descender
 * space, which is what makes icons look a pixel or two too high next to their
 * labels; the flex alignment of the container then does the optical work.
 */
export function Icon({ icon: Glyph, size = 'control', label, color, style }: IconProps) {
  return (
    <Glyph
      size={SIZE[size]}
      strokeWidth={STROKE}
      color={color}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ flexShrink: 0, display: 'block', ...style }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Navigation

   One icon per destination, chosen from what the route actually does rather
   than from the shape of the character it replaces. The hints in
   `app/router/navigation.ts` are the specification each of these was read
   against.
   ──────────────────────────────────────────────────────────────────────────── */

export const NavIcons = {
  /** Command Center — "what needs attention, and what the system is seeing". */
  dashboard: Gauge,
  /** Live Wall — "every camera on the recorder, live". */
  live: Cctv,
  /** Alerts — "open violations, most urgent first". */
  alerts: TriangleAlert,
  /** Incidents — "the ledger: open, acknowledged, resolved". */
  incidents: ClipboardList,
  /** Staff Hygiene — PPE observations. The icon is literally protective wear. */
  hygiene: HardHat,
  /** Cutting Boards — board colour against the ingredient being prepared. */
  cuttingBoards: Slice,
  /** Evidence — retained imagery that supports a finding. */
  evidence: Image,
  /** Reports — periods, coverage and export. */
  reports: FileText,
  /** Audit Trail — who did what, and who looked at whom. */
  audit: ScrollText,
  /** People Counting — entries, exits and peak hours. */
  peopleCounting: Users,
  /** Demography — aggregate breakdown, never per person. A share, not a person. */
  demography: PieChart,
  /** Table Occupancy — which tables are occupied, free or waiting. */
  tables: Armchair,
  /** Meal Detection — dishes recognised against what the till sold. */
  meals: UtensilsCrossed,
  /** Cameras — the estate: configuration, health and blind spots. */
  cameras: Camera,
  /** Integrations — the seam between this system and the till. */
  integrations: Plug,
  /** Administration — restaurants, zones, users and roles. */
  administration: Settings,
  /**
   * Patron ID — returning-visitor identification.
   *
   * A fingerprint rather than the shield the old glyph used. The shield said
   * "security feature"; this capability is identification, and the fact that it
   * is blocked pending legal review is carried by the readiness marker beside
   * it rather than by disguising what it does.
   */
  patronId: Fingerprint,
  /** Vision OS — the engineering view of the perception platform. */
  visionOs: Cpu,
  /** Model Evaluation — scores against human-annotated data. */
  modelEvaluation: FlaskConical,
  /** Runtime Diagnostics — sessions, runtime state, why a stream is not running. */
  runtime: Activity,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Controls
   ──────────────────────────────────────────────────────────────────────────── */

export const ControlIcons = {
  /** Close a modal, a drawer, the navigation drawer. */
  close: X,
  /** Open the navigation drawer at narrow widths. */
  menu: Menu,
  /** Collapse the sidebar to its rail. */
  collapseNav: PanelLeftClose,
  /** Expand the sidebar from its rail. */
  expandNav: PanelLeftOpen,
  /**
   * The theme switch.
   *
   * Fixed, and deliberately so — the same reasoning the previous `◐` was chosen
   * under. A control whose icon changes shape every time it is used is a
   * control the operator has to find again on each shift, and this one sits in
   * a topbar people scan rather than read. The state and the action stay in the
   * accessible name. `Contrast` is the same half-filled circle the old glyph
   * drew, from a system rather than from a font.
   */
  theme: Contrast,
  /** A disclosure that opens in place. */
  disclosure: ChevronRight,
  /** A road out of a region, to somewhere else in the product. */
  goTo: ArrowRight,
  /** A destination outside this application. */
  external: ExternalLink,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   The four observation states

   `shared/semantics/observation.ts` keeps its `glyph` field exactly as it was.
   That module owns *meaning* — which states exist, which count as a violation,
   which are decided — and a rendering concern has no business inside it. This
   is the presentation layer's mapping onto the same four keys, and the
   semantics module does not know it exists.
   ──────────────────────────────────────────────────────────────────────────── */

export const StateIcons = {
  /** Observed and confirmed. */
  present: Check,
  /** Observed, and not there. The only state that can become a violation. */
  absent: X,
  /**
   * The camera could not see this.
   *
   * `EyeOff` is the most exact icon in this entire set: the state means the
   * model looked and its view was obstructed, and it must never read as
   * "nothing was there". An eye with a line through it says that and a
   * geometric character never could.
   */
  not_visible: EyeOff,
  /** No recent observation. Nothing is being claimed. */
  unknown: CircleHelp,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Severity, and the attention tones

   Descending visual weight, so the rank is legible in grayscale and before the
   label is read: an octagon, then a triangle, then a circle, then a dot.
   ──────────────────────────────────────────────────────────────────────────── */

export const SeverityIcons = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: CircleDot,
  info: Info,
} as const;

export const AttentionIcons = {
  critical: TriangleAlert,
  attention: CircleAlert,
  clear: CircleCheck,
  unknown: CircleHelp,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   States of a region
   ──────────────────────────────────────────────────────────────────────────── */

export const StatusIcons = {
  /** Nothing here yet, and that is a real reading. */
  empty: Inbox,
  /** Something failed. */
  error: CircleX,
  /** The platform is not assembled, or a feature is switched off. */
  unavailable: PowerOff,
  /** Nothing can be claimed either way. */
  unknown: CircleHelp,
  /** Awaiting a data source: provisional, not broken. */
  awaiting: CircleDashed,
  /** Deliberately shut, and shut on purpose. */
  blocked: Ban,
  /** A period that covers what it claims to. */
  coverageComplete: ShieldCheck,
  /** A period with a gap in it. */
  coverageIncomplete: ShieldAlert,
  /** One gap in a period's coverage, in a list of them. */
  gap: Dot,
  /** A guarantee this product makes and keeps. */
  guarantee: Check,
  /** The subject an alert was actually raised about. */
  subject: Star,
  /** Data from a fixture rather than from the platform. Never live. */
  fixture: TestTube,
  /** The engineering register's mark. */
  engineering: Diamond,
} as const;
