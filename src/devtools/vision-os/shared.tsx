/**
 * DevTools building blocks.
 *
 * Two things every technical screen needs and must not reimplement: a header
 * that explains *what this is and why it matters* (§14), and a query wrapper
 * that renders the four non-content states correctly without each page writing
 * its own.
 */

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  ErrorState,
  LoadingState,
  PageHeader,
  UnavailableState,
} from '@shared/ui/primitives';

/**
 * A DevTools page header.
 *
 * `why` is required, not optional. A technical screen that shows a table without
 * saying why the table matters is the debug dump §14 rules out.
 */
export function ToolHeader({
  title,
  what,
  why,
  source,
  fixture,
}: {
  title: string;
  what: string;
  why: string;
  /** Where the data came from — the route, the module, the provider. */
  source?: string;
  /** True when the payload is fixture rather than live. Rendered loudly. */
  fixture?: boolean;
}) {
  return (
    <PageHeader
      title={title}
      description={what}
      meta={
        <>
          {fixture ? <FixtureBadge /> : null}
          {source ? <Badge mono>{source}</Badge> : null}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)', maxWidth: '58ch' }}>{why}</span>
        </>
      }
    />
  );
}

/**
 * The fixture marker.
 *
 * Loud on purpose. §16: never call a fixture source "LIVE". Everything DevTools
 * shows before Phase 3 comes from a deterministic fixture, and a screen that
 * failed to say so would be indistinguishable from a working camera.
 */
export function FixtureBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.15rem 0.5rem',
        borderRadius: 'var(--radius-xs)',
        fontSize: 'var(--text-2xs)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-wide)',
        fontWeight: 'var(--weight-semibold)',
        background: 'var(--state-not-visible-wash)',
        color: 'var(--state-not-visible)',
        border: '1px solid var(--state-not-visible)',
      }}
      title="Deterministic fixture data. Real platform, real API, constructed observations."
    >
      <span aria-hidden="true">◍</span> fixture
    </span>
  );
}

/**
 * Renders a query's four states so no page writes them by hand.
 *
 * `VISION_UNAVAILABLE` gets its own branch: "the platform is not running" and
 * "the platform observed nothing" must never look the same (invariant V8).
 */
export function QueryBoundary<T>({
  query,
  label,
  children,
}: {
  query: UseQueryResult<T>;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState label={label} />;

  if (query.isError) {
    const error = query.error;
    if (isApiError(error) && error.kind === 'vision_unavailable') {
      return (
        <UnavailableState
          title="Vision OS is not running"
          body={
            <>
              {error.friendlyMessage} No source adapter is bound before Phase 3,
              so the platform is deliberately not assembled.
            </>
          }
        />
      );
    }

    if (isApiError(error) && error.kind === 'forbidden') {
      return (
        <UnavailableState
          title="Not authorised"
          body={`${error.friendlyMessage} This is enforced by the backend, not by the navigation.`}
        />
      );
    }

    return (
      <ErrorState
        body={isApiError(error) ? error.friendlyMessage : `${label} could not be loaded.`}
        requestId={isApiError(error) ? error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <>{children(query.data)}</>;
}

/** Nanosecond instants from the platform, as something a person can read. */
export function formatInstant(ns: number | null | undefined): string {
  if (ns === null || ns === undefined) return '—';
  const ms = ns / 1_000_000;
  // The platform's fixture runs on a VirtualClock from zero, so an absolute
  // wall-clock time would be a lie. Elapsed time is what it actually means.
  return `t+${(ms / 1000).toFixed(2)}s`;
}
