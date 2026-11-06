import type { Incident } from '@live911/shared';

/** A raw SODA row as the dataset serves it (anonymised, local San Francisco times). */
export function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '41794940',
    cad_number: '263082274',
    received_datetime: '2026-11-06T13:30:00.000',
    entry_datetime: '2026-11-06T13:30:00.000',
    dispatch_datetime: '2026-11-06T13:32:00.000',
    enroute_datetime: '2026-11-06T13:32:00.000',
    call_type_original: '917',
    call_type_original_desc: 'SUSPICIOUS PERSON',
    call_type_final: '917',
    call_type_final_desc: 'SUSPICIOUS PERSON',
    call_type_final_notes: 'FREE TEXT THAT MUST NEVER LEAK',
    priority_original: 'C',
    priority_final: 'B',
    agency: 'Police',
    onview_flag: 'N',
    sensitive_call: false,
    intersection_name: 'LARKIN ST \\ OFARRELL ST',
    intersection_id: '25152000.0',
    intersection_point: { type: 'Point', coordinates: [-122.4179, 37.7851] },
    analysis_neighborhood: 'Tenderloin',
    call_last_updated_at: '2026-11-06T13:33:00.000',
    data_as_of: '2026-11-06T13:44:08.000',
    ...overrides,
  };
}

export function sensitiveRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row = rawRow({ cad_number: '263090001', sensitive_call: true, call_type_final_desc: 'SUICIDE ATTEMPT', ...overrides });
  delete row.intersection_id;
  delete row.intersection_name;
  delete row.intersection_point;
  delete row.analysis_neighborhood;
  return row;
}

/** A valid Incident for store/analytics tests. Times are relative to `T0`-style epoch ms. */
export function incident(overrides: Partial<Incident> & { id: string }, receivedMs: number): Incident {
  const createdAt = new Date(receivedMs).toISOString();
  return {
    type: 'disturbance',
    priority: 3,
    status: 'dispatched',
    areaId: 'mission',
    areaName: 'Mission',
    intersectionId: '100',
    address: 'MISSION ST \\ 16TH ST',
    lat: 37.76,
    lng: -122.42,
    description: 'SUSPICIOUS PERSON',
    agency: 'Police',
    officerInitiated: false,
    createdAt,
    dispatchedAt: new Date(receivedMs + 60_000).toISOString(),
    updatedAt: createdAt,
    ...overrides,
  };
}
