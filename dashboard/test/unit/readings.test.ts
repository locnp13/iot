import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  insertReading: vi.fn(),
  listReadingsForDevice: vi.fn(),
}));
vi.mock('../../lib/db', () => dbMock);

const authMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireDeviceToken: vi.fn(),
  requireDeviceOwnership: vi.fn(),
  handleAuthError: vi.fn((err: unknown, res: any) => {
    if (err && typeof err === 'object' && 'status' in err) {
      res.status((err as any).status).json({ error: (err as any).message });
      return true;
    }
    return false;
  }),
}));
vi.mock('../../lib/auth', () => authMock);

const { default: ingestHandler } = await import('../../api/readings');
const { default: historyHandler } = await import('../../api/devices/[id]/readings');

function mockRes() {
  const res: any = {
    _status: 200,
    status(code: number) {
      this._status = code;
      return this;
    },
    json: vi.fn(),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/readings (device ingest)', () => {
  it('rejects a missing/invalid device token', async () => {
    authMock.requireDeviceToken.mockRejectedValue({ status: 401, message: 'Missing device token' });
    const res = mockRes();
    await ingestHandler(
      { method: 'POST', headers: {}, body: { cycle: 1, vRest: 4, deltaV: 0.5, iMax: 2, rInt: 100 }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(401);
    expect(dbMock.insertReading).not.toHaveBeenCalled();
  });

  it('rejects a payload missing required numeric fields', async () => {
    authMock.requireDeviceToken.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await ingestHandler({ method: 'POST', headers: {}, body: { cycle: 1 }, query: {}, cookies: {} }, res);
    expect(res._status).toBe(400);
    expect(dbMock.insertReading).not.toHaveBeenCalled();
  });

  it('inserts a valid reading scoped to the authenticated device', async () => {
    authMock.requireDeviceToken.mockResolvedValue({ id: 5 });
    const res = mockRes();
    await ingestHandler(
      { method: 'POST', headers: {}, body: { cycle: 3, vRest: 4.1, deltaV: 0.4, iMax: 1.8, rInt: 95 }, query: {}, cookies: {} },
      res,
    );
    expect(dbMock.insertReading).toHaveBeenCalledWith(5, 3, 4.1, 0.4, 1.8, 95);
    expect(res._status).toBe(201);
  });

  it('does not error on a retried (duplicate cycle) upload — insertReading itself is idempotent', async () => {
    authMock.requireDeviceToken.mockResolvedValue({ id: 5 });
    dbMock.insertReading.mockResolvedValue(undefined); // ON CONFLICT DO NOTHING resolves normally
    const res = mockRes();
    await ingestHandler(
      { method: 'POST', headers: {}, body: { cycle: 3, vRest: 4.1, deltaV: 0.4, iMax: 1.8, rInt: 95 }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(201);
  });
});

describe('GET /api/devices/[id]/readings (history + health)', () => {
  it('rejects a caller who does not own the device', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockRejectedValue({ status: 403, message: 'Not your device' });
    const res = mockRes();
    await historyHandler({ method: 'GET', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(res._status).toBe(403);
  });

  it('returns readings with computed baseline/status for the owner', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1, rNew: null, rEol: null });
    dbMock.listReadingsForDevice.mockResolvedValue([
      { id: 1, deviceId: 9, cycle: 1, vRest: 4, deltaV: 0.5, iMax: 2, rInt: 100, createdAt: '2026-01-01' },
      { id: 2, deviceId: 9, cycle: 2, vRest: 4, deltaV: 0.6, iMax: 2, rInt: 130, createdAt: '2026-01-02' },
    ]);
    const res = mockRes();
    await historyHandler({ method: 'GET', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(res._status).toBe(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveLength(2);
    expect(payload[1].status).toBe('degrading'); // 30% above baseline (100 -> 130)
  });

  it('includes soh on each reading when the device has a rating', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1, rNew: 10, rEol: 20 });
    dbMock.listReadingsForDevice.mockResolvedValue([
      { id: 1, deviceId: 9, cycle: 1, vRest: 4, deltaV: 0.5, iMax: 2, rInt: 15, createdAt: '2026-01-01' },
    ]);
    const res = mockRes();
    await historyHandler({ method: 'GET', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload[0].soh).toBe(50);
  });

  it('returns null soh when the device has no rating', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1, rNew: null, rEol: null });
    dbMock.listReadingsForDevice.mockResolvedValue([
      { id: 1, deviceId: 9, cycle: 1, vRest: 4, deltaV: 0.5, iMax: 2, rInt: 15, createdAt: '2026-01-01' },
    ]);
    const res = mockRes();
    await historyHandler({ method: 'GET', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload[0].soh).toBeNull();
  });
});
