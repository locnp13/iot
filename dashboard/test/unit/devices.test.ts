import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  createDevice: vi.fn(),
  listDevicesForUser: vi.fn(),
  updateDeviceToken: vi.fn(),
  listReadingsForDevice: vi.fn(),
  deleteDevice: vi.fn(),
}));
vi.mock('../../lib/db', () => dbMock);

const authMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireDeviceOwnership: vi.fn(),
  handleAuthError: vi.fn((err: unknown, res: any) => {
    if (err && typeof err === 'object' && 'status' in err) {
      res.status((err as any).status).json({ error: (err as any).message });
      return true;
    }
    return false;
  }),
  generateDeviceToken: vi.fn(() => 'plaintext-token'),
  hashToken: vi.fn((t: string) => `hashed:${t}`),
}));
vi.mock('../../lib/auth', () => authMock);

const { default: devicesHandler } = await import('../../api/devices/index');
const { default: regenerateHandler } = await import('../../api/devices/[id]/regenerate-token');
const { default: deviceByIdHandler } = await import('../../api/devices/[id]/index');

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

describe('GET/POST /api/devices', () => {
  it('rejects unauthenticated GET', async () => {
    authMock.requireAuth.mockRejectedValue({ status: 401, message: 'Not authenticated' });
    const res = mockRes();
    await devicesHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(401);
  });

  it('lists only the caller’s devices, with no status when it has no readings yet', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    dbMock.listDevicesForUser.mockResolvedValue([
      { id: 1, name: 'Bench 1', createdAt: '2026-01-01', userId: 1, tokenHash: 'x' },
    ]);
    dbMock.listReadingsForDevice.mockResolvedValue([]);
    const res = mockRes();
    await devicesHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(dbMock.listDevicesForUser).toHaveBeenCalledWith(1);
    expect(res._status).toBe(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Bench 1', createdAt: '2026-01-01', status: null }]);
  });

  it('includes each device’s latest computed health status', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    dbMock.listDevicesForUser.mockResolvedValue([
      { id: 1, name: 'Bench 1', createdAt: '2026-01-01', userId: 1, tokenHash: 'x' },
    ]);
    dbMock.listReadingsForDevice.mockResolvedValue([
      { id: 1, deviceId: 1, cycle: 1, vRest: 4, deltaV: 0.5, iMax: 2, rInt: 100, createdAt: '2026-01-01' },
      { id: 2, deviceId: 1, cycle: 2, vRest: 4, deltaV: 0.6, iMax: 2, rInt: 130, createdAt: '2026-01-02' },
    ]);
    const res = mockRes();
    await devicesHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload[0].status).toBe('degrading');
  });

  it('rejects POST with an empty device name', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    const res = mockRes();
    await devicesHandler({ method: 'POST', headers: {}, body: { name: '  ' }, query: {}, cookies: {} }, res);
    expect(res._status).toBe(400);
  });

  it('creates a device and returns the plaintext token exactly once', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    dbMock.createDevice.mockResolvedValue({ id: 5, name: 'Bench 2', createdAt: '2026-01-01' });
    const res = mockRes();
    await devicesHandler({ method: 'POST', headers: {}, body: { name: 'Bench 2' }, query: {}, cookies: {} }, res);
    expect(dbMock.createDevice).toHaveBeenCalledWith(1, 'Bench 2', 'hashed:plaintext-token');
    expect(res._status).toBe(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 5,
      name: 'Bench 2',
      createdAt: '2026-01-01',
      status: null,
      token: 'plaintext-token',
    });
  });

  it('rejects methods other than GET/POST', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    const res = mockRes();
    await devicesHandler({ method: 'DELETE', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(405);
  });
});

describe('POST /api/devices/[id]/regenerate-token', () => {
  it('rejects a caller who does not own the device (403, not 404)', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockRejectedValue({ status: 403, message: 'Not your device' });
    const res = mockRes();
    await regenerateHandler({ method: 'POST', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(res._status).toBe(403);
    expect(dbMock.updateDeviceToken).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric device id', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    const res = mockRes();
    await regenerateHandler({ method: 'POST', headers: {}, body: {}, query: { id: 'abc' }, cookies: {} }, res);
    expect(res._status).toBe(400);
  });

  it('issues a new token for the owner and returns it once', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1 });
    const res = mockRes();
    await regenerateHandler({ method: 'POST', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(dbMock.updateDeviceToken).toHaveBeenCalledWith(9, 'hashed:plaintext-token');
    expect(res._status).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ token: 'plaintext-token' });
  });
});

describe('DELETE /api/devices/[id]', () => {
  it('rejects methods other than DELETE', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    const res = mockRes();
    await deviceByIdHandler({ method: 'GET', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(res._status).toBe(405);
  });

  it('rejects a non-numeric device id', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    const res = mockRes();
    await deviceByIdHandler({ method: 'DELETE', headers: {}, body: {}, query: { id: 'abc' }, cookies: {} }, res);
    expect(res._status).toBe(400);
  });

  it('rejects a caller who does not own the device (403, not 404)', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockRejectedValue({ status: 403, message: 'Not your device' });
    const res = mockRes();
    await deviceByIdHandler({ method: 'DELETE', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(res._status).toBe(403);
    expect(dbMock.deleteDevice).not.toHaveBeenCalled();
  });

  it('deletes the device for its owner', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1 });
    const res = mockRes();
    await deviceByIdHandler({ method: 'DELETE', headers: {}, body: {}, query: { id: '9' }, cookies: {} }, res);
    expect(dbMock.deleteDevice).toHaveBeenCalledWith(9);
    expect(res._status).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
