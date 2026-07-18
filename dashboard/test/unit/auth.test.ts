import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Device, User } from '../../lib/db';

const dbMock = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findDeviceByTokenHash: vi.fn(),
  findDeviceById: vi.fn(),
}));

vi.mock('../../lib/db', () => dbMock);

const {
  hashPassword,
  verifyPassword,
  signSession,
  sessionCookie,
  clearSessionCookie,
  requireAuth,
  hashToken,
  generateDeviceToken,
  requireDeviceToken,
  requireDeviceOwnership,
  handleAuthError,
  AuthError,
} = await import('../../lib/auth');

function fakeUser(overrides: Partial<User> = {}): User {
  return { id: 1, email: 'a@b.com', passwordHash: 'x', createdAt: '2026-01-01', ...overrides };
}
function fakeDevice(overrides: Partial<Device> = {}): Device {
  return { id: 1, userId: 1, name: 'Bench 1', tokenHash: 'hash', createdAt: '2026-01-01', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('password hashing', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    await expect(verifyPassword(hash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });
});

describe('session (JWT) cookie', () => {
  it('signs a session token and issues an HttpOnly, Secure cookie', () => {
    const token = signSession(42);
    const cookie = sessionCookie(token);
    expect(cookie).toContain(`session=${token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });

  it('clears the session cookie with Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('requireAuth', () => {
  it('throws 401 when no session cookie is present', async () => {
    await expect(requireAuth({ headers: {}, body: undefined, query: {}, cookies: {} })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 401 when the cookie holds an invalid/garbage JWT', async () => {
    await expect(
      requireAuth({ headers: {}, body: undefined, query: {}, cookies: { session: 'not-a-real-jwt' } }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 when the JWT is valid but the user no longer exists', async () => {
    dbMock.findUserById.mockResolvedValue(null);
    const token = signSession(99);
    await expect(
      requireAuth({ headers: {}, body: undefined, query: {}, cookies: { session: token } }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('resolves with the userId when the JWT is valid and the user exists', async () => {
    dbMock.findUserById.mockResolvedValue(fakeUser({ id: 7 }));
    const token = signSession(7);
    const result = await requireAuth({ headers: {}, body: undefined, query: {}, cookies: { session: token } });
    expect(result).toEqual({ userId: 7 });
  });
});

describe('device token hashing', () => {
  it('generates a 64-char hex token (32 random bytes)', () => {
    const token = generateDeviceToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates different tokens on each call', () => {
    expect(generateDeviceToken()).not.toBe(generateDeviceToken());
  });

  it('hashes a token deterministically (same input -> same hash)', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('requireDeviceToken', () => {
  it('throws 401 when the Authorization header is missing', async () => {
    await expect(requireDeviceToken({ headers: {}, body: undefined, query: {}, cookies: {} })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 401 when the Authorization header is not a Bearer token', async () => {
    await expect(
      requireDeviceToken({ headers: { authorization: 'Basic xyz' }, body: undefined, query: {}, cookies: {} }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 when the token does not match any device', async () => {
    dbMock.findDeviceByTokenHash.mockResolvedValue(null);
    await expect(
      requireDeviceToken({ headers: { authorization: 'Bearer deadbeef' }, body: undefined, query: {}, cookies: {} }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('resolves with the device when the token matches', async () => {
    const device = fakeDevice({ id: 5 });
    dbMock.findDeviceByTokenHash.mockResolvedValue(device);
    const result = await requireDeviceToken({
      headers: { authorization: 'Bearer deadbeef' },
      body: undefined,
      query: {},
      cookies: {},
    });
    expect(result).toEqual(device);
  });
});

describe('requireDeviceOwnership', () => {
  it('throws 403 when the device does not exist', async () => {
    dbMock.findDeviceById.mockResolvedValue(null);
    await expect(requireDeviceOwnership(1, 1)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when the device exists but belongs to a different user", async () => {
    dbMock.findDeviceById.mockResolvedValue(fakeDevice({ userId: 999 }));
    await expect(requireDeviceOwnership(1, 1)).rejects.toMatchObject({ status: 403 });
  });

  it('resolves with the device when the caller owns it', async () => {
    const device = fakeDevice({ id: 3, userId: 1 });
    dbMock.findDeviceById.mockResolvedValue(device);
    await expect(requireDeviceOwnership(3, 1)).resolves.toEqual(device);
  });
});

describe('handleAuthError', () => {
  it('writes status+json and returns true for an AuthError', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as any;
    const handled = handleAuthError(new AuthError(403, 'Not your device'), res);
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Not your device' });
  });

  it('returns false and writes nothing for a non-AuthError', () => {
    const res = { status: vi.fn() } as any;
    const handled = handleAuthError(new Error('boom'), res);
    expect(handled).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
