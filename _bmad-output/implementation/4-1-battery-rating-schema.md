# Story 4.1: Battery Rating Schema (R_new / R_EOL per device)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want to specify my battery's rated new-condition internal resistance (R_new) when I register a device,
so that the system can later assess absolute battery quality (SOH%), not just drift from the device's own first reading.

## Acceptance Criteria

1. `devices` table gains nullable columns `r_new` and `r_eol` (REAL), added via an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `db/schema.sql` (the existing `CREATE TABLE IF NOT EXISTS devices` block will NOT retroactively add columns to an already-provisioned database — see Dev Notes).
2. `POST /api/devices` (create device) accepts optional `rNew` and `rEol` fields in the request body.
3. If `rNew` is omitted, the device is created with `r_new = 0.015` (Ω) — the standard default for a 12V motorcycle battery, per the source paper.
4. If `rNew` is provided but `rEol` is omitted, `r_eol` is computed server-side as `2 × rNew` (IEEE 1188 default) and stored — never left null when `rNew` is known.
5. If both `rNew` and `rEol` are provided explicitly, both are stored exactly as given, with no server-side override.
6. `rNew`/`rEol`, when provided, must be positive numbers; invalid values return `400` and create no device (mirrors the existing empty-name validation in `POST /api/devices`).
7. `Device` type and `GET /api/devices` response shape include `rNew`/`rEol` so Story 4.2/4.3 can consume them without another schema round-trip.

## Tasks / Subtasks

- [x] Task 1: Schema migration (AC: #1)
  - [x] In `dashboard/db/schema.sql`, add `r_new REAL` and `r_eol REAL` to the `devices` `CREATE TABLE IF NOT EXISTS` block (for fresh installs).
  - [x] Immediately below it, add `ALTER TABLE devices ADD COLUMN IF NOT EXISTS r_new REAL;` and `ALTER TABLE devices ADD COLUMN IF NOT EXISTS r_eol REAL;` (for the already-provisioned dev/prod database — this project uses "one-time manual SQL script" migrations per `architecture.md`, no ORM, so both statements must coexist).
- [x] Task 2: `lib/db.ts` — types and mapping (AC: #1, #7)
  - [x] Add `rNew: number | null` and `rEol: number | null` to the `Device` interface.
  - [x] Update `mapDevice()` to read `row.r_new` / `row.r_eol` (snake_case DB → camelCase API boundary — this mapping happens ONLY in `lib/db.ts`, per `architecture.md` naming rules).
- [x] Task 3: `lib/db.ts` — `createDevice` signature (AC: #3, #4, #5)
  - [x] Change `createDevice(userId, name, tokenHash)` to `createDevice(userId, name, tokenHash, rNew?: number, rEol?: number)`.
  - [x] Apply defaulting logic BEFORE the INSERT: `const finalRNew = rNew ?? 0.015; const finalREol = rEol ?? finalRNew * 2;` — always insert concrete values, never rely on a DB-side default.
  - [x] Update the `INSERT INTO devices (...)` statement to include `r_new`, `r_eol`.
- [x] Task 4: `api/devices/index.ts` — POST handler (AC: #2, #3, #4, #5, #6, #7)
  - [x] Parse optional `rNew`/`rEol` from `req.body`, alongside the existing `name` parsing.
  - [x] Validate: if present, must be `typeof === 'number'` and `> 0`; else `400 { error: ... }` (match the existing style of the empty-name 400 check just above it).
  - [x] Pass `rNew`/`rEol` through to `createDevice(...)`.
  - [x] Add `rNew`/`rEol` to the 201 response body (alongside the existing `id, name, createdAt, status, latestReading, token` fields).
- [x] Task 5: `api/devices/index.ts` — GET handler (AC: #7)
  - [x] Add `rNew`/`rEol` to each device object in the `withStatus` array (the `.map` block that currently returns `{ id, name, createdAt, status, latestReading }`).
- [x] Task 6: Unit tests (AC: all)
  - [x] `dashboard/test/unit/db.test.ts`: extend/add cases for `createDevice` defaulting. This file mocks the DB client itself, not `lib/db.ts`: `const sqlMock = vi.hoisted(() => vi.fn()); vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlMock }));`, then `sqlMock.mockResolvedValueOnce([...row])` to control what the next query call returns, and asserts on the mapped return value of the real (unmocked) `db.createDevice(...)` call — it does NOT assert on the SQL text passed to `sqlMock`. Add cases: no `rNew`/`rEol` args → returned device still maps correctly (defaulting happens before the INSERT, so it doesn't change this test's shape, but add a case calling `db.createDevice(9, 'Bench 1', 'th')` with no rNew/rEol and confirming it doesn't throw); a case passing `rNew` explicitly and confirming `sqlMock` was called (via `sqlMock.mock.calls[0]`) with the computed `r_eol = 2×rNew` value in the query values.
  - [x] `dashboard/test/unit/devices.test.ts`: extend the `POST /api/devices` `describe` block — reuse the existing `dbMock`/`authMock` pattern (`vi.hoisted`, `vi.mock('../../lib/db', ...)`). Add cases: omits rNew/rEol → device created with defaults; provides rNew only → rEol computed and passed to `dbMock.createDevice`; provides invalid `rNew` (e.g. `-1`, `"abc"`) → `400`, `dbMock.createDevice` NOT called.

## Dev Notes

- **Why an ALTER TABLE, not just editing CREATE TABLE:** this project's migration approach is "one-time manual SQL script at setup" (`architecture.md` line ~134) — there is no migration runner. `CREATE TABLE IF NOT EXISTS` is a no-op against a table that already exists, so it will NOT add the new columns to whatever database is already running from Epic 1–3. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements are what actually apply the change; keep both statements in `schema.sql` (CREATE for fresh installs, ALTER for existing ones) since there's no tooling here to distinguish "fresh" vs "existing" at apply time.
- **Where the snake_case↔camelCase mapping is allowed to live:** ONLY `lib/db.ts` (`mapDevice`). Do not add `row.r_new` reads anywhere in `api/*.ts` — route handlers only ever see the already-mapped `Device` object.
- **Follow the existing `createDevice` call site pattern:** `api/devices/index.ts` currently calls `createDevice(userId, name, hashToken(token))` — this becomes a 5-arg call. `token` generation (`generateDeviceToken()`) and `tokenHash` are unrelated to this story; do not touch that logic.
- **Validation style to match:** see the existing `if (!name) { res.status(400).json({ error: 'Device name is required' }); return; }` block in `api/devices/index.ts` — mirror this exact shape/tone for the new `rNew`/`rEol` checks, don't introduce a validation library (project explicitly avoids one per `architecture.md` "Validation" pattern).
- **Do NOT touch `POST /api/readings` or `lib/health.ts` in this story** — Story 4.2 computes SOH from these fields; this story only stores them.
- **Do NOT add an edit/PATCH endpoint in this story** — that's Story 4.3's `AC: given I try to edit R_new/R_EOL for a device I don't own → 403`. This story only covers creation-time rating.

### Project Structure Notes

- Files touched: `dashboard/db/schema.sql`, `dashboard/lib/db.ts`, `dashboard/api/devices/index.ts`, `dashboard/test/unit/db.test.ts`, `dashboard/test/unit/devices.test.ts`. No new files.
- No conflicts with existing structure — this is additive to existing tables/handlers, consistent with `architecture.md`'s "one file per route" and "DB↔API boundary in lib/db.ts only" rules.

### References

- [Source: _bmad-output/planning/epics.md#Story 4.1] — story origin, full AC text (Given/When/Then form)
- [Source: _bmad-output/planning/architecture.md#Naming Patterns] — DB↔API mapping boundary rule
- [Source: _bmad-output/planning/architecture.md] — "Migration approach: one-time manual SQL script at setup"
- [Source: dashboard/lib/db.ts] — existing `createDevice`, `mapDevice`, `Device` interface to extend
- [Source: dashboard/api/devices/index.ts] — existing POST/GET handlers and validation style to mirror
- [Source: dashboard/test/unit/devices.test.ts] — existing mock pattern (`vi.hoisted`, `dbMock`, `authMock`) to extend, not replace

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `sqlMock.mock.calls[0]` initially picked up the wrong call (sqlMock isn't cleared between tests in `db.test.ts`, unlike `devices.test.ts`) — fixed by indexing the last call instead (`sqlMock.mock.calls[sqlMock.mock.calls.length - 1]`).
- `body.rNew`/`body.rEol` typed `unknown` on the request body couldn't be passed directly to `createDevice(number | undefined)` after a `typeof` guard — TS doesn't narrow object-property access reliably across statements here, so validated booleans are computed first, then cast to local `const rNew`/`rEol` variables.

### Completion Notes List

- Deliberately did NOT add `updateDeviceRating` to `lib/db.ts` in this story, even though Story 4.3 will need it — out of scope per this story's task list (Story 4.1 only covers device-creation-time rating).
- `computeHealth(readings)` call sites in `api/devices/index.ts` were left untouched (still 1-arg) — the signature change to accept a device's `rNew`/`rEol` is Story 4.2's responsibility.
- Full regression suite (76 tests, 8 files), `tsc -b`, and `oxlint` all pass clean; no new lint warnings introduced (2 pre-existing warnings in `api/auth/login.ts` / `test/unit/login.test.ts` are unrelated to this story).

### File List

- `dashboard/db/schema.sql` (modified)
- `dashboard/lib/db.ts` (modified)
- `dashboard/api/devices/index.ts` (modified)
- `dashboard/test/unit/db.test.ts` (modified)
- `dashboard/test/unit/devices.test.ts` (modified)
