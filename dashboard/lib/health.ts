import type { Reading } from './db';

export type HealthStatus = 'stable' | 'degrading' | 'replace';

const DEGRADING_THRESHOLD_PCT = 20;
const REPLACE_THRESHOLD_PCT = 50;

export interface ReadingWithHealth extends Reading {
  percentChangeFromBaseline: number;
  status: HealthStatus;
}

/** Baseline = the reading with the LOWEST cycle number, not the first-inserted row —
 * a retried upload can land in the DB later in real time than newer readings. */
export function computeHealth(readings: Reading[]): ReadingWithHealth[] {
  if (readings.length === 0) return [];

  const baseline = readings.reduce((min, r) => (r.cycle < min.cycle ? r : min), readings[0]);

  return readings.map((r) => {
    const percentChangeFromBaseline =
      baseline.rInt === 0 ? 0 : ((r.rInt - baseline.rInt) / baseline.rInt) * 100;

    let status: HealthStatus = 'stable';
    if (percentChangeFromBaseline >= REPLACE_THRESHOLD_PCT) status = 'replace';
    else if (percentChangeFromBaseline >= DEGRADING_THRESHOLD_PCT) status = 'degrading';

    return { ...r, percentChangeFromBaseline, status };
  });
}
