import { createDevice, listDevicesForUser, listReadingsForDevice } from '../../lib/db.js';
import { requireAuth, handleAuthError, generateDeviceToken, hashToken } from '../../lib/auth.js';
import { computeHealth } from '../../lib/health.js';
import type { ApiRequest, ApiResponse } from '../../lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const { userId } = await requireAuth(req);

    if (req.method === 'GET') {
      const devices = await listDevicesForUser(userId);
      // Small, internal-scale device counts make a per-device readings lookup here fine —
      // not worth a more complex aggregate SQL query for the sizes this tool runs at.
      const withStatus = await Promise.all(
        devices.map(async (d) => {
          const readings = await listReadingsForDevice(d.id);
          const health = computeHealth(readings);
          const latest = health.length > 0 ? health[health.length - 1] : null;
          return {
            id: d.id,
            name: d.name,
            createdAt: d.createdAt,
            status: latest?.status ?? null,
            latestReading: latest
              ? { id: latest.id, cycle: latest.cycle, rInt: latest.rInt, createdAt: latest.createdAt }
              : null,
          };
        }),
      );
      res.status(200).json(withStatus);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { name?: string };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        res.status(400).json({ error: 'Device name is required' });
        return;
      }

      const token = generateDeviceToken();
      const device = await createDevice(userId, name, hashToken(token));

      // Plaintext token is returned exactly once — only its hash is ever stored.
      // A brand-new device has no readings yet, so status/latestReading are null (matches the GET shape).
      res.status(201).json({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        status: null,
        latestReading: null,
        token,
      });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
