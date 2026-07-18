import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(() => 'session=; Max-Age=0'),
  requireAuth: vi.fn(),
  handleAuthError: vi.fn((err: unknown, res: any) => {
    if (err && typeof err === 'object' && 'status' in err) {
      res.status((err as any).status).json({ error: (err as any).message });
      return true;
    }
    return false;
  }),
}));
vi.mock('../../lib/auth', () => authMock);

const dbMock = vi.hoisted(() => ({ findUserById: vi.fn() }));
vi.mock('../../lib/db', () => dbMock);

const { default: logoutHandler } = await import('../../api/auth/logout');
const { default: meHandler } = await import('../../api/auth/me');

function mockRes() {
  const res: any = {
    _status: 200,
    _headers: {} as Record<string, string>,
    status(code: number) {
      this._status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this._headers[name] = value;
      return this;
    },
    json: vi.fn(),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/auth/logout', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await logoutHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(405);
  });

  it('clears the session cookie and confirms ok', async () => {
    const res = mockRes();
    await logoutHandler({ method: 'POST', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._headers['Set-Cookie']).toBe('session=; Max-Age=0');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe('GET /api/auth/me', () => {
  it('rejects non-GET methods', async () => {
    const res = mockRes();
    await meHandler({ method: 'POST', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when not authenticated', async () => {
    authMock.requireAuth.mockRejectedValue({ status: 401, message: 'Not authenticated' });
    const res = mockRes();
    await meHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(401);
  });

  it('returns the current user when authenticated', async () => {
    authMock.requireAuth.mockResolvedValue({ userId: 1 });
    dbMock.findUserById.mockResolvedValue({ id: 1, email: 'a@b.com' });
    const res = mockRes();
    await meHandler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ id: 1, email: 'a@b.com' });
  });
});
