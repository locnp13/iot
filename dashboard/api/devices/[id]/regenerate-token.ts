import { updateDeviceToken } from '../../../lib/db';
import { requireAuth, requireDeviceOwnership, handleAuthError, generateDeviceToken, hashToken } from '../../../lib/auth';
import type { ApiRequest, ApiResponse } from '../../../lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { userId } = await requireAuth(req);
    const deviceId = Number(req.query.id);
    if (!Number.isInteger(deviceId)) {
      res.status(400).json({ error: 'Invalid device id' });
      return;
    }

    await requireDeviceOwnership(deviceId, userId);

    const token = generateDeviceToken();
    await updateDeviceToken(deviceId, hashToken(token));

    // New plaintext token shown exactly once; the old token is already invalid (hash was overwritten).
    res.status(200).json({ token });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
