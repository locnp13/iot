import type { Reading } from './db.js';

export type HealthStatus = 'stable' | 'degrading' | 'replace';

const DEGRADING_THRESHOLD_PCT = 20;
const REPLACE_THRESHOLD_PCT = 50;

export interface ReadingWithHealth extends Reading {
  percentChangeFromBaseline: number;
  status: HealthStatus;
  soh: number | null;
}

/** SOH% is absolute battery quality vs. a manufacturer-rated new battery (rNew) and its
 * end-of-life threshold (rEol) — distinct from percentChangeFromBaseline, which only compares
 * a reading to this device's own first reading. Both are computed side by side, never merged. */
function computeSoh(rInt: number, device: { rNew: number | null; rEol: number | null }): number | null {
  if (device.rNew === null || device.rEol === null) return null;
  const raw = ((device.rEol - rInt) / (device.rEol - device.rNew)) * 100;
  return Math.min(100, Math.max(0, raw));
}

/** Baseline = the reading with the LOWEST cycle number, not the first-inserted row —
 * a retried upload can land in the DB later in real time than newer readings. */
export function computeHealth(
  readings: Reading[],
  device: { rNew: number | null; rEol: number | null },
): ReadingWithHealth[] {
  if (readings.length === 0) return [];

  const baseline = readings.reduce((min, r) => (r.cycle < min.cycle ? r : min), readings[0]);

  return readings.map((r) => {
    const percentChangeFromBaseline =
      baseline.rInt === 0 ? 0 : ((r.rInt - baseline.rInt) / baseline.rInt) * 100;

    let status: HealthStatus = 'stable';
    if (percentChangeFromBaseline >= REPLACE_THRESHOLD_PCT) status = 'replace';
    else if (percentChangeFromBaseline >= DEGRADING_THRESHOLD_PCT) status = 'degrading';

    const soh = computeSoh(r.rInt, device);

    return { ...r, percentChangeFromBaseline, status, soh };
  });
}
