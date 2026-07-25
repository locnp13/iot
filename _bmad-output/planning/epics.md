---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning/prd.md
  - _bmad-output/planning/architecture.md
status: 'complete'
completedAt: '2026-07-18'
---

# IoT Battery Internal Resistance Monitoring System - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the IoT Battery Internal Resistance Monitoring System, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Device**
- FR1: The device shall measure resting voltage before applying any test load.
- FR2: The device shall apply a fixed-duration (3s) load via relay and sample voltage and current throughout at high frequency (~50 samples/sec).
- FR3: The device shall compute internal resistance from the voltage drop and peak current observed during the load period.
- FR4: The device shall persist a measurement cycle counter across power loss (flash-backed), independent of Wi-Fi availability.
- FR5: The device shall persist the full reading payload (not just the counter) when upload fails, and attempt to upload it on a subsequent wake.
- FR6: The device shall authenticate to the backend using a per-device token over HTTPS, not plaintext credentials.
- FR7: The device shall enter deep sleep between measurements and wake only on button press.

**Backend**
- FR8: The system shall support user registration and login, issuing a session (JWT) on successful login.
- FR9: The system shall allow a logged-in user to register a new device, generating a unique API token shown only once at creation time.
- FR10: The system shall accept measurement readings authenticated by a valid device token and associate them with that device's owning user.
- FR11: The system shall expose an endpoint for a logged-in user to retrieve reading history only for devices they own.
- FR12: The system shall allow a user to revoke/regenerate a device's token.

**Frontend**
- FR13: The dashboard shall provide login and registration pages.
- FR14: The dashboard shall list the logged-in user's devices with an option to add a new device.
- FR15: The dashboard shall display a device's reading history as both a chart (Rint over time) and a table (cycle, v_rest, delta_v, i_max, r_int, timestamp).
- FR16: The system shall treat a device's first recorded reading as that battery's baseline Rint.
- FR17: The dashboard shall show each subsequent reading's percentage change in Rint relative to the device's baseline.
- FR18: The dashboard shall classify a device's current health status (e.g., stable / degrading / replace) based on how far its latest Rint has drifted from baseline against a configurable threshold.

**Battery Quality Assessment (SOH)**
- FR19: The system shall allow a user to specify a battery's rated new internal resistance (R_new) when registering a device, defaulting to a standard 12V motorcycle battery value (0.015Ω) if not provided.
- FR20: The system shall derive the end-of-life internal resistance (R_EOL) as 200% of R_new per IEEE 1188, unless the user explicitly overrides it.
- FR21: The system shall compute an absolute State of Health percentage (SOH%) from each reading's Rint using SOH = (R_EOL − R_int) / (R_EOL − R_new) × 100, clamped to [0, 100].
- FR22: The dashboard shall display the computed SOH% for each device's latest reading, alongside the existing baseline-drift status.
- FR23: The dashboard shall allow a user to edit a device's R_new (and, optionally, R_EOL) after creation.

### NonFunctional Requirements

- NFR1 (Power): The full measure-compute-upload cycle must stay within a bounded time budget (target ≤15s: 3s load + up to 4s Wi-Fi wait + 5s cooldown) to limit battery drain per test.
- NFR2 (Security): All device-to-backend and dashboard-to-backend traffic must use HTTPS; no credentials transmitted in plaintext request bodies.
- NFR3 (Data isolation): A user must never be able to read another user's device tokens or readings.
- NFR4 (Hosting cost): Backend and database must run within Vercel's and the database provider's free tiers (serverless functions + free-tier Postgres, e.g. Neon) — no assumption of a persistent local filesystem for storage.
- NFR5 (Availability): Best-effort availability is acceptable; no formal SLA, given internal-only usage.

### Additional Requirements

From Architecture (`architecture.md`):

- **Starter Template (Epic 1 Story 1):** `npm create vite@latest dashboard -- --template react-ts` for the frontend; Vercel's native `/api` directory convention for backend functions (no CLI scaffold needed); `npm install @neondatabase/serverless` for the DB driver.
- **Database schema:** `users(id, email, password_hash, created_at)`, `devices(id, user_id, name, token_hash, created_at)`, `readings(id, device_id, cycle, v_rest, delta_v, i_max, r_int, created_at, UNIQUE(device_id, cycle))` — unique constraint required for retry-safe ingest (supports FR5).
- **Auth implementation:** argon2id password hashing, `jsonwebtoken@9.0.3` issued as httpOnly cookie, device tokens stored hashed (never plaintext).
- **Authorization requirement:** every route scoped to a specific device must call a `requireDeviceOwnership(deviceId, userId)` check in addition to `requireAuth()` — authentication alone is not sufficient (supports NFR3).
- **Ingest idempotency:** insert readings with `ON CONFLICT (device_id, cycle) DO NOTHING` so firmware retries of an already-uploaded cycle never duplicate (supports FR5).
- **Baseline definition:** a device's baseline is the reading with the lowest `cycle` number, not the first-inserted row (supports FR16 correctness under retry conditions).
- **Baseline/health computation location:** computed server-side in `lib/health.ts`, exposed via the reading-history endpoint — frontend only renders it (supports FR16-18).
- **SOH formula (paper-aligned):** SOH% = (R_EOL − R_int) / (R_EOL − R_new) × 100, with R_EOL defaulting to 2×R_new per IEEE 1188 unless overridden. Computed alongside — not replacing — the existing baseline-drift status: baseline-drift measures a battery's decay relative to *its own* first reading, while SOH measures absolute condition relative to a *manufacturer-rated new battery*. Both use the same `r_int` samples but answer different questions (supports FR19-22).
- **DB↔API naming boundary:** snake_case DB rows must be mapped to camelCase JSON exclusively inside `lib/db.ts` — no route handler does this conversion inline.
- **Shared auth helpers:** `requireAuth()`, `requireDeviceToken()`, `requireDeviceOwnership()` in `lib/auth.ts` — every protected route must use these rather than re-implementing checks.
- **Deployment:** Vercel Git integration — push to GitHub `main` auto-builds and deploys both the frontend and `/api` functions; env vars (`DATABASE_URL`, `JWT_SECRET`) set via Vercel dashboard.
- **No test suite in MVP scope** (deliberately deferred per Architecture step 3/5 decisions).

### UX Design Requirements

No UX Design document exists for this project (not required — internal, low-complexity dashboard). No UX-DRs to extract.

### FR Coverage Map

FR1: Epic 2 - Device measures resting voltage
FR2: Epic 2 - Device applies load and samples voltage/current
FR3: Epic 2 - Device computes internal resistance
FR4: Epic 2 - Device persists cycle counter across power loss
FR5: Epic 2 - Device persists full reading and retries failed uploads
FR6: Epic 2 - Device authenticates via per-device token over HTTPS
FR7: Epic 2 - Device deep sleeps between measurements
FR8: Epic 1 - User registration and login (JWT session)
FR9: Epic 1 - User registers a new device, gets one-time token
FR10: Epic 2 - Backend accepts authenticated readings, associates with owner
FR11: Epic 3 - Backend exposes reading history scoped to owner
FR12: Epic 1 - User revokes/regenerates a device's token
FR13: Epic 1 - Dashboard login/register pages
FR14: Epic 1 - Dashboard device list with add-device flow
FR15: Epic 3 - Dashboard reading history chart + table
FR16: Epic 3 - Baseline Rint = device's lowest-cycle reading
FR17: Epic 3 - Dashboard shows % change vs baseline
FR18: Epic 3 - Dashboard shows health status classification
FR19: Epic 4 - User sets R_new when registering a device
FR20: Epic 4 - System derives R_EOL from R_new per IEEE 1188
FR21: Epic 4 - System computes absolute SOH% from Rint
FR22: Epic 4 - Dashboard displays SOH%
FR23: Epic 4 - User edits R_new/R_EOL after creation

## Epic List

### Epic 1: Quản lý Tài khoản & Thiết bị
Người dùng có thể đăng ký/đăng nhập, thêm thiết bị mới (nhận token 1 lần), xem danh sách thiết bị của mình, và thu hồi/tạo lại token khi cần.
**FRs covered:** FR8, FR9, FR12, FR13, FR14

### Epic 2: Đo & Tải Dữ liệu Pin Tự động
Thiết bị (đã đăng ký ở Epic 1) đo Rint, xác thực bằng token, và tải dữ liệu lên đáng tin cậy — kể cả khi mất mạng thì vẫn lưu lại và thử lại sau.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR10

### Epic 3: Dashboard Đánh giá Sức khỏe Pin
Người dùng xem được lịch sử đo của từng thiết bị, kèm % thay đổi so với baseline và trạng thái sức khỏe (stable/degrading/replace).
**FRs covered:** FR11, FR15, FR16, FR17, FR18

### Epic 4: Đánh giá Chất lượng Pin theo Chuẩn SOH
Bên cạnh % lệch so với baseline tự thân của thiết bị (Epic 3), hệ thống tính thêm SOH% tuyệt đối — so nội trở hiện tại với nội trở chuẩn khi ắc quy còn mới (R_new) và ngưỡng hết vòng đời (R_EOL = 200% R_new theo IEEE 1188). Đây là chỉ số "chất lượng pin" thực sự như mô tả trong bài báo nghiên cứu, độc lập với lịch sử đo riêng của từng thiết bị.
**FRs covered:** FR19, FR20, FR21, FR22, FR23

## Epic 1: Quản lý Tài khoản & Thiết bị

Người dùng có thể đăng ký/đăng nhập, thêm thiết bị mới (nhận token 1 lần), xem danh sách thiết bị của mình, và thu hồi/tạo lại token khi cần.

### Story 1.1: Khởi tạo Project từ Starter Template

As a developer,
I want the project scaffolded from the chosen starter template (Vite react-ts frontend, Vercel `/api` convention, Neon connection),
So that all subsequent stories build on a working, deployed foundation.

**Acceptance Criteria:**

**Given** no project exists yet
**When** I run `npm create vite@latest dashboard -- --template react-ts` and install dependencies
**Then** a working frontend project exists with `npm run dev` launching successfully

**Given** the Vite project
**When** I initialize an empty `/api` directory with `vercel.json` config
**Then** `vercel dev` runs both frontend and a placeholder API function locally

**Given** Neon Postgres is provisioned via Vercel Marketplace
**When** I install `@neondatabase/serverless` and configure `DATABASE_URL`
**Then** a test query against the DB succeeds from a local script

**Given** the scaffold is complete
**When** I push to GitHub `main`
**Then** Vercel's Git integration auto-deploys successfully

### Story 1.2: Đăng ký tài khoản

As an operator,
I want to create an account with email + password,
So that I can securely access my own devices later.

**Acceptance Criteria:**

**Given** the project scaffold from Story 1.1
**When** this story begins
**Then** the `users` table (id, email, password_hash, created_at) is created via `db/schema.sql`

**Given** no account exists with a given email
**When** I submit registration with a valid email and password
**Then** a new user is created with an argon2id-hashed password and I'm redirected to login

**Given** an email already registered
**When** I try to register again with the same email
**Then** I receive a clear "email already in use" error and no duplicate is created

**Given** a password shorter than the minimum length
**When** I try to register
**Then** I receive a validation error and no account is created

### Story 1.3: Đăng nhập / Đăng xuất

As an operator,
I want to log in and out of my account,
So that I can securely access my devices and end my session when done.

**Acceptance Criteria:**

**Given** a registered account
**When** I submit correct email/password
**Then** I receive a JWT set as an httpOnly cookie and I'm redirected to the device list

**Given** wrong password
**When** I submit login
**Then** I receive a generic "invalid credentials" error (not revealing which field was wrong), and no cookie is set

**Given** I'm already logged in
**When** I visit the login page
**Then** I'm redirected straight to the device list

**Given** I'm logged in
**When** I click logout
**Then** my session cookie is cleared and I'm redirected to login

### Story 1.4: Thêm thiết bị mới

As an operator,
I want to register a new device under my account,
So that I get a token I can embed in that device's firmware.

**Acceptance Criteria:**

**Given** the `users` table exists from Story 1.2
**When** this story begins
**Then** the `devices` table (id, user_id, name, token_hash, created_at) is created via `db/schema.sql`

**Given** I'm logged in
**When** I submit a device name and confirm creation
**Then** a device row is created with `user_id` = my account, a random token is generated, and the plaintext token is shown to me exactly once

**Given** I've just created a device
**When** I refresh or revisit the device list
**Then** the plaintext token is no longer retrievable anywhere (only its hash exists server-side)

**Given** I'm not logged in
**When** I call the create-device endpoint directly
**Then** I receive a 401 and no device is created

### Story 1.5: Xem danh sách thiết bị

As an operator,
I want to see all devices I own,
So that I know what I've registered and can navigate to each one.

**Acceptance Criteria:**

**Given** I own 2 devices
**When** I visit the device list page
**Then** I see both listed by name, with no other user's devices visible

**Given** I own zero devices
**When** I visit the device list page
**Then** I see an empty state prompting me to add my first device

### Story 1.6: Thu hồi/tạo lại token thiết bị

As an operator,
I want to revoke and regenerate a device's token,
So that I can recover from a leaked or lost token without losing the device's history.

**Acceptance Criteria:**

**Given** I own a device
**When** I click "regenerate token"
**Then** a new random token is generated, the old token immediately stops authenticating, and the new plaintext token is shown once

**Given** a device whose token was just regenerated
**When** the physical device tries to upload using its old firmware-embedded token
**Then** the request is rejected with 401 until firmware is updated

**Given** I try to regenerate a token for a device I don't own
**When** I call the endpoint directly with another device's ID
**Then** I receive a 403 (`requireDeviceOwnership` enforced)

## Epic 2: Đo & Tải Dữ liệu Pin Tự động

Thiết bị (đã đăng ký ở Epic 1) đo Rint, xác thực bằng token, và tải dữ liệu lên đáng tin cậy — kể cả khi mất mạng thì vẫn lưu lại và thử lại sau.

### Story 2.1: Endpoint nhận dữ liệu có xác thực (Backend)

As a device,
I want to submit a measurement reading authenticated by my device token,
So that my readings are securely and correctly attributed to my owner.

**Acceptance Criteria:**

**Given** the `devices` table exists from Epic 1
**When** this story begins
**Then** the `readings` table (id, device_id, cycle, v_rest, delta_v, i_max, r_int, created_at, `UNIQUE(device_id, cycle)`) is created via `db/schema.sql`

**Given** a valid device token
**When** `POST /api/readings` is called with reading data
**Then** a row is inserted into `readings` associated with the correct `device_id`/`user_id`, and success is returned

**Given** an invalid or unknown token
**When** `POST /api/readings` is called
**Then** 401 is returned and nothing is inserted

**Given** a reading with a `cycle` number that already exists for that device (a retry)
**When** `POST /api/readings` is called again with the same cycle
**Then** no duplicate row is created (`ON CONFLICT DO NOTHING`) and the endpoint still returns success

### Story 2.2: Chu trình đo & tính Rint tự động

As an operator,
I want the device to automatically measure resting voltage, apply a load, compute internal resistance, and return to deep sleep when I press the button,
So that I get an accurate Rint reading without manual calculation, and the device conserves battery between tests.

**Acceptance Criteria:**

**Given** the device is in deep sleep
**When** I press the button
**Then** it wakes, measures resting voltage, closes the relay for exactly 3 seconds while sampling voltage/current at ~50Hz, then opens the relay

**Given** the load test completed
**When** the device computes results
**Then** Rint is derived from `(v_rest - v_min) / i_max` correctly

**Given** the measurement and upload attempt are done
**When** the cooldown period ends
**Then** the device re-enters deep sleep and only wakes again on the next button press

### Story 2.3: Đếm chu kỳ đo bền vững qua mất nguồn

As an operator,
I want the device's measurement count to survive a full power loss,
So that historical cycle numbering stays consistent even if the device is unplugged.

**Acceptance Criteria:**

**Given** the device has recorded N cycles
**When** power is fully removed and restored
**Then** the next measurement continues from cycle N+1, not resetting to 1

### Story 2.4: Tải dữ liệu an toàn — HTTPS, token, và tự retry khi mất mạng

As an operator,
I want the device to authenticate securely over HTTPS and automatically retry a failed upload on the next cycle,
So that no reading is lost to a temporary Wi-Fi outage, and no credentials are exposed in plaintext.

**Acceptance Criteria:**

**Given** the device has a token embedded
**When** it uploads a reading
**Then** it sends the request over HTTPS with an `Authorization: Bearer <token>` header — no username/password anywhere in the payload

**Given** Wi-Fi is unavailable after a measurement
**When** the upload fails
**Then** the full reading (not just the cycle counter) is persisted to flash

**Given** a previously failed reading is stored locally
**When** the device next wakes with a successful Wi-Fi connection
**Then** it uploads the pending reading before/alongside the new one, then clears it from local storage so it's never uploaded twice

## Epic 3: Dashboard Đánh giá Sức khỏe Pin

Người dùng xem được lịch sử đo của từng thiết bị, kèm % thay đổi so với baseline và trạng thái sức khỏe (stable/degrading/replace) — đây chính là giá trị cốt lõi thực sự của sản phẩm.

### Story 3.1: Endpoint lịch sử đo kèm baseline & health status (Backend)

As an operator,
I want to retrieve a device's full reading history with baseline comparison and health status pre-computed,
So that I don't have to do the math myself.

**Acceptance Criteria:**

**Given** I own a device with readings
**When** I call `GET /api/devices/:id/readings`
**Then** I receive all readings ordered by cycle, each including its raw values plus `% change vs baseline` and a computed `status`

**Given** a device with only one reading
**When** I call this endpoint
**Then** that reading is treated as baseline (0% change, status "stable")

**Given** I don't own the device
**When** I call this endpoint with another user's device id
**Then** I receive 403 (`requireDeviceOwnership` enforced)

### Story 3.2: Bảng & biểu đồ lịch sử đo (Frontend)

As an operator,
I want to see a device's reading history as both a table and a chart,
So that I can review raw data and spot trends visually.

**Acceptance Criteria:**

**Given** a device with multiple readings
**When** I open its detail page
**Then** I see a chart of Rint over time and a table with cycle, v_rest, delta_v, i_max, r_int, timestamp

**Given** a device with zero readings
**When** I open its detail page
**Then** I see an empty state indicating no data yet

### Story 3.3: Hiển thị trạng thái sức khỏe pin (Frontend)

As an operator,
I want to see each battery's health status and % drift from baseline directly on the dashboard,
So that I can judge at a glance whether it needs replacing.

**Acceptance Criteria:**

**Given** the backend returns a computed status per reading
**When** I view a device's detail page
**Then** the latest reading's status (stable/degrading/replace) is shown prominently (e.g. a badge)

**Given** a reading's % change vs baseline
**When** displayed in the table
**Then** it's shown alongside the raw Rint value for each row

## Epic 4: Đánh giá Chất lượng Pin theo Chuẩn SOH

Bên cạnh % lệch so với baseline tự thân của thiết bị (Epic 3), hệ thống tính thêm SOH% tuyệt đối — so nội trở hiện tại với nội trở chuẩn khi ắc quy còn mới (R_new) và ngưỡng hết vòng đời (R_EOL). Baseline-drift trả lời "ắc quy này đã tệ đi bao nhiêu so với chính nó lúc mới lắp", còn SOH trả lời "so với một ắc quy mới tinh theo chuẩn nhà sản xuất, ắc quy này còn tốt bao nhiêu phần trăm" — hai câu hỏi khác nhau, cùng tồn tại song song, không thay thế nhau.

### Story 4.1: Lưu R_new/R_EOL theo từng thiết bị (Backend)

As an operator,
I want to specify my battery's rated new-condition internal resistance (R_new) when I register a device,
So that the system can assess absolute battery quality, not just drift from its own first reading.

**Acceptance Criteria:**

**Given** the `devices` table exists from Epic 1
**When** this story begins
**Then** `devices` gains nullable columns `r_new` and `r_eol` (REAL) via `db/schema.sql`

**Given** I'm creating a device
**When** I don't provide an R_new value
**Then** the device is created with the standard default `r_new = 0.015` (Ω, per a typical 12V motorcycle battery)

**Given** I'm creating a device with a custom R_new
**When** I don't also provide an R_EOL
**Then** `r_eol` is stored as `2 × r_new` (IEEE 1188 default), computed server-side — not left null

**Given** I provide both R_new and R_EOL explicitly
**When** the device is created
**Then** both values are stored exactly as given, with no server-side override

### Story 4.2: Tính SOH% tuyệt đối (Backend)

As an operator,
I want each reading's SOH% computed from R_new and R_EOL,
So that I see an absolute quality figure, not just a relative drift percentage.

**Acceptance Criteria:**

**Given** a device with `r_new` and `r_eol` set and a reading with a given `r_int`
**When** `computeHealth`-equivalent logic runs in `lib/health.ts`
**Then** `soh = clamp(((r_eol - r_int) / (r_eol - r_new)) * 100, 0, 100)` is returned alongside the existing `percentChangeFromBaseline` and `status` fields

**Given** `r_int` is at or below `r_new`
**When** SOH is computed
**Then** SOH is clamped to 100 (never exceeds it)

**Given** `r_int` is at or above `r_eol`
**When** SOH is computed
**Then** SOH is clamped to 0 (never negative)

**Given** `GET /api/devices/:id/readings` is called for a device with R_new/R_EOL configured
**When** the response is returned
**Then** each reading includes its `soh` value alongside the existing baseline-drift fields

### Story 4.3: Hiển thị SOH% trên Dashboard (Frontend)

As an operator,
I want to see each battery's SOH% and edit its rated R_new,
So that I can judge absolute battery quality at a glance and correct the rated value if it was wrong at registration.

**Acceptance Criteria:**

**Given** a device with a computed SOH value
**When** I view its detail page
**Then** the latest reading's SOH% is shown prominently (e.g. next to the existing stable/degrading/replace badge), distinct from the baseline-drift percentage

**Given** I own a device
**When** I open its settings/edit view
**Then** I can update `r_new` (and optionally `r_eol`), and the change is reflected in SOH for all readings on next view (recomputed, not stored per-reading)

**Given** I try to edit R_new/R_EOL for a device I don't own
**When** I call the update endpoint directly
**Then** I receive a 403 (`requireDeviceOwnership` enforced)
