/**
 * The product primitive layer.
 *
 * `UI_UX_ARCHITECTURE.md` §4 specified three component layers —
 * `ui/primitives` for generic behaviour, `ui/devtools` for instrument density,
 * `ui/product` for the domain's own vocabulary — and only the first was ever
 * built. This is the third. It is **not a second design system**: every value
 * here comes from the same tokens, every state colour is the same state colour,
 * and nothing in this file re-implements a behaviour `primitives.tsx` already
 * owns. It composes them into shapes the domain actually has.
 *
 * ### Why a generic Card was not enough
 *
 * A `Card` is a rectangle with a border. Asked to represent a live camera, an
 * incident, an AI finding, a report's coverage and an engineering metric, it
 * says the same thing about all five: *this is a section of a page*. That is
 * how a compliance product ends up looking like an admin panel — not because
 * the colours are wrong, but because the vocabulary has one word in it.
 *
 * So the domain's load-bearing concepts get their own primitives:
 *
 *   Attention      the one thing that matters right now, at display scale
 *   Figure         a number that refuses to exist when it is not known
 *   CameraSurface  a picture from a recorder, with chrome — not a panel
 *   Readiness      "not connected" and "blocked", told apart by form
 *   Meter          a proportion, and only when there is a real denominator
 *   CoverageSeal   what a period does and does not cover, before the figures
 *   FindingReadout the eight operator questions, in order, once
 *
 * ### The rule every one of them inherits
 *
 * A value that is not known renders as an em dash and a reason. Never `0`,
 * never an empty bar, never a smooth line through a gap. That rule is enforced
 * in `StatCard` already; these primitives extend it to proportions, pictures
 * and periods, which is where a redesign would otherwise quietly lose it.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, type HealthTone, type Severity } from './primitives';
import {
  AttentionIcons,
  ControlIcons,
  Icon,
  SeverityIcons,
  StatusIcons,
  type LucideIcon,
} from './icons';

/* ────────────────────────────────────────────────────────────────────────────
   Typographic furniture
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The small uppercase label that names a region.
 *
 * Mono, widely tracked, and never larger than 11px. It is the quietest thing on
 * a screen and it does most of the orientation work — an operator reads it once
 * and then stops seeing it, which is exactly what a label should do.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  anchor = false,
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent';
  /**
   * Whether this label is the one its section hangs off the spine by.
   *
   * The tick is drawn from the label rather than from the section wrapper, so
   * the label is what has to carry it. Opt-in because most eyebrows on a page
   * are not section boundaries — "In rank order" above the incident queue names
   * a list inside a region and must not grow a tick out into the margin.
   */
  anchor?: boolean;
}) {
  return (
    <div
      className={anchor ? 'uwv-spine-tick' : undefined}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: 'var(--tracking-wider)',
        textTransform: 'uppercase',
        color: tone === 'accent' ? 'var(--accent)' : 'var(--ink-tertiary)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * A page opening, composed rather than stacked.
 *
 * `PageHeader` in `primitives.tsx` is the pattern this replaces on the screens
 * that have been rebuilt: title, subtitle, horizontal rule, four cards. It is
 * kept and unchanged for the pages Stage 4 has not reached, so nothing breaks —
 * but a rule under a heading is a page saying "the interesting part starts
 * below", and on the screens that matter the interesting part starts here.
 *
 * The difference is hierarchy: an eyebrow that names the area, a display-scale
 * title with optical tracking, a standfirst held to the measure, and the meta
 * on the same optical line as the title rather than beneath it.
 */
export function PageIntro({
  eyebrow,
  title,
  standfirst,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  standfirst?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      className="uwv-spine-mark uwv-arrive"
      data-lead="true"
      data-order="1"
      style={{ marginBottom: 'var(--space-10)' }}
    >
      {/* 'start', not 'end'.
          
          A grid row's 'end' bottom-aligns both columns to whichever is
          tallest. That is invisible when the standfirst is two or three lines
          — which is what every page this was designed against had — and it is
          a defect the moment one runs longer: Cameras' standfirst is five
          lines plus a button, so the title column was pushed down to match its
          bottom, opening a gap above the eyebrow that had nothing to do with
          spacing and everything to do with which column happened to be
          taller. 'start' means the title is always where a title belongs —
          flush with the top of the opening — regardless of how long the prose
          beside it runs. */}
      <div className="uwv-lead" style={{ alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow anchor>{eyebrow}</Eyebrow>
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 1.1rem + 2.4vw, var(--text-4xl))',
              letterSpacing: 'var(--tracking-display)',
              fontWeight: 'var(--weight-semibold)',
              marginTop: 'var(--space-3)',
            }}
          >
            {title}
          </h1>
          {meta ? (
            <div
              style={{
                marginTop: 'var(--space-5)',
                display: 'flex',
                gap: 'var(--space-2) var(--space-5)',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {meta}
            </div>
          ) : null}
        </div>

        {/* The standfirst sits beside the title, not beneath it.

            Stage 5 found the same shape on all nineteen pages: a display
            heading, four lines of prose at full measure, then the content —
            with the entire right half of the opening empty. Moving the
            standfirst into that empty half does three things at once. The
            opening becomes an asymmetric composition rather than a stack, the
            page's first real content arrives four lines higher, and the prose
            gets the narrower measure it wanted anyway.

            Below the `uwv-lead` breakpoint it returns underneath, which is the
            correct reading order: the sentence explains the title. */}
        {standfirst || actions ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 'var(--space-4)',
              minWidth: 0,
            }}
          >
            {standfirst ? (
              <p
                style={{
                  maxWidth: 'var(--measure-tight)',
                  color: 'var(--ink-secondary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-relaxed)',
                  paddingBottom: 'var(--space-1)',
                }}
              >
                {standfirst}
              </p>
            ) : null}
            {actions ? (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * One region of a page, and one beat of its entrance.
 *
 * `order` places the region in the arrival sequence, which runs 45ms apart and
 * stops at six. It is passed rather than counted because a page's visual order
 * is a design decision: the region that should arrive first is not always the
 * one that happens to render first, and a hook that inferred it would be wrong
 * exactly when it mattered.
 */
export function Region({
  order,
  children,
  style,
}: {
  order: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className="uwv-arrive" data-order={order} style={style}>
      {children}
    </section>
  );
}

/**
 * A plane: a region that is a *ground content sits on*, not an object.
 *
 * `Card` was doing both jobs and could only say one thing. A wall of cameras, a
 * ledger of incidents and the body of a report are not items in a list of equal
 * items — they are surfaces. Enclosing them in a card said "here is one section
 * among several", which is exactly the reading that flattened every page.
 *
 * So a plane lifts off `--surface-base` by a measured step and carries a subtle
 * line, and nothing else. It never takes a shadow: a shadow claims the region
 * is above the page, and a ground is not above anything.
 */
export function Plane({
  children,
  padded = true,
  className,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  /**
   * A composition class to apply *with* the plane.
   *
   * A ground and a layout are separate decisions, and a plane that could only
   * be a block would force every caller to nest a second div inside it to say
   * how its contents are arranged. Composed rather than nested.
   */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className ? `uwv-plane ${className}` : 'uwv-plane'}
      style={{ padding: padded ? 'var(--space-5)' : 0, ...style }}
    >
      {children}
    </div>
  );
}

export function SectionRule({
  label,
  detail,
  actions,
  lead = false,
  order,
}: {
  label: string;
  detail?: ReactNode;
  actions?: ReactNode;
  /**
   * Whether this section is the one the page is actually about.
   *
   * A page has one lead and the rest is context. Declaring it costs a boolean
   * and buys the thing the Stage 5 critique found missing everywhere: a visible
   * answer to "what matters most right now". The lead's tick is drawn in the
   * accent at twice the weight and its label takes the accent too, so the axis
   * itself says where the page's centre of gravity is before a word is read.
   */
  lead?: boolean;
  /** Places this section in the page's arrival sequence. */
  order?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  return (
    <div
      className={order ? 'uwv-spine-mark uwv-arrive' : 'uwv-spine-mark'}
      data-lead={lead ? 'true' : undefined}
      data-order={order}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-4)',
        borderTop: `1px solid ${lead ? 'var(--line-default)' : 'var(--line-subtle)'}`,
        // No `paddingTop` here. It belongs to the label column below, and the
        // difference is not cosmetic.
        //
        // Baseline alignment settles a flex row on whichever item reaches
        // furthest above the shared baseline. With the gap on the row, the
        // label started level with the actions and the taller action pushed it
        // down — 16px below the rule in a section with no actions, 21px in one
        // with them, on the same page, decided by a permission. Giving the gap
        // to the label puts its baseline below the actions' unconditionally, so
        // the label is always the anchor, never the item that moves, and the
        // actions settle onto its line instead. Same typography, one position.
        marginBottom: 'var(--space-5)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, paddingTop: 'var(--space-4)' }}>
        <Eyebrow anchor tone={lead ? 'accent' : 'muted'}>{label}</Eyebrow>
        {detail ? (
          <p
            style={{
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-tertiary)',
              maxWidth: 'var(--measure)',
            }}
          >
            {detail}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Attention
   ──────────────────────────────────────────────────────────────────────────── */

export type AttentionTone = 'critical' | 'attention' | 'clear' | 'unknown';

const ATTENTION: Record<AttentionTone, { color: string; wash: string; icon: LucideIcon; word: string }> = {
  critical: { color: 'var(--severity-critical)', wash: 'var(--state-absent-wash)', icon: AttentionIcons.critical, word: 'Critical' },
  attention: { color: 'var(--severity-medium)', wash: 'var(--health-degraded-wash)', icon: AttentionIcons.attention, word: 'Attention' },
  clear: { color: 'var(--state-present)', wash: 'var(--state-present-wash)', icon: AttentionIcons.clear, word: 'Clear' },
  // Not a fourth severity — the state where the product cannot say. It borrows
  // the UNKNOWN token deliberately, so "we do not know" looks the same on the
  // command center as it does on an attribute badge.
  unknown: { color: 'var(--state-unknown)', wash: 'var(--state-unknown-wash)', icon: AttentionIcons.unknown, word: 'Not known' },
};

/**
 * The primary attention region. One per screen, at the top, and unmissable.
 *
 * This is the component that stops the Command Center being a grid of equal
 * cards: it is wider, louder and taller than everything below it, and it
 * carries a single sentence a person can act on. The tone drives a bar rather
 * than a fill, because a full-bleed red panel on a safety product is alarm
 * fatigue by the second shift.
 *
 * `unknown` is a real tone and not a fallback. A command center that cannot
 * reach the incident store must say so at the same size it would have said
 * "three open violations" — anything quieter teaches the operator that silence
 * means safety.
 */
export function Attention({
  tone,
  headline,
  statement,
  detail,
  actions,
  aside,
}: {
  tone: AttentionTone;
  headline: string;
  statement: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  /**
   * What is behind the headline.
   *
   * The statement is deliberately held to 30ch — a sentence somebody reads
   * across a room does not run the width of a monitor. That left the right two
   * fifths of the panel empty, which Stage 5's critique read, correctly, as a
   * region that had not decided what it was for. This slot is what belongs
   * there: the queue the headline is a summary *of*, in rank order, each row a
   * road into the thing itself.
   *
   * It is optional and it is never filled with anything invented. A caller with
   * no list to show passes nothing and the panel composes as a single column.
   */
  aside?: ReactNode;
}) {
  const spec = ATTENTION[tone];

  return (
    <section
      // `region` with a name, so a screen reader user can jump straight to the
      // thing that needs attention rather than tabbing the whole page.
      aria-label="Primary attention"
      // The split is a class rather than an inline `gridTemplateColumns`,
      // because it has to stop being a split. Set inline it applied at every
      // width, and on a 430px phone the queue was squeezed into 90px and
      // truncated every incident summary it was there to show — the aside is
      // context, and context that cannot be read is worse than context that
      // follows the thing it explains.
      className={aside ? 'uwv-attention' : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        // No `gridTemplateColumns` here.
        //
        // Stage 5 moved the two-column split into `.uwv-attention` so it could
        // stop being a split below the breakpoint, but left this inline
        // single-column declaration behind — and an inline style beats a
        // stylesheet unconditionally, so the class never won and the aside sat
        // under the statement at every width. A grid with no template is one
        // column already, which is exactly what the narrow case wants.
        alignItems: 'start',
        gap: 'var(--space-6)',
        // `--region-inset` on the reading edge, not a value of its own. This
        // panel used to inset its content 32px while the estate's ground used 24
        // and a camera tile used 12, so the page had four text columns against
        // one label column. One token, one step, everywhere.
        padding: 'var(--space-8) var(--space-6) var(--space-8) var(--region-inset)',
        borderRadius: 'var(--radius-lg)',
        background: `linear-gradient(100deg, ${spec.wash} 0%, var(--surface-raised) 58%)`,
        border: '1px solid var(--line-subtle)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {/* The bar. Colour is never the only signal, so the glyph and the word
          below carry the same fact. */}
      <span
        aria-hidden="true"
        style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 3, background: spec.color }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ color: spec.color, display: 'flex', flexShrink: 0 }}>
          <Icon icon={spec.icon} size="control" />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            letterSpacing: 'var(--tracking-wider)',
            textTransform: 'uppercase',
            color: spec.color,
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {spec.word} · {headline}
        </span>
      </div>

      {/* The one place on a page where type is allowed to reach display
          scale below the title. It is the answer to "what matters most right
          now", and it should be readable from further away than anything else
          on the screen. */}
      <div
        style={{
          fontSize: 'clamp(1.5rem, 1rem + 1.9vw, var(--text-3xl))',
          lineHeight: 1.16,
          letterSpacing: 'var(--tracking-display)',
          fontWeight: 'var(--weight-semibold)',
          maxWidth: '26ch',
          textWrap: 'balance',
        }}
      >
        {statement}
      </div>

      {detail ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
          {detail}
        </div>
      ) : null}

      {actions ? <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{actions}</div> : null}
      </div>

      {aside ? <div style={{ minWidth: 0 }}>{aside}</div> : null}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Figure
   ──────────────────────────────────────────────────────────────────────────── */

export type FigureScale = 'hero' | 'lead' | 'quiet';

const FIGURE_SIZE: Record<FigureScale, string> = {
  hero: 'clamp(2.25rem, 1.4rem + 3vw, var(--text-5xl))',
  lead: 'var(--text-2xl)',
  quiet: 'var(--text-lg)',
};

/**
 * A number, composable.
 *
 * `StatCard` is a figure *inside a Card*, which is why four of them become a
 * grid of four equal boxes. This is the same discipline without the box, so a
 * composition can make one figure dominant and the rest supporting — which is
 * the actual difference between a command center and a statistics page.
 *
 * The null contract is `StatCard`'s, unchanged and non-negotiable: a value that
 * is not known is an em dash and a reason, never a zero.
 */
export function Figure({
  label,
  value,
  unavailableReason,
  detail,
  scale = 'lead',
  tone,
  href,
}: {
  label: string;
  value: number | string | null;
  unavailableReason?: string;
  detail?: ReactNode;
  scale?: FigureScale;
  tone?: 'default' | 'accent' | 'critical';
  /** Rendered by the caller as a link wrapper. Present only so the affordance is consistent. */
  href?: ReactNode;
}) {
  const unavailable = value === null || value === undefined;
  const color = unavailable
    ? 'var(--ink-tertiary)'
    : tone === 'accent'
      ? 'var(--accent)'
      : tone === 'critical'
        ? 'var(--severity-critical)'
        : 'var(--ink-primary)';

  return (
    // `data-figure` is the scope handle. A figure is not a `Card` any more, so
    // there is no element with a role for a test — or an operator's screen
    // reader — to treat as the boundary of "this number and its reason". This
    // names it explicitly rather than leaving assertions to guess at a wrapper.
    <div data-figure={label} style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wider)',
          color: 'var(--ink-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          // An em dash set at display size stops being a glyph and becomes a
          // rule — at 4rem it reads as a horizontal line drawn across the
          // column, which is not what "we do not know this" should look like.
          // So the dash keeps the figure's optical position and drops to the
          // size of a word. The rhythm of the row is unchanged; only the mark
          // stops shouting.
          fontSize: unavailable ? 'var(--text-2xl)' : FIGURE_SIZE[scale],
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1.02,
          marginTop: 'var(--space-2)',
          minHeight: unavailable ? '1.2em' : undefined,
          display: 'flex',
          alignItems: 'flex-end',
          color,
        }}
      >
        {unavailable ? '—' : value}
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
          maxWidth: '30ch',
        }}
      >
        {unavailable ? (unavailableReason ?? 'Not available yet') : detail}
      </div>
      {href ? <div style={{ marginTop: 'var(--space-2)' }}>{href}</div> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Live indicator
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The live dot. Pulses **only** when a frame has actually arrived.
 *
 * The one looping animation in the product, and it earns the exception: "live"
 * is a continuous claim, and a static dot asserting it is the frozen-last-frame
 * failure in miniature. Every other state is still, because every other state
 * is a fact rather than an ongoing event.
 */
export function LiveDot({
  tone,
  label,
  steady = false,
}: {
  tone: HealthTone;
  label: string;
  /**
   * Whether to hold the dot still.
   *
   * The pulse means "a frame arrived recently", and beside a picture that is
   * exactly the right thing for it to say. In a roster of sixteen state words
   * there is no picture for it to qualify, and it inverts the reading: twelve
   * healthy rows animate while the four that need a person sit still, so the
   * motion pulls the eye to precisely the rows nobody has to look at.
   *
   * Off by default, so the wall — where the dot sits over live video and the
   * claim is about that video — is unchanged.
   */
  steady?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: `var(--health-${tone})`,
          boxShadow: tone === 'idle' ? 'inset 0 0 0 1px var(--health-idle)' : 'none',
          animation: tone === 'online' && !steady ? 'uwv-pulse 2.4s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
          color: 'var(--ink-secondary)',
        }}
      >
        {label}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Camera surface
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A camera tile. **A picture from a recorder, not a panel in an application.**
 *
 * The distinction is the whole point of this primitive. A `Card` puts footage
 * on the page's surface with the page's padding and the page's border radius,
 * which makes a dark scene look like a rendering fault and a bright one look
 * like an illustration. A monitoring client letterboxes against black, hangs
 * its chrome *over* the picture, and gives the picture the full width of its
 * tile.
 *
 * `media` is whatever should occupy the picture area — an `<img>`, or a
 * sentence saying why there is no picture. It is never a frozen last frame:
 * that decision lives in the caller and this primitive simply renders what it
 * is handed, but the reason it is handed a sentence rather than a stale image
 * is the single most dangerous default in CCTV UI.
 */
export function CameraSurface({
  name,
  identifier,
  context,
  tone,
  stateLabel,
  media,
  meta,
  selected = false,
  onSelect,
  actions,
  label,
  signal = 'none',
}: {
  name: string;
  identifier: string;
  /** Zone, channel, purpose — whatever locates this camera in the world. */
  context?: ReactNode;
  tone: HealthTone;
  stateLabel: string;
  media: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
  /**
   * Whether a picture is actually arriving in this tile.
   *
   *   'live'    frames are arriving now. The viewfinder ticks light.
   *   'dark'    a session exists and the picture is legitimately black — an
   *             unlit store cupboard is a picture, and must look like one.
   *   'none'    there is no feed at all. The picture area is ruled with a fine
   *             diagonal hatch.
   *
   * The last two are the distinction the wall's own copy makes about channel 7
   * being black, and before this they rendered identically: two black
   * rectangles with a grey word in the middle. Black now means signal, and
   * hatched means none.
   */
  signal?: 'live' | 'dark' | 'none';
  /**
   * The accessible name when the tile is a control.
   *
   * Required in spirit whenever `onSelect` is given: the visible chrome is a
   * name, a state and a picture, and a screen-reader user needs all three in
   * one utterance rather than having to assemble them from the tile's parts.
   */
  label?: string;
}) {
  const interactive = Boolean(onSelect);

  const body = (
    <>
      <div
        className={signal === 'none' ? 'uwv-viewfinder uwv-nosignal' : 'uwv-viewfinder'}
        data-lit={signal === 'live' ? 'true' : 'false'}
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: 'var(--video-ground)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        {media}

        {/* Chrome, over the picture. A gradient scrim rather than a solid bar:
            the metadata has to stay legible over both a bright kitchen and a
            dark store cupboard, and a solid bar would crop the frame. */}
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            top: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'linear-gradient(180deg, rgb(0 0 0 / 0.72) 0%, rgb(0 0 0 / 0) 100%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: '#f2f6f8',
                letterSpacing: 'var(--tracking-tight)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            {/* The technical identifier is always available even when a
                friendlier context line replaces it on screen: an operator
                reporting a fault needs the string the server knows the camera
                by, not the name somebody typed into Administration. */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--video-ink)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {context ?? identifier}
            </div>
            {context ? <span className="sr-only">{identifier}</span> : null}
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexShrink: 0,
              padding: '0.1rem 0.4rem',
              borderRadius: 'var(--radius-xs)',
              background: 'rgb(0 0 0 / 0.55)',
            }}
          >
            <LiveDot tone={tone} label={stateLabel} />
          </span>
        </div>
      </div>

      {(meta || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--line-subtle)',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-tertiary)',
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, overflow: 'hidden' }}>{meta}</div>
          {actions}
        </div>
      )}
    </>
  );

  const frame: CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'var(--surface-raised)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--line-subtle)'}`,
    // A second inner ring for selection: an operator picking a camera on a
    // wall of sixteen needs the choice legible from across a room, and a 1px
    // border change is not.
    boxShadow: selected ? '0 0 0 1px var(--accent) inset' : 'none',
    // Tighter than a card's radius. A monitor bezel is nearly square, and the
    // 12px corner the tile used to carry was the single strongest cue that this
    // was a panel in a web application rather than a picture from a recorder.
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    padding: 0,
    cursor: interactive ? 'pointer' : 'default',
    color: 'inherit',
    font: 'inherit',
  };

  if (!interactive) {
    return <article style={frame}>{body}</article>;
  }

  return (
    <button
      type="button"
      className="uwv-interactive"
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      style={frame}
    >
      {body}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Camera roster
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * One camera, as a line of type rather than a picture of nothing.
 *
 * `CameraSurface` is the right primitive for a surface that shows footage. On a
 * surface that reports *about* cameras it is the wrong one, and the Command
 * Center proved it: the status endpoint carries no imagery — a frame needs a
 * per-camera ticket and a long-lived MJPEG response, which only the wall asks
 * for — so every tile rendered a 16:9 rectangle of nothing with a sentence in
 * the middle explaining that the picture was somewhere else. Six of those cost
 * 754px of a 2430px page to say twelve words about six of sixteen cameras.
 *
 * This is the same information as a directory entry: which camera, what state,
 * and what that state means. Sixteen of them cost less than three tiles did.
 *
 * **The meaning is not decoration.** `degraded` and `offline` are both "not
 * producing frames" and they need different people: one is a stream that is
 * reconnecting or has gone silent, the other is a session nobody started. A
 * roster that printed only the state word would make an operator learn the
 * backend's vocabulary to use their own product.
 */
export function CameraLine({
  name,
  tone,
  state,
  meaning,
  kind,
  identifier,
}: {
  /**
   * The camera's identifier, or a link carrying it.
   *
   * A `ReactNode` rather than a string so the caller owns the routing — this
   * layer holds no opinion about the router — and so the link's accessible name
   * is the camera key alone. Making the whole row a link instead would give a
   * screen reader one link named "cam-04 degraded reconnecting or silent",
   * which is three facts wearing one label.
   */
  name: ReactNode;
  tone: HealthTone;
  /** The backend's own word for the state. Never a synonym, never a rounding. */
  state: string;
  meaning: string;
  kind?: string;
  /** The camera key, for tests and for a fault report that needs the raw string. */
  identifier?: string;
}) {
  return (
    /* `display: contents` puts these three cells straight into the roster's
       tracks, which is what makes the columns line up between rows. It also
       removes the element's box, and with it — in several browsers — the list
       semantics the markup is asserting, so the roles are stated explicitly
       rather than left to the display type. */
    <li className="uwv-camera-line" role="listitem" data-camera-id={identifier}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-primary)',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <LiveDot tone={tone} label={state} steady />
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
          minWidth: 0,
        }}
      >
        {meaning}
        {/* Marked by exception, and the exception is the one that matters: a
            replay source is a fixture and must never be mistaken for a camera.
            The caller passes nothing for the ordinary case and the region states
            that convention in its own copy, so the blank is a stated default
            rather than a reader's assumption — and the one session that is not
            live stands out far more among fifteen blanks than it would among
            fifteen repetitions of the word "live". */}
        {kind ? (
          <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 'var(--space-2)' }}>· {kind}</span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * A count per state, over a denominator that is every member of the set.
 *
 * Not a `Meter`. A stacked bar needs one hue per segment, and the palette
 * carries exactly four for health — a fifth would either collide with one of
 * them or dilute all four, which is the argument `Readiness` already makes
 * about not inventing a colour for a state that has none.
 *
 * So the **word** distinguishes the states and the hue groups them, which is the
 * right way round: `connecting` and `degraded` share a colour because they are
 * both "not there yet", and they are told apart by being named.
 *
 * A state with no members renders `0` rather than disappearing. Every camera in
 * the set is in exactly one of these states, so the zero is a real reading of a
 * real denominator — not the absent-data zero the product forbids — and a state
 * that vanished when it emptied would leave an operator unable to tell "none
 * faulted" from "faults not reported".
 */
export function StateTally({
  states,
}: {
  states: ReadonlyArray<{ key: string; label: string; tone: HealthTone; count: number }>;
}) {
  return (
    <ul
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2) var(--space-5)',
        alignItems: 'baseline',
      }}
    >

      {states.map((state) => (
        <li
          key={state.key}
          data-state={state.key}
          style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2)' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: `var(--health-${state.tone})`,
              flexShrink: 0,
              alignSelf: 'center',
              // An empty state keeps its dot but loses its weight. The reading
              // stays available; it stops competing with the states that have
              // something in them.
              opacity: state.count > 0 ? 1 : 0.35,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-md)',
              fontVariantNumeric: 'tabular-nums',
              color: state.count > 0 ? 'var(--ink-primary)' : 'var(--ink-tertiary)',
            }}
          >
            {state.count}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: state.count > 0 ? 'var(--ink-secondary)' : 'var(--ink-tertiary)',
            }}
          >
            {state.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Readiness
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * "Not connected" and "blocked", told apart by **form rather than colour**.
 *
 * Deliberately no new colour token. The palette already carries five meanings
 * for hue — four observation states, plus severity — and a sixth would either
 * collide with one of them or dilute all of them. Worse, the two obvious
 * choices are both wrong: red says the module is broken, and it is not; grey is
 * the UNKNOWN token, which means "no recent observation" and is a claim about
 * data rather than about configuration.
 *
 * So `awaiting` is a dashed outline with a hollow glyph — visibly provisional,
 * visibly not an error. `blocked` is a solid outline with a barred glyph on a
 * sunken ground — visibly shut, and visibly shut *on purpose*. Neither reads as
 * a failure, and neither reads as zero activity.
 *
 * This replaces the previous treatment, which rendered `blocked` through
 * `StatusBadge tone="offline"` — red, the same colour as a camera that has
 * fallen over.
 */
export function Readiness({
  state,
  children,
}: {
  state: 'awaiting' | 'blocked';
  children?: ReactNode;
}) {
  const awaiting = state === 'awaiting';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.1rem 0.45rem',
        borderRadius: 'var(--radius-xs)',
        border: `1px ${awaiting ? 'dashed' : 'solid'} ${awaiting ? 'var(--line-strong)' : 'var(--ink-tertiary)'}`,
        background: awaiting ? 'transparent' : 'var(--surface-sunken)',
        color: awaiting ? 'var(--ink-tertiary)' : 'var(--ink-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        letterSpacing: 'var(--tracking-wide)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon icon={awaiting ? StatusIcons.awaiting : StatusIcons.blocked} size="inline" />
      {children ?? (awaiting ? 'Awaiting data' : 'Blocked')}
    </span>
  );
}

/**
 * A region that could not be read, at the weight of the region rather than the
 * weight of the page.
 *
 * `UnavailableState` in `primitives.tsx` fills a screen — 3rem of padding, a
 * centred glyph, a dashed frame — which is right when the whole page has
 * nothing to show. Inside a composition it inverts the hierarchy: two absent
 * regions became the tallest things on the Command Center and pushed the
 * figures that *did* resolve below the fold.
 *
 * Same words, same honesty, sized to sit beside its neighbours. The dashed
 * border and the amber glyph are kept, because those are what distinguish "we
 * could not read this" from "there is nothing here" everywhere else in the
 * product.
 */
export function AbsentRegion({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      style={{
        border: '1px dashed var(--line-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-5)',
        background: 'var(--surface-sunken)',
        display: 'grid',
        gap: 'var(--space-3)',
        alignContent: 'start',
        // Never taller than what it says.
        //
        // Stage 5 measured the consequence of leaving this out: dropped into a
        // stretched grid track, the two "not enabled" panels on the Command
        // Center grew to 200px each and became the largest objects on the page
        // — a dashboard whose dominant visual mass was two notices that nothing
        // was happening. An explanation of an absence is a caption, not a
        // region, and it should occupy what a caption occupies.
        alignSelf: 'start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ color: 'var(--health-degraded)', display: 'flex', flexShrink: 0 }}>
          <Icon icon={StatusIcons.unavailable} size="control" />
        </span>
        <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>{title}</span>
      </div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
        {body}
      </p>
      {action}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Meter
   ──────────────────────────────────────────────────────────────────────────── */

export interface MeterSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * A proportion — and **only** when there is a real denominator.
 *
 * A stacked bar is the easiest place in a product to invent data: with no
 * subjects, every segment is zero, and a bar of zeros renders as an empty track
 * that reads exactly like "all clear". So a total of zero is not drawn at all.
 * It returns the sentence instead, because "nothing was assessed" is a fact and
 * an empty bar is a lie about it.
 */
export function Meter({
  segments,
  total,
  caption,
  emptyNote,
}: {
  segments: ReadonlyArray<MeterSegment>;
  total: number;
  caption: string;
  emptyNote: string;
}) {
  if (total <= 0) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: 'var(--measure-tight)' }}>
        <span aria-hidden="true" style={{ marginRight: 'var(--space-2)' }}>
          —
        </span>
        {emptyNote}
      </div>
    );
  }

  /**
   * A denominator with nothing under it.
   *
   * Stage 5's browser pass caught this on the camera wall: three channels, all
   * of them offline or disabled on screen, and a meter beneath them reading
   * `Live 0 · Connecting 0 · Reconnecting 0 · Offline 0 · Error 0 · Disabled 0`
   * over a total of three. The server had not reported a per-state breakdown at
   * all, and the component drew an empty track — which is exactly the reading
   * the four-state rule exists to prevent, because an empty track and an
   * all-clear track are the same picture.
   *
   * A total that no segment accounts for is not a proportion. It is a missing
   * breakdown, and it says so.
   */
  const accounted = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  if (accounted <= 0) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: 'var(--measure)' }}>
        <span aria-hidden="true" style={{ marginRight: 'var(--space-2)' }}>
          —
        </span>
        {total} in total, but no breakdown was reported for them. The proportion is
        unknown rather than zero, so none is drawn.
      </div>
    );
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`${caption}: ${segments.map((s) => `${s.value} ${s.label}`).join(', ')}`}
        style={{
          display: 'flex',
          height: 6,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          background: 'var(--surface-sunken)',
        }}
      >
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.key}
              style={{
                width: `${(segment.value / total) * 100}%`,
                background: segment.color,
                transition: 'width var(--motion-slow) var(--ease-out)',
              }}
            />
          ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2) var(--space-4)',
          marginTop: 'var(--space-3)',
        }}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-secondary)',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: 2, background: segment.color, flexShrink: 0 }}
            />
            {segment.label}
            <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-primary)' }}>
              {segment.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Coverage
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a period does and does not cover — read **before** the figures.
 *
 * The brief's requirement is that an incomplete report must not look like a
 * complete one with a small warning somewhere. So this is not a badge: it is a
 * band that sits above the sections, states the basis in a sentence, and lists
 * every gap. When the period is complete it stays — quietly — because a reader
 * who only sees a coverage treatment when something is wrong learns to skip it.
 */
export function CoverageSeal({
  complete,
  headline,
  basis,
  facts,
  gaps,
}: {
  complete: boolean;
  headline: string;
  basis: ReactNode;
  facts: ReadonlyArray<{ key: string; value: ReactNode }>;
  gaps: ReadonlyArray<{ key: string; detail: ReactNode }>;
}) {
  const color = complete ? 'var(--state-present)' : 'var(--health-degraded)';

  return (
    <section
      aria-label="Coverage"
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--line-default)',
        background: complete ? 'var(--surface-raised)' : 'var(--health-degraded-wash)',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden="true"
        style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 3, background: color }}
      />
      <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-5) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {/* A shield either way. Coverage is the report's warrant — the
              claim that the period it states is the period it read — so the
              complete and incomplete cases are the same object with a
              different verdict on it, not a tick and a half-filled circle. */}
          <span style={{ color, display: 'flex', flexShrink: 0 }}>
            <Icon
              icon={complete ? StatusIcons.coverageComplete : StatusIcons.coverageIncomplete}
              size="control"
            />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              letterSpacing: 'var(--tracking-wider)',
              textTransform: 'uppercase',
              color,
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {complete ? 'Coverage complete' : 'Coverage incomplete'}
          </span>
        </div>

        <p
          style={{
            marginTop: 'var(--space-3)',
            fontSize: 'var(--text-md)',
            lineHeight: 'var(--leading-tight)',
            letterSpacing: 'var(--tracking-tight)',
            fontWeight: 'var(--weight-medium)',
            maxWidth: '46ch',
          }}
        >
          {headline}
        </p>

        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: 'var(--measure)' }}>
          {basis}
        </p>

        <div
          style={{
            marginTop: 'var(--space-5)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4) var(--space-8)',
          }}
        >
          {facts.map((fact) => (
            <div key={fact.key}>
              <Eyebrow>{fact.key}</Eyebrow>
              <div
                style={{
                  marginTop: 'var(--space-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fact.value}
              </div>
            </div>
          ))}
        </div>

        {gaps.length > 0 ? (
          <ul style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
            {gaps.map((gap) => (
              <li
                key={gap.key}
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-secondary)',
                  maxWidth: 'var(--measure)',
                }}
              >
                <span style={{ color: 'var(--health-degraded)', flexShrink: 0, display: 'flex' }}>
                  <Icon icon={StatusIcons.gap} size="inline" />
                </span>
                <span>{gap.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Finding readout
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The eight operator questions, in the order `UI_UX_ARCHITECTURE.md` §6 sets
 * them out, rendered once and shared by every surface that shows an incident.
 *
 * Before this existed, Alerts answered all eight with a bespoke card and
 * Incidents answered three of them in a drawer — which meant the surface the
 * plan designated *primary* was the weaker of the two. One component, two call
 * sites, and the answers cannot drift apart.
 *
 * WHY is deliberately assembled from the **frozen** finding rather than
 * recomputed, so a six-month-old incident still explains itself in the words of
 * the ruleset that raised it.
 */
export function FindingReadout({
  what,
  severity,
  status,
  rows,
  why,
  evidence,
  actions,
}: {
  /**
   * WHAT, as a heading — **omit it when the surrounding surface already says
   * it**.
   *
   * Both call sites title themselves with the incident summary: the detail
   * route puts it in the page title, and the ledger's drawer puts it in the
   * dialog title. Rendering it again here produced two headings with the same
   * text, which is noise on screen and an ambiguity for anyone navigating by
   * heading. The title *is* the WHAT; this row then carries only the two facts
   * that qualify it.
   */
  what?: ReactNode;
  severity?: Severity;
  status: ReactNode;
  rows: ReadonlyArray<{ key: string; label: string; value: ReactNode }>;
  why?: ReactNode;
  evidence?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-3) var(--space-4)' }}>
        {what ? (
          <h2
            style={{
              fontSize: 'var(--text-xl)',
              letterSpacing: 'var(--tracking-tight)',
              fontWeight: 'var(--weight-semibold)',
              flex: 1,
              minWidth: '14rem',
            }}
          >
            {what}
          </h2>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {severity ? <SeverityMark severity={severity} /> : null}
          {status}
        </div>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
          gap: 'var(--space-4) var(--space-6)',
          margin: 0,
        }}
      >
        {rows.map((row) => (
          <div key={row.key}>
            <dt>
              <Eyebrow>{row.label}</Eyebrow>
            </dt>
            <dd style={{ margin: 0, marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {why ? (
        <div
          style={{
            borderInlineStart: '2px solid var(--line-default)',
            paddingInlineStart: 'var(--space-4)',
          }}
        >
          <Eyebrow>Why</Eyebrow>
          <div style={{ marginTop: 'var(--space-3)' }}>{why}</div>
        </div>
      ) : null}

      {evidence}

      {actions ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{actions}</div>
      ) : null}
    </div>
  );
}

/** The same descending run of shapes `SeverityBadge` uses, at readout size. */
const SEVERITY_ICON: Record<Severity, LucideIcon> = SeverityIcons;

/**
 * Severity, at a size that ranks.
 *
 * `SeverityBadge` in `primitives.tsx` is a 11px uppercase word and is kept for
 * dense tables. In a readout the severity is one of the two facts a person
 * reads first, so it gets the weight of one.
 */
export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.15rem 0.5rem',
        borderRadius: 'var(--radius-xs)',
        border: `1px solid var(--severity-${severity})`,
        color: `var(--severity-${severity})`,
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-wide)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon icon={SEVERITY_ICON[severity]} size="inline" />
      {severity}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Engineering register
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The wrapper that puts a page into the engineering register.
 *
 * Not a theme and not a second design system — a ground and a marker. Every
 * token inside is the product's own, which matters more than it sounds:
 * `not_visible` must be the same purple for an engineer as for a supervisor, or
 * the two are looking at different products when they compare notes.
 *
 * What changes is that the page announces what it is, and a screenshot of it
 * cannot be mistaken for an operations screen with the chrome cropped off —
 * which is the stated reason `UI_UX_ARCHITECTURE.md` §3 asked for it.
 */
export function EngineeringSurface({
  children,
  contents,
}: {
  children: ReactNode;
  /**
   * An index of the surface's own sections.
   *
   * Stage 5 measured this page at 6,776px with no way to move inside it: ten
   * runs, four comparison sets, a dataset table, a configuration dump and an
   * artifact listing, all stacked, all reached by scrolling. An engineering
   * surface is allowed to be long — density is correct here — but a long
   * document without a contents page is a document nobody reads twice.
   *
   * Rendered sticky beside the content at wide widths, and inline above it
   * below the shell breakpoint. Optional: a short surface passes nothing.
   */
  contents?: ReactNode;
}) {
  const body = (
    <div
      data-register="engineering"
      className="uwv-engineering"
      style={{
        background: 'var(--surface-engineering-panel)',
        border: '1px solid var(--engineering-line)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-5)',
        // A grid or flex item defaults to `min-width: auto`, which means it
        // refuses to shrink below the widest thing inside it — one confusion
        // table or one long artifact path and the whole surface, and every
        // sibling stretched to its track, grows past the viewport. This is the
        // narrow-width overflow in miniature, and `minWidth: 0` is the fix
        // everywhere it appears.
        minWidth: 0,
        // `auto`, not `hidden`. Clipping would put a confusion matrix beyond
        // reach on a narrow screen; scrolling inside this container keeps the
        // page from scrolling sideways *and* keeps the content reachable.
        overflowX: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          paddingBottom: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--engineering-line)',
        }}
      >
        <span style={{ color: 'var(--engineering-ink)', display: 'flex', flexShrink: 0 }}>
          <Icon icon={StatusIcons.engineering} size="inline" />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            letterSpacing: 'var(--tracking-wider)',
            textTransform: 'uppercase',
            color: 'var(--engineering-ink)',
          }}
        >
          Engineering data — not an operational reading
        </span>
      </div>
      {children}
    </div>
  );

  if (!contents) return body;

  return (
    <div className="uwv-engineering-shell">
      <nav aria-label="On this surface" className="uwv-engineering-contents">
        {contents}
      </nav>
      {body}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Disclosure
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Progressive disclosure, with the summary always readable.
 *
 * A `<details>` rather than a modal or a tooltip, for the reason the Phase 4
 * evaluation page already established: provenance a person has to hover to read
 * is provenance that never gets read, and one that opens a dialog interrupts
 * the comparison they were making. This keeps the detail in the flow.
 */
export function Disclosure({
  summary,
  children,
  count,
}: {
  summary: string;
  children: ReactNode;
  count?: number;
}) {
  return (
    <details style={{ borderTop: '1px solid var(--line-subtle)' }}>
      <summary
        className="uwv-quiet"
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          padding: 'var(--space-3) 0',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
        }}
      >
        {/* Rotates to point down when the disclosure is open — the
            `details[open]` rule in `global.css` does the turning, so the
            direction always agrees with the state without a React re-render. */}
        <span className="uwv-disclosure-caret" style={{ display: 'flex', flexShrink: 0 }}>
          <Icon icon={ControlIcons.disclosure} size="inline" />
        </span>
        {summary}
        {count !== undefined ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        ) : null}
      </summary>
      <div style={{ paddingBottom: 'var(--space-4)' }}>{children}</div>
    </details>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Viewport
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Whether a media query currently matches.
 *
 * Used by the shell to decide whether the sidebar is furniture or a drawer, and
 * by nothing else — layout that can be expressed in CSS is expressed in CSS.
 * The distinction matters because a drawer is not a narrow sidebar: it traps
 * focus, closes on `Escape` and is `aria-hidden` when shut, and none of that is
 * a style.
 *
 * Falls back to "does not match" wherever `matchMedia` is unavailable, which is
 * the desktop layout — the safe default for a control that must never trap
 * focus by accident.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/* ────────────────────────────────────────────────────────────────────────────
   Linking
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The affordance every contextual link in the product uses.
 *
 * Stage 1 found nineteen pages sharing one link between them. Giving the edges
 * a single, quiet, recognisable shape is what turns them from twenty-two
 * one-off anchors into a navigation system a person can learn once.
 *
 * Rendered by the caller inside a router `Link`, so this component never
 * decides where anything goes.
 */
export function GoTo({ children }: { children: ReactNode }) {
  return (
    <span
      className="uwv-quiet"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-xs)',
        color: 'var(--accent)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      <Icon icon={ControlIcons.goTo} size="inline" />
    </span>
  );
}

/** A `Button`-shaped link body, for the primary action out of a region. */
export function GoToButton({ children }: { children: ReactNode }) {
  return (
    <Button size="sm" variant="secondary" tabIndex={-1}>
      {children}
    </Button>
  );
}
