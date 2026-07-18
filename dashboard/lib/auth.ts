import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { findUserById, findDeviceByTokenHash, findDeviceById, type Device } from './db.js';
import type { ApiRequest, ApiResponse } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function signSession(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET as string, { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function requireAuth(req: ApiRequest): Promise<{ userId: number }> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw new AuthError(401, 'Not authenticated');
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as { userId: number };
    const user = await findUserById(payload.userId);
    if (!user) throw new AuthError(401, 'Not authenticated');
    return { userId: user.id };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(401, 'Not authenticated');
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Confirms the caller presented a valid device bearer token. Does NOT imply ownership of any specific resource. */
export async function requireDeviceToken(req: ApiRequest): Promise<Device> {
  const authHeader = req.headers['authorization'];
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError(401, 'Missing device token');
  }
  const token = header.slice('Bearer '.length).trim();
  const device = await findDeviceByTokenHash(hashToken(token));
  if (!device) throw new AuthError(401, 'Invalid device token');
  return device;
}

/** Authentication (requireAuth) only confirms WHO is logged in — this separately confirms they OWN this device. */
export async function requireDeviceOwnership(deviceId: number, userId: number): Promise<Device> {
  const device = await findDeviceById(deviceId);
  if (!device || device.userId !== userId) {
    throw new AuthError(403, 'Not your device');
  }
  return device;
}

/** Returns true (and writes the response) if err was an AuthError; otherwise the caller should handle it. */
export function handleAuthError(err: unknown, res: ApiResponse): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}
