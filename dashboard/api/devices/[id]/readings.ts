import { listReadingsForDevice } from '../../../lib/db';
import { requireAuth, requireDeviceOwnership, handleAuthError } from '../../../lib/auth';
import { computeHealth } from '../../../lib/health';
import type { ApiRequest, ApiResponse } from '../../../lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
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

    const readings = await listReadingsForDevice(deviceId);
    res.status(200).json(computeHealth(readings));
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
