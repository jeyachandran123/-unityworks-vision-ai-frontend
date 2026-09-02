/**
 * The seven modules whose schema exists and whose data source does not.
 *
 * ### `available` is a required field, and it is always `false`
 *
 * Same discipline as `observations.ts`: availability is its own field, not
 * `records.length === 0`, so a consumer has to branch on it before it looks at
 * anything else. Here it happens to be `false` for every module — but typing it
 * as `boolean` rather than `false` matters, because the day a module connects,
 * every page that already branches keeps working instead of needing a rewrite.
 *
 * ### `stored_records` is not a metric
 *
 * It is `SELECT count(*)` over the caller's own tenant, and it answers "does the
 * schema exist and is it empty" for an operator wondering why a page is blank.
 * Nothing in this application may render it as a reading — zero rows in
 * `people_count_intervals` is a fact about storage, never a footfall of zero.
 */

import { api } from './client';

/** One real-world input a module is waiting for. */
export interface Requirement {
  /** Stable and machine-readable. Safe to key a list on. */
  id: string;
  /** The sentence a person reads. Written by the server, rendered verbatim. */
  detail: string;
}

export interface ModuleCapability {
  module: string;
  title: string;
  /** What the module would report if it were connected. */
  purpose: string;
  /**
   * False while nothing is bound. Branch on this before anything else — see the
   * module docstring for why it is typed `boolean` rather than `false`.
   */
  available: boolean;
  /**
   * `not_configured` — nobody has connected it yet.
   * `blocked` — a decision is withholding it, not an engineering task.
   *
   * The distinction is load-bearing for Patron ID and must never be flattened.
   */
  state: 'not_configured' | 'blocked';
  reason: string;
  awaiting: Requirement[];
  storage_ready: boolean;
  tables: string[];
  stored_records: number;
  records_by_table: Record<string, number>;
  documentation: string;
}

/** Demography carries its own aggregate-only guarantee, from the server. */
export interface DemographyCapability extends ModuleCapability {
  aggregate_only: boolean;
  aggregate_only_detail: string;
}

export interface TableOccupancyCapability extends ModuleCapability {
  /** Declared by the server so a client cannot invent a state or drop one. */
  states: string[];
}

export interface CuttingBoardCapability extends ModuleCapability {
  reading_states: string[];
}

export interface MealDetectionCapability extends ModuleCapability {
  reconciliation_states: string[];
}

export interface PosIntegrationCapability extends ModuleCapability {
  adapter: {
    bound: boolean;
    id: string;
    vendor: string;
    display_name: string;
    available: boolean;
    reason: string;
    capabilities: string[];
  };
  write_available: boolean;
  write_unavailable_reason: string;
}

export interface PatronIdCapability extends ModuleCapability {
  gate: { available: boolean; reason: string; missing: string[] };
  /** What the schema itself guarantees. Rendered from the server, not asserted here. */
  schema_guarantees: string[];
  write_available: boolean;
  write_unavailable_reason: string;
}

export interface PosConnector {
  id: string;
  connector_key: string;
  vendor: string;
  display_name: string;
  restaurant_id: string | null;
  is_active: boolean;
  capabilities: string[];
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string;
}

export interface PosConnectorList {
  connectors: PosConnector[];
  count: number;
  write_available: boolean;
}

export const modulesApi = {
  peopleCounting: () => api.get<ModuleCapability>('/modules/people-counting'),
  demography: () => api.get<DemographyCapability>('/modules/demography'),
  tableOccupancy: () => api.get<TableOccupancyCapability>('/modules/table-occupancy'),
  cuttingBoard: () => api.get<CuttingBoardCapability>('/modules/cutting-board'),
  mealDetection: () => api.get<MealDetectionCapability>('/modules/meal-detection'),
  posIntegration: () => api.get<PosIntegrationCapability>('/modules/pos-integration'),
  patronId: () => api.get<PatronIdCapability>('/modules/patron-id'),
  posConnectors: () => api.get<PosConnectorList>('/pos-connectors'),
};
