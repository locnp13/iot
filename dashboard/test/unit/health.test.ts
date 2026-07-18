import { describe, it, expect } from 'vitest';
import { computeHealth } from '../../lib/health';
import type { Reading } from '../../lib/db';

function reading(overrides: Partial<Reading>): Reading {
  return {
    id: 1,
    deviceId: 1,
    cycle: 1,
    vRest: 4.0,
    deltaV: 0.5,
    iMax: 2.0,
    rInt: 100,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeHealth', () => {
  it('returns an empty array for no readings', () => {
    expect(computeHealth([])).toEqual([]);
  });

  it('treats a single reading as its own baseline: 0% change, stable', () => {
    const [result] = computeHealth([reading({ id: 1, cycle: 1, rInt: 120 })]);
    expect(result.percentChangeFromBaseline).toBe(0);
    expect(result.status).toBe('stable');
  });

  it('uses the LOWEST cycle number as baseline, not insertion order', () => {
    // Reading for cycle 1 is inserted AFTER cycle 2 (simulates a retried upload landing late).
    const readings = [
      reading({ id: 2, cycle: 2, rInt: 110 }),
      reading({ id: 1, cycle: 1, rInt: 100 }),
    ];
    const results = computeHealth(readings);
    const cycle2 = results.find((r) => r.cycle === 2)!;
    // baseline is cycle 1 (rInt 100), so cycle 2 (rInt 110) is +10%
    expect(cycle2.percentChangeFromBaseline).toBeCloseTo(10, 5);
  });

  it('classifies status as stable below the degrading threshold (20%)', () => {
    const readings = [reading({ id: 1, cycle: 1, rInt: 100 }), reading({ id: 2, cycle: 2, rInt: 115 })];
    const results = computeHealth(readings);
    expect(results[1].status).toBe('stable');
  });

  it('classifies status as degrading between 20% and 50%', () => {
    const readings = [reading({ id: 1, cycle: 1, rInt: 100 }), reading({ id: 2, cycle: 2, rInt: 130 })];
    const results = computeHealth(readings);
    expect(results[1].status).toBe('degrading');
  });

  it('classifies status as replace at or above 50%', () => {
    const readings = [reading({ id: 1, cycle: 1, rInt: 100 }), reading({ id: 2, cycle: 2, rInt: 151 })];
    const results = computeHealth(readings);
    expect(results[1].status).toBe('replace');
  });

  it('does not divide by zero when baseline rInt is 0 — falls back to 0% rather than Infinity', () => {
    const readings = [reading({ id: 1, cycle: 1, rInt: 0 }), reading({ id: 2, cycle: 2, rInt: 50 })];
    const results = computeHealth(readings);
    expect(results[0].percentChangeFromBaseline).toBe(0);
    expect(results[1].percentChangeFromBaseline).toBe(0);
    expect(Number.isFinite(results[1].percentChangeFromBaseline)).toBe(true);
  });
});
