import { neon, neonConfig, Pool } from '@neondatabase/serverless';

// Production (Vercel) talks to real Neon over HTTP via `neon()`. Local/container dev has no
// Neon endpoint to call, so it instead bridges through `wsproxy` (see docker-compose.yml) to a
// plain local Postgres over the WebSocket wire protocol, via `Pool`. A tiny tagged-template
// adapter around `Pool.query` keeps every call site below (`sql\`...\``) identical either way.
function createSql() {
  if (process.env.LOCAL_WSPROXY) {
    neonConfig.wsProxy = process.env.LOCAL_WSPROXY;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
      const { rows } = await pool.query(text, values);
      return rows;
    };
  }
  return neon(process.env.DATABASE_URL!);
}

const sql = createSql();

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Device {
  id: number;
  userId: number;
  name: string;
  tokenHash: string;
  createdAt: string;
}

export interface Reading {
  id: number;
  deviceId: number;
  cycle: number;
  vRest: number;
  deltaV: number;
  iMax: number;
  rInt: number;
  createdAt: string;
}

// snake_case (DB) -> camelCase (API) mapping lives ONLY here, per architecture.md pattern rules.

function mapUser(row: any): User {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

function mapDevice(row: any): Device {
  return { id: row.id, userId: row.user_id, name: row.name, tokenHash: row.token_hash, createdAt: row.created_at };
}

function mapReading(row: any): Reading {
  return {
    id: row.id,
    deviceId: row.device_id,
    cycle: row.cycle,
    vRest: row.v_rest,
    deltaV: row.delta_v,
    iMax: row.i_max,
    rInt: row.r_int,
    createdAt: row.created_at,
  };
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const rows = await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash}) RETURNING *`;
  return mapUser(rows[0]);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createDevice(userId: number, name: string, tokenHash: string): Promise<Device> {
  const rows = await sql`
    INSERT INTO devices (user_id, name, token_hash) VALUES (${userId}, ${name}, ${tokenHash}) RETURNING *
  `;
  return mapDevice(rows[0]);
}

export async function listDevicesForUser(userId: number): Promise<Device[]> {
  const rows = await sql`SELECT * FROM devices WHERE user_id = ${userId} ORDER BY created_at ASC`;
  return rows.map(mapDevice);
}

export async function findDeviceById(id: number): Promise<Device | null> {
  const rows = await sql`SELECT * FROM devices WHERE id = ${id}`;
  return rows[0] ? mapDevice(rows[0]) : null;
}

export async function findDeviceByTokenHash(tokenHash: string): Promise<Device | null> {
  const rows = await sql`SELECT * FROM devices WHERE token_hash = ${tokenHash}`;
  return rows[0] ? mapDevice(rows[0]) : null;
}

export async function updateDeviceToken(deviceId: number, tokenHash: string): Promise<void> {
  await sql`UPDATE devices SET token_hash = ${tokenHash} WHERE id = ${deviceId}`;
}

export async function deleteDevice(deviceId: number): Promise<void> {
  await sql`DELETE FROM devices WHERE id = ${deviceId}`;
}

export async function insertReading(
  deviceId: number,
  cycle: number,
  vRest: number,
  deltaV: number,
  iMax: number,
  rInt: number,
): Promise<void> {
  // ON CONFLICT DO NOTHING makes firmware retries of an already-uploaded cycle safe (FR5).
  await sql`
    INSERT INTO readings (device_id, cycle, v_rest, delta_v, i_max, r_int)
    VALUES (${deviceId}, ${cycle}, ${vRest}, ${deltaV}, ${iMax}, ${rInt})
    ON CONFLICT (device_id, cycle) DO NOTHING
  `;
}

export async function listReadingsForDevice(deviceId: number): Promise<Reading[]> {
  const rows = await sql`SELECT * FROM readings WHERE device_id = ${deviceId} ORDER BY cycle ASC`;
  return rows.map(mapReading);
}
