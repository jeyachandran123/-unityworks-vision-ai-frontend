import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@app/permissions/permissions';
import { PRODUCT_NAV } from '@app/router/navigation';
import {
  ACCESS_ACTIONS,
  ACCESS_CATALOG,
  catalogPermissions,
  columnPermissions,
  sharedWith,
} from '@app/permissions/access-catalog';

describe('the access catalog', () => {
  it('names every permission the backend has', () => {
    expect([...catalogPermissions()].sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it('is organised by the product navigation, in its order', () => {
    expect(ACCESS_CATALOG.map((s) => s.id)).toEqual(PRODUCT_NAV.map((s) => s.id));
    expect(ACCESS_CATALOG.map((s) => s.label)).toEqual(PRODUCT_NAV.map((s) => s.label));
    for (const section of ACCESS_CATALOG) expect(section.features.length).toBeGreaterThan(0);
  });

  it('files a single-permission destination in its own section', () => {
    for (const nav of PRODUCT_NAV) {
      const section = ACCESS_CATALOG.find((s) => s.id === nav.id);
      for (const item of nav.items) {
        if (item.permissions.length !== 1) continue;
        const [only] = item.permissions;
        const named = ACCESS_ACTIONS.flatMap((a) => (section ? columnPermissions(section, a.id) : []));
        expect(named, `${nav.id} / ${item.id}`).toContain(only);
      }
    }
  });

  it('shares exactly one permission between two features, and says so', () => {
    const counts = new Map<string, number>();
    for (const section of ACCESS_CATALOG) {
      for (const feature of section.features) {
        for (const permission of Object.values(feature.cells)) {
          counts.set(permission, (counts.get(permission) ?? 0) + 1);
        }
      }
    }
    const shared = [...counts].filter(([, n]) => n > 1).map(([p]) => p);
    expect(shared).toEqual([PERMISSIONS.viewObservations]);
    expect(sharedWith(PERMISSIONS.viewObservations, 'alerts')).toEqual(['Staff Hygiene']);
    expect(sharedWith(PERMISSIONS.viewObservations, 'hygiene')).toEqual(['Alerts']);
  });

  it('gives an informational row a note and no cells', () => {
    const rows = ACCESS_CATALOG.flatMap((s) => s.features).filter((f) => f.note);
    expect(rows.map((f) => f.label)).toEqual(['Command Center', 'Runtime Diagnostics']);
    for (const row of rows) expect(Object.keys(row.cells)).toEqual([]);
  });
});
