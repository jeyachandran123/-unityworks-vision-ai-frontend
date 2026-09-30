import { describe, expect, it } from 'vitest';
import { ACCESS_CATALOG, type AccessSection } from '@app/permissions/access-catalog';
import {
  blankDrafts,
  changesFrom,
  chipTone,
  chooseRole,
  columnState,
  draftsFrom,
  resetToRole,
  sectionHasAny,
  selectSection,
  setCameraKeys,
  setCameras,
  setColumn,
  togglePermission,
  type OrganizationDraft,
} from '@features/platform/access-state';
import type { Organization, PersonAccess } from '@shared/api/platform';

const section = (id: string): AccessSection => {
  const found = ACCESS_CATALOG.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};
const COMPLIANCE = section('compliance');
const OPERATIONS = section('operations');

const ROLES = { auditor: ['view_audit', 'view_evidence', 'view_incidents'] };

function draft(overrides: Partial<OrganizationDraft> = {}): OrganizationDraft {
  return {
    organizationId: 'org-a',
    name: 'A',
    status: 'active',
    isMember: true,
    role: null,
    permissions: [],
    cameras: 'none',
    cameraKeys: [],
    ...overrides,
  };
}

describe('the access draft', () => {
  it('toggles one permission, kept sorted and unique', () => {
    const on = togglePermission(draft({ permissions: ['view_live'] }), 'view_audit');
    expect(on.permissions).toEqual(['view_audit', 'view_live']);
    expect(togglePermission(on, 'view_audit').permissions).toEqual(['view_live']);
  });

  it('reads a shared permission in both of its features', () => {
    // Alerts (operations) and Staff Hygiene (compliance) are the same key.
    const d = togglePermission(draft(), 'view_observations');
    expect(sectionHasAny(d, OPERATIONS)).toBe(true);
    expect(sectionHasAny(d, COMPLIANCE)).toBe(true);
  });

  it('reports a column as all, some, none — or empty when it has no cells', () => {
    expect(columnState(draft(), COMPLIANCE, 'view')).toBe('none');
    expect(columnState(draft({ permissions: ['view_audit'] }), COMPLIANCE, 'view')).toBe('some');
    const all = setColumn(draft(), COMPLIANCE, 'view', true);
    expect(columnState(all, COMPLIANCE, 'view')).toBe('all');
    expect(columnState(all, COMPLIANCE, 'acknowledge')).toBe('empty');
    expect(columnState(setColumn(all, COMPLIANCE, 'view', false), COMPLIANCE, 'view')).toBe('none');
  });

  it('selects a whole section without touching another', () => {
    const d = selectSection(draft({ permissions: ['view_live'] }), COMPLIANCE);
    expect(d.permissions).toEqual([
      'delete_evidence',
      'export_reports',
      'manage_cutting_board',
      'view_audit',
      'view_cutting_board',
      'view_evidence',
      'view_live',
      'view_observations',
      'view_reports',
    ]);
  });

  it('starts from a role, and resets back to it', () => {
    const chosen = chooseRole(draft({ permissions: ['view_live'] }), 'auditor', ROLES);
    expect(chosen.role).toBe('auditor');
    expect(chosen.permissions).toEqual(['view_audit', 'view_evidence', 'view_incidents']);
    const edited = togglePermission(chosen, 'view_audit');
    expect(resetToRole(edited, ROLES).permissions).toEqual(chosen.permissions);
    expect(chooseRole(edited, null, ROLES).permissions).toEqual([]);
  });

  it('colours a chip by what the person would have there', () => {
    expect(chipTone(draft({ isMember: false }))).toBe('outside');
    expect(chipTone(draft({ isMember: true }))).toBe('empty');
    expect(chipTone(draft({ isMember: false, permissions: ['view_live'] }))).toBe('granted');
  });
});

describe('what is sent', () => {
  const loaded = [
    draft({
      organizationId: 'org-a',
      role: 'auditor',
      permissions: ['view_audit'],
      cameras: 'listed',
      cameraKeys: ['c1', 'c2'],
    }),
    draft({ organizationId: 'org-b', isMember: false }),
  ];

  it('sends nothing when nothing changed', () => {
    expect(changesFrom(loaded, loaded)).toEqual([]);
  });

  it('sends only the organizations that changed, and never a listed breadth', () => {
    const edited = [togglePermission(loaded[0]!, 'view_live'), loaded[1]!];
    expect(changesFrom(loaded, edited)).toEqual([
      { organization_id: 'org-a', role: 'auditor', permissions: ['view_audit', 'view_live'] },
    ]);
  });

  it('sends a camera breadth only when it changed', () => {
    const edited = [loaded[0]!, setCameras(togglePermission(loaded[1]!, 'view_live'), 'all_in_tenant')];
    expect(changesFrom(loaded, edited)).toEqual([
      {
        organization_id: 'org-b',
        role: null,
        permissions: ['view_live'],
        camera_breadth: 'all_in_tenant',
      },
    ]);
  });

  it('does not join an organization that was ticked and then cleared', () => {
    const ticked = togglePermission(loaded[1]!, 'view_live');
    const cleared = togglePermission(ticked, 'view_live');
    expect(changesFrom(loaded, [loaded[0]!, cleared])).toEqual([]);
  });
});

describe('building drafts', () => {
  it('reads a person’s access', () => {
    const access: PersonAccess = {
      user_id: 'u',
      email: 'u@example.com',
      display_name: 'U',
      is_platform_operator: false,
      home_organization_id: 'org-a',
      organizations: [
        {
          organization_id: 'org-a',
          organization_name: 'A',
          status: 'suspended',
          is_member: true,
          is_home: true,
          role: 'auditor',
          roles: ['auditor'],
          permissions: ['view_live', 'view_audit'],
          effective: ['view_audit'],
          camera_scope: { breadth: 'listed', camera_keys: ['c1', 'c2'], site_ids: [] },
        },
      ],
    };
    expect(draftsFrom(access)).toEqual([
      {
        organizationId: 'org-a',
        name: 'A',
        status: 'suspended',
        isMember: true,
        role: 'auditor',
        permissions: ['view_audit', 'view_live'],
        cameras: 'listed',
        cameraKeys: ['c1', 'c2'],
      },
    ]);
  });

  it('starts a new person as a member of the home organization only, sorted by name', () => {
    const orgs = [
      { id: 'org-z', name: 'Zeta', status: 'active' },
      { id: 'org-a', name: 'Alpha', status: 'active' },
    ] as Organization[];
    const drafts = blankDrafts(orgs, 'org-z');
    expect(drafts.map((d) => [d.name, d.isMember])).toEqual([
      ['Alpha', false],
      ['Zeta', true],
    ]);
  });
});

describe('inside one organization', () => {
  const holds = (p: string) => ['view_audit', 'view_reports'].includes(p);

  it('adds only what the actor holds when a column is turned on', () => {
    const d = setColumn(draft(), COMPLIANCE, 'view', true, holds);
    expect(d.permissions).toEqual(['view_audit', 'view_reports']);
    // Every box the actor may tick is on, so the column reads as all.
    expect(columnState(d, COMPLIANCE, 'view', holds)).toBe('all');
    // And turning it off removes them again.
    expect(setColumn(d, COMPLIANCE, 'view', false, holds).permissions).toEqual([]);
  });

  it('still lets a tick the actor does not hold be taken away', () => {
    const d = draft({ permissions: ['view_evidence'] });
    expect(columnState(d, COMPLIANCE, 'view', holds)).toBe('some');
    expect(setColumn(d, COMPLIANCE, 'view', false, holds).permissions).toEqual([]);
  });

  it('selects only the grantable part of a section', () => {
    expect(selectSection(draft(), COMPLIANCE, holds).permissions).toEqual([
      'view_audit',
      'view_reports',
    ]);
  });

  it('sends the named cameras when specific cameras are chosen', () => {
    const loaded = [draft()];
    const edited = [setCameraKeys(setCameras(draft(), 'listed'), ['cam-02', 'cam-01'])];
    expect(changesFrom(loaded, edited)).toEqual([
      {
        organization_id: 'org-a',
        role: null,
        permissions: [],
        camera_breadth: 'listed',
        camera_keys: ['cam-01', 'cam-02'],
      },
    ]);
  });

  it('sends a changed list even when the breadth stays listed', () => {
    const loaded = [draft({ cameras: 'listed', cameraKeys: ['cam-01'] })];
    const edited = [setCameraKeys(loaded[0]!, ['cam-01', 'cam-02'])];
    expect(changesFrom(loaded, edited)[0]).toMatchObject({
      camera_breadth: 'listed',
      camera_keys: ['cam-01', 'cam-02'],
    });
  });
});
