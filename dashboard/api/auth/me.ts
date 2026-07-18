import { findUserById } from '../../lib/db';
import { requireAuth, handleAuthError } from '../../lib/auth';
import type { ApiRequest, ApiResponse } from '../../lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { userId } = await requireAuth(req);
    const user = await findUserById(userId);
    res.status(200).json({ id: user!.id, email: user!.email });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
