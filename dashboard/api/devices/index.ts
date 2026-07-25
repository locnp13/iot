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
          const health = computeHealth(readings, d);
          const latest = health.length > 0 ? health[health.length - 1] : null;
          return {
            id: d.id,
            name: d.name,
            createdAt: d.createdAt,
            rNew: d.rNew,
            rEol: d.rEol,
            status: latest?.status ?? null,
            latestReading: latest
              ? { id: latest.id, cycle: latest.cycle, rInt: latest.rInt, createdAt: latest.createdAt, soh: latest.soh }
              : null,
          };
        }),
      );
      res.status(200).json(withStatus);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { name?: string; rNew?: unknown; rEol?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        res.status(400).json({ error: 'Device name is required' });
        return;
      }

      const rNewValid = body.rNew === undefined || (typeof body.rNew === 'number' && body.rNew > 0);
      if (!rNewValid) {
        res.status(400).json({ error: 'rNew must be a positive number' });
        return;
      }
      const rEolValid = body.rEol === undefined || (typeof body.rEol === 'number' && body.rEol > 0);
      if (!rEolValid) {
        res.status(400).json({ error: 'rEol must be a positive number' });
        return;
      }
      const rNew = body.rNew as number | undefined;
      const rEol = body.rEol as number | undefined;

      const token = generateDeviceToken();
      const device = await createDevice(userId, name, hashToken(token), rNew, rEol);

      // Plaintext token is returned exactly once — only its hash is ever stored.
      // A brand-new device has no readings yet, so status/latestReading are null (matches the GET shape).
      res.status(201).json({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        rNew: device.rNew,
        rEol: device.rEol,
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
