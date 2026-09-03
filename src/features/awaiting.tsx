/**
 * The shared rendering for a module that exists but is not connected.
 *
 * ### Why this is a new file and not a new primitive
 *
 * `shared/ui/primitives.tsx` is the Phase 0 design system and this phase does
 * not touch it. Everything here is *composed* from what that file already
 * exports — `PageHeader`, `Card`, `Badge`, `UnavailableState`, `StatCard` — so
 * the visual language is inherited rather than re-invented, and a change to a
 * token still reaches these pages.
 *
 * ### The one rule these pages exist to keep
 *
 * "Coming soon" is a marketing sentence and tells an operator nothing. Every
 * page here names the **specific real-world input** the module is waiting for —
 * a floor plan, a colour scheme, a POS vendor's API documentation, a completed
 * DPIA — in the server's own words, so there is one copy of each answer and the
 * page cannot drift from what the backend actually requires.
 *
 * And no page renders a number. `StatCard` is used exactly once per page, for
 * the row count, and it is passed `null` so it renders `—` with a reason: a
 * zero here would be a footfall, an occupancy or a violation count that nothing
 * produced, which is the failure this whole product is built around.
 */

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import type { ModuleCapability } from '@shared/api/capabilities';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  ErrorState,
  LoadingState,
  StatCard,
  StatusBadge,
  UnavailableState,
} from '@shared/ui/primitives';
import {
  PageIntro,
  Region,
  SectionRule,
} from '@shared/ui/product';

/**
 * Marks a module by *why* it is unavailable, which is not the same for all of
 * them. `not_configured` is waiting for work; `blocked` is waiting for
 * permission, and flattening the two would let the most sensitive module in the
 * product read like the least.
 */
export function CapabilityBadge({ state }: { state: ModuleCapability['state'] }) {
  // `StatusBadge` with the `offline` tone rather than a new colour: the design
  // system already owns what red-for-stopped looks like, and this phase does not
  // touch it.
  return state === 'blocked' ? (
    <StatusBadge tone="offline">blocked pending legal review</StatusBadge>
  ) : (
    <Badge>
      <span aria-hidden="true">◌</span> not connected
    </Badge>
  );
}

/** The checklist. Ordered as a deployment would satisfy it, and numbered because it is a sequence. */
export function AwaitingList({ requirements }: { requirements: ModuleCapability['awaiting'] }) {
  return (
    <ol
      style={{
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        marginTop: 'var(--space-4)',
        counterReset: 'awaiting',
      }}
    >
      {requirements.map((requirement, index) => (
        <li
          key={requirement.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-3)',
            alignItems: 'baseline',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-tertiary)',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--ink-primary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              {requirement.id}
            </div>
            {/* The server's sentence, verbatim. One copy of each answer. */}
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-secondary)', maxWidth: '68ch' }}>
              {requirement.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * A whole module page, from a capability query.
 *
 * Handles loading, error and the unavailable body so that each of the seven
 * pages is a title, a query and whatever is genuinely specific to it.
 */
export function ModulePage<T extends ModuleCapability>({
  query,
  fallbackTitle,
  description,
  loadingLabel,
  area,
  children,
}: {
  query: UseQueryResult<T>;
  /** Shown while the real title is still loading, so the page has a heading immediately. */
  fallbackTitle: string;
  description: string;
  loadingLabel: string;
  /**
   * The navigation area this module belongs to, for the opening's eyebrow.
   *
   * Passed rather than derived. Deriving it would mean this shared shell
   * reading the routing table, and every one of these modules already knows
   * which area it sits in — four of them are Intelligence and one is Platform,
   * and that is a fact about the product, not about the URL.
   */
  area: string;
  /** Anything specific to this module, rendered below the checklist. */
  children?: (capability: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <>
        <PageIntro eyebrow={area} title={fallbackTitle} standfirst={description} />
        <LoadingState label={loadingLabel} />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <PageIntro eyebrow={area} title={fallbackTitle} standfirst={description} />
        <ErrorState
          body={
            isApiError(query.error)
              ? query.error.friendlyMessage
              : `${fallbackTitle} could not be loaded.`
          }
          requestId={isApiError(query.error) ? query.error.requestId : undefined}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  const capability = query.data;

  return (
    <>
      <PageIntro
        eyebrow={area}
        title={capability.title}
        standfirst={description}
        meta={<CapabilityBadge state={capability.state} />}
      />

      {/* The reason, in the backend's words, before anything else on the page. */}
      <UnavailableState title={`${capability.title} is not connected`} body={capability.reason} />

      <div className="uwv-plane uwv-figure-row" style={{ padding: 'var(--space-5)', margin: 'var(--space-6) 0' }}>
        {/* Deliberately `null`. The module has zero rows, and rendering that as
            a `0` would put a number on a page whose whole point is that it has
            none — the same reason the dashboard shows `—` rather than a count
            it cannot produce. */}
        <StatCard
          label="Records stored"
          value={null}
          unavailableReason={
            capability.stored_records === 0
              ? 'The schema exists and is empty — nothing has written to it'
              : `${capability.stored_records} stored`
          }
        />
        <StatCard
          label="Inputs still required"
          value={null}
          unavailableReason={`${capability.awaiting.length} listed below`}
        />
      </div>

      <SectionRule order={3} label="What this is for" detail={capability.purpose} />

      <SectionRule
        lead
        order={4}
        label="What it is waiting for"
        detail="Each of these is a real-world input, not a task on a board. Until they exist there is nothing to show, and this page will not invent it."
      />
      <Region order={4} style={{ marginBottom: 'var(--space-10)' }}>
        <AwaitingList requirements={capability.awaiting} />
      </Region>

      {children ? <div style={{ marginBottom: 'var(--space-10)' }}>{children(capability)}</div> : null}

      <SectionRule
        order={5}
        label="Storage"
        detail="The tables exist and are empty. Connecting a source is a binding, not a schema change."
      />
      <Region order={5}>
          <ul
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-3)',
              listStyle: 'none',
            }}
          >
            {capability.tables.map((table) => (
              <li key={table}>
                <Badge mono>{table}</Badge>
              </li>
            ))}
          </ul>
      </Region>
    </>
  );
}
