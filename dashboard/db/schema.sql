CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  r_new REAL,
  r_eol REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- devices predates r_new/r_eol; CREATE TABLE IF NOT EXISTS above is a no-op against an
-- already-provisioned database, so the columns must also be added here for existing installs.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS r_new REAL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS r_eol REAL;

CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices(user_id);

CREATE TABLE IF NOT EXISTS readings (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL,
  v_rest REAL NOT NULL,
  delta_v REAL NOT NULL,
  i_max REAL NOT NULL,
  r_int REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(device_id, cycle)
);

CREATE INDEX IF NOT EXISTS readings_device_id_idx ON readings(device_id);
