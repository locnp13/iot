import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiResponse } from '../../lib/types';

const dbMock = vi.hoisted(() => ({ findUserByEmail: vi.fn() }));
vi.mock('../../lib/db', () => dbMock);

const authMock = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  signSession: vi.fn(() => 'signed-jwt'),
  sessionCookie: vi.fn((token: string) => `session=${token}; HttpOnly`),
}));
vi.mock('../../lib/auth', () => authMock);

const { default: handler } = await import('../../api/auth/login');

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

describe('POST /api/auth/login', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(405);
  });

  it('rejects missing email/password with a generic message', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('rejects an unknown email with a generic 401 (does not reveal the account does not exist)', async () => {
    dbMock.findUserByEmail.mockResolvedValue(null);
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'nobody@b.com', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('rejects a wrong password with the same generic 401', async () => {
    dbMock.findUserByEmail.mockResolvedValue({ id: 1, passwordHash: 'h' });
    authMock.verifyPassword.mockResolvedValue(false);
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'wrong' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('sets a session cookie and returns the user on correct credentials', async () => {
    dbMock.findUserByEmail.mockResolvedValue({ id: 1, email: 'a@b.com', passwordHash: 'h' });
    authMock.verifyPassword.mockResolvedValue(true);
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'correct' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(200);
    expect(res._headers['Set-Cookie']).toContain('session=signed-jwt');
    expect(res.json).toHaveBeenCalledWith({ id: 1, email: 'a@b.com' });
  });
});
