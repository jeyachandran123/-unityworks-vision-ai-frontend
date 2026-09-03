/**
 * Unique Patron ID — a page whose entire job is to read as shut.
 *
 * ### Why it is not in `module-routes.tsx` with the other six
 *
 * The difference is not one of degree. The other modules are waiting for
 * *work* — a dataset, a floor plan, a POS vendor. This one is waiting for
 * *permission*, and a reader skimming a file of seven near-identical pages would
 * not see that. Separating it is the same instinct that put the four-state badge
 * in its own component: the thing that must not be flattened gets its own place.
 *
 * ### There is no consent flow here, and that is the design
 *
 * A consent form on this page — even disabled, even labelled "preview" — would
 * be the beginning of a mechanism, and somebody would eventually wire it up. So
 * there is no form, no toggle, no "request access" button and nothing that
 * accepts input. The page states the legal artifacts required, names the schema
 * guarantees that hold whether or not anybody reads them, and stops.
 *
 * ### What it does render
 *
 * The gate's checklist, from the server, with each item marked outstanding; and
 * the guarantees `patron_tokens` makes structurally — a 64-character hash
 * column, no binary column, NOT NULL consent and legal references. Those come
 * from the backend too. A frontend asserting a backend guarantee on its own
 * authority is worth nothing, and this is the one page where that matters most.
 */

import { useQuery } from '@tanstack/react-query';

import { modulesApi } from '@shared/api/capabilities';
import { isApiError } from '@shared/api/errors';
import {
  Badge,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  UnavailableState,
} from '@shared/ui/primitives';
import {
  PageIntro,
} from '@shared/ui/product';
import { AwaitingList } from './awaiting';

export function PatronIdPage() {
  const query = useQuery({
    queryKey: ['modules', 'patron-id'],
    queryFn: () => modulesApi.patronId(),
    staleTime: 60_000,
  });

  const description =
    'A pseudonymous, site-scoped handle for a returning visitor. Never a face, never a name — and not enabled.';

  if (query.isPending) {
    return (
      <>
        <PageIntro eyebrow="Platform" title="Unique Patron ID" standfirst={description} />
        <LoadingState label="Loading patron identification" />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <PageIntro eyebrow="Platform" title="Unique Patron ID" standfirst={description} />
        <ErrorState
          body={
            isApiError(query.error)
              ? query.error.friendlyMessage
              : 'Patron identification status could not be loaded.'
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
        eyebrow="Platform"
        title={capability.title}
        standfirst={description}
        meta={<StatusBadge tone="offline">blocked pending legal review</StatusBadge>}
      />

      {/* The refusal first, in the backend's own words. */}
      <UnavailableState title="This module is blocked" body={capability.reason} />

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Why this one is different</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            Every other unconnected module in this product is waiting for
            engineering work. This one is waiting for a decision. The perception
            platform declares the port that biometric re-identification would
            need and leaves it deliberately unbound, and its own documentation
            states that it holds no persistent biometric identity as a privacy
            posture rather than a limitation. Enabling this means contradicting
            that on purpose, which needs a signed document rather than a commit.
          </p>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-3)',
            }}
          >
            There is no form on this page, and there will not be one until the
            items below are real. A disabled consent control would be the start
            of a mechanism, and a half-built consent mechanism is worse than none
            — the missing half is the half that makes withdrawal possible.
          </p>
        </Card>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Required before the first write</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            All outstanding. The backend refuses a patron token unconditionally,
            and the refusal is not a permission failure — an operator holding
            every permission in this product still gets it.
          </p>
          <AwaitingList requirements={capability.awaiting} />
        </Card>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card>
          <h2 style={{ fontSize: 'var(--text-md)' }}>What the schema guarantees regardless</h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-secondary)',
              maxWidth: '68ch',
              marginTop: 'var(--space-2)',
            }}
          >
            These hold whether or not anybody is watching, because they are
            properties of the table rather than promises about the code that
            writes to it.
          </p>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)',
            }}
          >
            {capability.schema_guarantees.map((guarantee) => (
              <li
                key={guarantee}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 'var(--space-3)',
                  alignItems: 'baseline',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-secondary)',
                  maxWidth: '68ch',
                }}
              >
                <span aria-hidden="true" style={{ color: 'var(--state-present)' }}>
                  ✓
                </span>
                {guarantee}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
            {capability.tables.map((table) => (
              <Badge key={table} mono>
                {table}
              </Badge>
            ))}
            {/* Read from the server's count of the real table, never written
                here as a literal — the one number on this page has to come
                from the database or it is a claim rather than a fact. */}
            <Badge mono>{capability.stored_records} tokens stored</Badge>
          </div>
        </Card>
      </div>
    </>
  );
}
