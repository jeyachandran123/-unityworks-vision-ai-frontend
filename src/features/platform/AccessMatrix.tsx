/**
 * The access matrix — one person's permissions, organization by organization.
 *
 * The same shape as the UnityWorks ERP's Roles & Permissions step: a row of
 * organizations ("Permissions for"), a row of the product's five areas, and a
 * function × action grid with column "All" toggles. Every cell is one
 * `Permission` (`access-catalog.ts`); nothing here decides access — the backend
 * does, on every route, from the rows this grid's save writes.
 *
 * Controlled and fetch-free: the page owns the drafts and the save.
 *
 * ### Two homes, one grid
 *
 * The platform console shows every organization (`showOrganizations`) and
 * gives anything. An organization's own User & Access shows just itself, and
 * passes `canGrant` — somebody administering people there may only *give* what
 * they hold, so a box they do not hold is greyed until it is ticked (taking
 * away is never restricted) — and `cameraPicker`, because only inside the
 * organization can its specific cameras be chosen.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import {
  ACCESS_ACTIONS,
  ACCESS_CATALOG,
  sharedWith,
  type AccessSection,
} from '@app/permissions/access-catalog';
import { roleLabel } from '@app/permissions/permissions';
import { Button, EmptyState, Select } from '@shared/ui/primitives';
import {
  chipTone,
  chooseRole,
  columnState,
  has,
  resetToRole,
  rolePermissionsFrom,
  sectionHasAny,
  selectSection,
  setCameras,
  setColumn,
  togglePermission,
  type CanGrant,
  type ChipTone,
  type OrganizationDraft,
} from '@features/platform/access-state';

/** A role the "Start from role" list offers. `grantable: false` is shown, not offered. */
export interface MatrixRole {
  role: string;
  permissions: string[];
  grantable?: boolean;
}

const TONE_WORD: Record<ChipTone, string> = {
  granted: 'has access',
  empty: 'member, nothing ticked',
  outside: 'not a member',
};

/**
 * The health tokens the rest of the product uses for "on / partly / off" —
 * and a different *shape* for each, full, half and hollow, so the three stay
 * apart for somebody who cannot tell green from amber. The legend under the
 * chips says the same thing in words.
 */
const TONE_DOT: Record<ChipTone, CSSProperties> = {
  granted: { background: 'var(--health-online)' },
  empty: {
    background: 'linear-gradient(90deg, var(--health-degraded) 50%, transparent 50%)',
    boxShadow: 'inset 0 0 0 1px var(--health-degraded)',
  },
  outside: { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--health-idle)' },
};

const TONES: ReadonlyArray<ChipTone> = ['granted', 'empty', 'outside'];

const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'inline-block',
};

const pill = (selected: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: '0.4rem 0.8rem',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${selected ? 'var(--accent-fill)' : 'var(--line-default)'}`,
  background: selected ? 'var(--accent-fill)' : 'var(--surface-raised)',
  color: selected ? 'var(--ink-on-accent)' : 'var(--ink-primary)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
});

const label: CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-medium)',
  color: 'var(--ink-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
};

const radioLabel: CSSProperties = {
  display: 'inline-flex',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-sm)',
};

export function AccessMatrix({
  drafts,
  roles,
  onChange,
  showOrganizations = true,
  canGrant,
  cameraPicker,
}: {
  drafts: OrganizationDraft[];
  roles: ReadonlyArray<MatrixRole>;
  onChange: (next: OrganizationDraft) => void;
  /** The "Permissions for" row. Off inside an organization: there is only one. */
  showOrganizations?: boolean;
  /** Whether the actor may *give* a permission. Omitted: everything (platform). */
  canGrant?: CanGrant;
  /** Offered: "Specific cameras" becomes a real choice, and this draws the list. */
  cameraPicker?: (draft: OrganizationDraft) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(
    () => (drafts.find((d) => d.isMember) ?? drafts[0])?.organizationId ?? '',
  );
  const [sectionId, setSectionId] = useState(ACCESS_CATALOG[0]?.id ?? '');
  const rolePermissions = useMemo(() => rolePermissionsFrom(roles), [roles]);

  const draft = drafts.find((d) => d.organizationId === selectedId) ?? drafts[0];
  const section: AccessSection | undefined =
    ACCESS_CATALOG.find((s) => s.id === sectionId) ?? ACCESS_CATALOG[0];

  if (!draft || !section) {
    return (
      <EmptyState
        title="No organizations"
        body="There is no organization on the platform to give access to yet."
      />
    );
  }

  const locked = draft.status === 'archived';

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ ...label, margin: 0, fontSize: 'var(--text-sm)' }}>Roles &amp; permissions</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="primary"
            size="sm"
            disabled={locked}
            onClick={() => onChange(selectSection(draft, section, canGrant))}
          >
            Select all {section.label}
          </Button>
          <Button size="sm" disabled={locked} onClick={() => onChange(resetToRole(draft, rolePermissions))}>
            Reset to role
          </Button>
        </div>
      </div>

      <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 'var(--text-sm)' }}>
        {showOrganizations
          ? 'What this person may do on each screen, one organization at a time. '
          : 'What this person may do on each screen in this organization. '}
        Every box is one permission, and the server enforces exactly what is ticked.
        {canGrant
          ? ' A greyed box is a permission you do not hold yourself: you can take it away, not give it.'
          : null}
      </p>

      <ul
        aria-label="Actions"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', listStyle: 'none', margin: 0, padding: 0 }}
      >
        {ACCESS_ACTIONS.map((action) => (
          <li
            key={action.id}
            title={action.meaning}
            style={{
              border: '1px solid var(--line-default)',
              borderRadius: 'var(--radius-xs)',
              padding: '0.15rem 0.5rem',
              fontSize: 'var(--text-xs)',
            }}
          >
            <strong>{action.letter}</strong> — {action.label}
          </li>
        ))}
      </ul>

      {showOrganizations ? (
        <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={label}>Permissions for</span>
        {drafts.map((d) => {
          const tone = chipTone(d);
          const archived = d.status === 'archived';
          const selected = d.organizationId === draft.organizationId;
          return (
            <button
              key={d.organizationId}
              type="button"
              aria-pressed={selected}
              // The dot's meaning in words, so colour is never the only signal.
              aria-label={`${d.name}, ${TONE_WORD[tone]}${archived ? ', archived' : ''}`}
              title={TONE_WORD[tone]}
              disabled={archived}
              onClick={() => setSelectedId(d.organizationId)}
              style={{
                ...pill(selected),
                opacity: archived ? 0.5 : 1,
                cursor: archived ? 'not-allowed' : 'pointer',
              }}
            >
              <span aria-hidden="true" style={{ ...dot, ...TONE_DOT[tone] }} />
              {d.name}
            </button>
          );
        })}
      </div>

      <ul
        aria-label="What the dots mean"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-tertiary)',
        }}
      >
        {TONES.map((tone) => (
          <li key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span aria-hidden="true" style={{ ...dot, ...TONE_DOT[tone] }} />
            {TONE_WORD[tone]}
          </li>
        ))}
      </ul>

        </>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 'var(--space-5)',
          padding: 'var(--space-3) var(--space-4)',
          borderLeft: '3px solid var(--accent)',
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div style={{ minWidth: '10rem' }}>
          <div style={{ fontWeight: 'var(--weight-semibold)' }}>{draft.name}</div>
          {showOrganizations ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-tertiary)' }}>
              {draft.isMember ? 'Member' : 'Not a member — ticking anything admits them'}
            </div>
          ) : null}
        </div>
        <div style={{ minWidth: '13rem' }}>
          <Select
            label="Start from role"
            value={draft.role ?? ''}
            disabled={locked}
            onChange={(event) => onChange(chooseRole(draft, event.target.value || null, rolePermissions))}
            hint="Choosing a role replaces the ticks with that role's permissions."
          >
            <option value="">No role</option>
            {roles.map((r) => {
              // Shown so the list reads complete, never offered: the server
              // refuses a template role wider than the actor's own.
              const withheld = r.grantable === false && r.role !== draft.role;
              return (
                <option key={r.role} value={r.role} disabled={withheld}>
                  {roleLabel(r.role)}
                  {withheld ? ' (not yours to give)' : ''}
                </option>
              );
            })}
          </Select>
        </div>
        <fieldset
          disabled={locked}
          style={{
            border: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            gap: 'var(--space-4)',
            alignItems: 'center',
          }}
        >
          <legend style={label}>Cameras</legend>
          <label style={radioLabel}>
            <input
              type="radio"
              name={`cameras-${draft.organizationId}`}
              checked={draft.cameras === 'none'}
              onChange={() => onChange(setCameras(draft, 'none'))}
            />
            No cameras
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name={`cameras-${draft.organizationId}`}
              checked={draft.cameras === 'all_in_tenant'}
              onChange={() => onChange(setCameras(draft, 'all_in_tenant'))}
            />
            All cameras
          </label>
          {cameraPicker ? (
            <label style={radioLabel}>
              <input
                type="radio"
                name={`cameras-${draft.organizationId}`}
                checked={draft.cameras === 'listed'}
                onChange={() => onChange(setCameras(draft, 'listed'))}
              />
              Specific cameras
            </label>
          ) : draft.cameras === 'listed' ? (
            <label style={{ ...radioLabel, color: 'var(--ink-tertiary)' }}>
              <input type="radio" name={`cameras-${draft.organizationId}`} checked readOnly />
              Specific cameras ({draft.cameraKeys.length}) — set inside the organization
            </label>
          ) : null}
        </fieldset>
      </div>

      {cameraPicker && draft.cameras === 'listed' ? cameraPicker(draft) : null}

      {draft.status === 'suspended' ? (
        <p
          role="note"
          style={{
            margin: 0,
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--line-default)',
            borderLeft: '3px solid var(--health-degraded)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {draft.name} is suspended. Manage and Delete ticks are stored but take effect only when
          the organization is restored.
        </p>
      ) : null}
      {locked ? (
        <p role="note" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-tertiary)' }}>
          {draft.name} is archived. Nobody may sign in to it, so access cannot be given there.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {ACCESS_CATALOG.map((s) => {
          const any = sectionHasAny(draft, s);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === section.id}
              aria-label={any ? `${s.label}, has ticks` : s.label}
              onClick={() => setSectionId(s.id)}
              style={{ ...pill(s.id === section.id), borderRadius: '999px' }}
            >
              {s.label}
              {any ? <span aria-hidden="true" style={{ ...dot, ...TONE_DOT.granted }} /> : null}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--line-default)', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <caption className="sr-only">{`${section.label} permissions in ${draft.name}`}</caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line-default)' }}>
              <th scope="col" style={{ ...label, textAlign: 'left', padding: 'var(--space-3) var(--space-4)' }}>
                Function name
              </th>
              {ACCESS_ACTIONS.map((action) => {
                const state = columnState(draft, section, action.id, canGrant);
                return (
                  <th key={action.id} scope="col" style={{ padding: 'var(--space-2)', textAlign: 'center', minWidth: '3.5rem' }}>
                    <div title={action.label} style={{ fontWeight: 'var(--weight-semibold)' }}>
                      {action.letter}
                    </div>
                    {state === 'empty' ? (
                      <span aria-hidden="true" style={{ color: 'var(--ink-tertiary)' }}>
                        —
                      </span>
                    ) : (
                      <label
                        style={{
                          display: 'grid',
                          justifyItems: 'center',
                          gap: '0.1rem',
                          fontSize: 'var(--text-2xs)',
                          color: 'var(--ink-tertiary)',
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`All ${action.label} in ${section.label}`}
                          checked={state === 'all'}
                          disabled={locked}
                          ref={(element) => {
                            if (element) element.indeterminate = state === 'some';
                          }}
                          onChange={() =>
                            onChange(setColumn(draft, section, action.id, state !== 'all', canGrant))
                          }
                        />
                        <span aria-hidden="true">All</span>
                      </label>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {section.features.map((feature) => {
              const view = feature.cells.view;
              const shared = view ? sharedWith(view, feature.id) : [];
              return (
                <tr key={feature.id} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                  <th
                    scope="row"
                    style={{
                      textAlign: 'left',
                      fontWeight: 'var(--weight-regular)',
                      padding: 'var(--space-3) var(--space-4)',
                    }}
                  >
                    {feature.label}
                    {shared.length > 0 ? (
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-tertiary)' }}>
                        View is shared with {shared.join(', ')}
                      </div>
                    ) : null}
                  </th>
                  {feature.note ? (
                    <td
                      colSpan={ACCESS_ACTIONS.length}
                      style={{ padding: 'var(--space-3)', color: 'var(--ink-tertiary)', fontSize: 'var(--text-xs)' }}
                    >
                      {feature.note}
                    </td>
                  ) : (
                    ACCESS_ACTIONS.map((action) => {
                      const permission = feature.cells[action.id];
                      return (
                        <td key={action.id} style={{ textAlign: 'center', padding: 'var(--space-2)' }}>
                          {permission ? (
                            <input
                              type="checkbox"
                              aria-label={`${action.label} — ${feature.label}`}
                              title={
                                canGrant && !canGrant(permission)
                                  ? `${permission} — you do not hold this yourself`
                                  : permission
                              }
                              checked={has(draft, permission)}
                              disabled={
                                locked ||
                                (canGrant !== undefined &&
                                  !canGrant(permission) &&
                                  !has(draft, permission))
                              }
                              onChange={() => onChange(togglePermission(draft, permission))}
                            />
                          ) : (
                            <span aria-hidden="true" style={{ color: 'var(--ink-tertiary)' }}>
                              —
                            </span>
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
