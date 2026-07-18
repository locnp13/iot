import { findUserByEmail } from '../../lib/db';
import { verifyPassword, signSession, sessionCookie } from '../../lib/auth';
import type { ApiRequest, ApiResponse } from '../../lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as { email?: string; password?: string };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Invalid credentials' });
    return;
  }

  try {
    const user = await findUserByEmail(email);
    const valid = user ? await verifyPassword(user.passwordHash, password) : false;

    if (!user || !valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.status(200).json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error' });
  }
}
