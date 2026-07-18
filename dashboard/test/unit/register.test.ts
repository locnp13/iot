import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiResponse } from '../../lib/types';

const dbMock = vi.hoisted(() => ({
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
}));
vi.mock('../../lib/db', () => dbMock);

const authMock = vi.hoisted(() => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
}));
vi.mock('../../lib/auth', () => authMock);

const { default: handler } = await import('../../api/auth/register');

function mockRes() {
  const res: any = {
    _status: 200,
    status(code: number) {
      this._status = code;
      return this;
    },
    json: vi.fn(),
  };
  return res as ApiResponse & { _status: number; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.hashPassword.mockImplementation(async (pw: string) => `hashed:${pw}`);
});

describe('POST /api/auth/register', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, body: {}, query: {}, cookies: {} }, res);
    expect(res._status).toBe(405);
  });

  it('rejects an invalid email', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'not-an-email', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email address' });
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'short' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
  });

  it('rejects when the email is already registered', async () => {
    dbMock.findUserByEmail.mockResolvedValue({ id: 1, email: 'a@b.com' });
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(409);
    expect(dbMock.createUser).not.toHaveBeenCalled();
  });

  it('creates the user with a hashed password on valid input', async () => {
    dbMock.findUserByEmail.mockResolvedValue(null);
    dbMock.createUser.mockResolvedValue({ id: 1, email: 'a@b.com' });
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'A@B.com', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(dbMock.createUser).toHaveBeenCalledWith('a@b.com', 'hashed:password123');
    expect(res._status).toBe(201);
    expect(res.json).toHaveBeenCalledWith({ id: 1, email: 'a@b.com' });
  });

  it('returns 409 (not 500) on a unique_violation race between the check and the insert', async () => {
    dbMock.findUserByEmail.mockResolvedValue(null);
    dbMock.createUser.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(409);
  });

  it('returns 500 for an unexpected database error', async () => {
    dbMock.findUserByEmail.mockRejectedValue(new Error('connection refused'));
    const res = mockRes();
    await handler(
      { method: 'POST', headers: {}, body: { email: 'a@b.com', password: 'password123' }, query: {}, cookies: {} },
      res,
    );
    expect(res._status).toBe(500);
  });
});
