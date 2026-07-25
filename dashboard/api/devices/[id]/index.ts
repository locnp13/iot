import { deleteDevice, updateDeviceRating } from '../../../lib/db.js';
import { requireAuth, requireDeviceOwnership, handleAuthError } from '../../../lib/auth.js';
import type { ApiRequest, ApiResponse } from '../../../lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
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

    if (req.method === 'DELETE') {
      await deleteDevice(deviceId);
      res.status(200).json({ ok: true });
      return;
    }

    // PATCH
    const body = (req.body ?? {}) as { rNew?: unknown; rEol?: unknown };
    if (!(typeof body.rNew === 'number' && body.rNew > 0)) {
      res.status(400).json({ error: 'rNew must be a positive number' });
      return;
    }
    const rEolValid = body.rEol === undefined || (typeof body.rEol === 'number' && body.rEol > 0);
    if (!rEolValid) {
      res.status(400).json({ error: 'rEol must be a positive number' });
      return;
    }
    const rNew: number = body.rNew;
    const rEol = body.rEol as number | undefined;

    await updateDeviceRating(deviceId, rNew, rEol);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
