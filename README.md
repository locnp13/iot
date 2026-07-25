# Battery Internal Resistance Monitoring System

An ESP32-based test-bench that measures a 12V lead-acid battery's **internal resistance (R_int)** on demand, uploads it to a cloud backend, and tracks battery health over time on a web dashboard — replacing the manual workflow of multimeter + stopwatch + handwritten log.

Resting voltage alone doesn't tell you whether a battery can still deliver a large cranking current. Internal resistance does. This system applies a brief, safe load pulse, measures the voltage sag and peak current, computes R_int, and turns that single measurement into a **trend**: is this battery stable, degrading, or due for replacement — and how does it compare to a brand-new battery of its rated spec (SOH%)?

## How it works

1. **Device is in Deep Sleep** to conserve power.
2. Press the button (GPIO D4) → ESP32 wakes via an `ext0` interrupt.
3. A relay closes a 2.6Ω dummy load across the battery for **exactly 3 seconds**, drawing ~4.8A.
4. During those 3 seconds, an **ADS1115** (16-bit ADC, up to 860 SPS) samples voltage and current continuously — far more accurate than the ESP32's built-in ADC — finding `V_min` and `I_max`.
5. `ΔV = V_rest − V_min`, `R_int = ΔV / I_max`.
6. The relay opens, the device connects to Wi-Fi (bounded to 4s) and POSTs the reading over HTTPS, authenticated by a per-device token (never plaintext credentials). If upload fails, the full reading is persisted to flash and retried on the next wake — no data loss.
7. A 5-second cooldown lock follows, then back to Deep Sleep. Static draw in sleep: ~15µA.

Current is measured with an **ACS758-100A** Hall-effect sensor, fully isolating the load circuit from the control circuit.

## Architecture

Three tiers, one-way and event-driven — no MQTT, no persistent connections (the device sleeps too deeply to hold one open; see rationale below):

```
┌─────────────┐   HTTPS POST    ┌──────────────────┐   SQL    ┌────────────────┐
│   Device    │ ───(1x/wake)──▶ │   Cloud backend    │ ───────▶ │  Neon Postgres │
│  ESP32 +    │  Bearer token    │ Vercel serverless  │          │                │
│ ADS1115 +   │                  │ /api functions      │◀──────── users/devices/ │
│  ACS758     │                  │                      │  query   readings      │
└─────────────┘                  └──────────┬───────────┘          └────────────┘
                                             │ JWT session
                                             ▼
                                  ┌──────────────────────┐
                                  │  Web dashboard         │
                                  │  React + Vite          │
                                  │  R_int trend, SOH%,     │
                                  │  health status          │
                                  └──────────────────────┘
```

**Why not MQTT:** each measurement cycle produces exactly one record, not a continuous stream. The device can't maintain a persistent connection through Deep Sleep, and the serverless backend doesn't hold long-lived connections either — a broker would add cost and complexity disproportionate to this scale. A single HTTPS POST with flash-backed retry covers the same reliability need.

## Repository structure

```
IoT_Project.ino       — ESP32 firmware (Arduino)
dashboard/            — Backend (Vercel /api) + frontend (React) + DB schema
  api/                 — Serverless functions: auth, devices, readings ingest/history
  lib/                 — Shared DB client, auth helpers, health/SOH computation
  src/                 — React dashboard (pages, components, API client)
  db/schema.sql        — One-time manual migration script (Postgres)
  e2e/, test/unit/     — Playwright e2e + Vitest unit tests
scripts/               — simulate_device.sh, local dev helpers
_bmad-output/          — Planning artifacts (PRD, architecture, epics/stories)
```

## Dashboard features

- Email/password auth (JWT session), per-device API tokens (shown once, revocable/regenerable)
- Add/delete devices, each permanently mapped 1:1 to one battery
- Reading history as chart + table (cycle, V_rest, ΔV, I_max, R_int, timestamp)
- **Baseline-drift health status** — % change vs. this device's own first reading, classified stable / degrading / replace
- **SOH% (State of Health)** — absolute quality vs. a manufacturer-rated new battery: `SOH = (R_eol − R_int) / (R_eol − R_new) × 100`, where R_eol defaults to 2×R_new per IEEE 1188. Shown as a color-coded radial gauge with a formula breakdown on demand, editable per device.
- Real-time toast notifications when a device uploads a new reading

## Getting started

### Dashboard (local, Docker — recommended)

```bash
cd dashboard
./run.sh
```

Spins up Postgres + a Neon wire-protocol proxy (so the real `@neondatabase/serverless` driver works unmodified against local Postgres) + the app, at **http://localhost:3010**. `db/schema.sql` auto-applies on first run only — see [dashboard/db/schema.sql](dashboard/db/schema.sql) if you need to apply schema changes to an already-provisioned volume (`docker compose exec -T postgres psql -U dashboard -d dashboard < db/schema.sql`).

### Dashboard (local, no Docker)

```bash
cd dashboard
npm install
cp .env.example .env   # fill in DATABASE_URL (a real Neon/Postgres instance) and JWT_SECRET
npm run dev             # Vite dev server
```

### Tests

```bash
cd dashboard
npm test              # Vitest — unit tests for API handlers + lib/
npm run test:e2e       # Playwright — full app in a real browser, /api/* mocked
npm run lint
```

### Firmware

Open `IoT_Project.ino` in the Arduino IDE / PlatformIO with the ESP32 board package. Set `ssid`, `password`, and `deviceToken` (generated once from the dashboard's "add device" flow) before flashing.

## Deployment

The dashboard deploys to **Vercel** via Git integration — push to `main` auto-builds the frontend and `/api` functions. Requires `DATABASE_URL` (Neon Postgres) and `JWT_SECRET` set as Vercel environment variables. Schema changes must be applied manually to the production database (`db/schema.sql` is a one-time script, no migration runner).

## Stack

ESP32 (Arduino) · ADS1115 · ACS758 · React + Vite + TypeScript · Vercel serverless functions · Neon Postgres · Vitest · Playwright
