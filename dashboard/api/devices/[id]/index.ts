import { deleteDevice } from '../../../lib/db.js';
import { requireAuth, requireDeviceOwnership, handleAuthError } from '../../../lib/auth.js';
import type { ApiRequest, ApiResponse } from '../../../lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'DELETE') {
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
    await deleteDevice(deviceId);

    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
