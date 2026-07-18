import { describe, it, expect, vi } from 'vitest';

// `neon(...)` returns a tagged-template function; we stub it to capture the SQL and
// return canned rows, so we can assert the snake_case (DB) -> camelCase (API) mapping
// without touching a real database.
const sqlMock = vi.hoisted(() => vi.fn());
vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlMock }));

const db = await import('../../lib/db');

describe('createUser / findUserByEmail mapping', () => {
  it('maps snake_case columns to camelCase fields', async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 1, email: 'a@b.com', password_hash: 'hashed', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const user = await db.createUser('a@b.com', 'hashed');
    expect(user).toEqual({ id: 1, email: 'a@b.com', passwordHash: 'hashed', createdAt: '2026-01-01T00:00:00Z' });
  });

  it('returns null when no user row is found', async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await db.findUserByEmail('nobody@b.com')).toBeNull();
  });
});

describe('createDevice / listDevicesForUser mapping', () => {
  it('maps a device row to camelCase', async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 1, user_id: 9, name: 'Bench 1', token_hash: 'th', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const device = await db.createDevice(9, 'Bench 1', 'th');
    expect(device).toEqual({ id: 1, userId: 9, name: 'Bench 1', tokenHash: 'th', createdAt: '2026-01-01T00:00:00Z' });
  });

  it('maps a list of device rows', async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 1, user_id: 9, name: 'A', token_hash: 't1', created_at: '2026-01-01T00:00:00Z' },
      { id: 2, user_id: 9, name: 'B', token_hash: 't2', created_at: '2026-01-02T00:00:00Z' },
    ]);
    const devices = await db.listDevicesForUser(9);
    expect(devices).toHaveLength(2);
    expect(devices[1]).toEqual({ id: 2, userId: 9, name: 'B', tokenHash: 't2', createdAt: '2026-01-02T00:00:00Z' });
  });
});

describe('readings mapping', () => {
  it('maps a reading row to camelCase', async () => {
    sqlMock.mockResolvedValueOnce([
      {
        id: 1,
        device_id: 5,
        cycle: 1,
        v_rest: 4.0,
        delta_v: 0.5,
        i_max: 2.0,
        r_int: 100,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const readings = await db.listReadingsForDevice(5);
    expect(readings[0]).toEqual({
      id: 1,
      deviceId: 5,
      cycle: 1,
      vRest: 4.0,
      deltaV: 0.5,
      iMax: 2.0,
      rInt: 100,
      createdAt: '2026-01-01T00:00:00Z',
    });
  });
});
