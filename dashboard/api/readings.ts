import { insertReading } from '../lib/db.js';
import { requireDeviceToken, handleAuthError } from '../lib/auth.js';
import type { ApiRequest, ApiResponse } from '../lib/types.js';

interface ReadingPayload {
  cycle?: number;
  vRest?: number;
  deltaV?: number;
  iMax?: number;
  rInt?: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const device = await requireDeviceToken(req);

    const body = (req.body ?? {}) as ReadingPayload;
    if (
      !Number.isInteger(body.cycle) ||
      !isFiniteNumber(body.vRest) ||
      !isFiniteNumber(body.deltaV) ||
      !isFiniteNumber(body.iMax) ||
      !isFiniteNumber(body.rInt)
    ) {
      res.status(400).json({ error: 'Invalid reading payload' });
      return;
    }

    await insertReading(device.id, body.cycle as number, body.vRest, body.deltaV, body.iMax, body.rInt);

    res.status(201).json({ ok: true });
  } catch (err) {
    if (handleAuthError(err, res)) return;
    res.status(500).json({ error: 'Unexpected error' });
  }
}
