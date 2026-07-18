---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
inputDocuments:
  - _bmad-output/planning/prd.md
workflowType: 'architecture'
project_name: 'IoT Battery Internal Resistance Monitoring System'
user_name: 'BMad'
date: '2026-07-18'
lastStep: 8
status: 'complete'
completedAt: '2026-07-18'
---
# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
18 FRs across three domains — Device firmware (FR1-7: measurement cycle, flash-backed retry, per-device token auth, deep sleep), Backend (FR8-12: user auth, device registration/token issuance, authenticated ingest, per-owner reads, token revocation), Frontend (FR13-18: login/register, device list, reading history chart/table, baseline comparison, health status classification).

**Non-Functional Requirements:**

- NFR1 (Power): bounded ~15s cycle time to limit battery drain
- NFR2 (Security): HTTPS everywhere, no plaintext credentials
- NFR3 (Data isolation): strict per-user data boundaries
- NFR4 (Hosting cost): serverless + free-tier DB only, no persistent local filesystem assumption
- NFR5 (Availability): best-effort, no formal SLA

**Scale & Complexity:**

- Primary domain: full-stack (embedded + serverless backend + SPA frontend)
- Complexity level: low
- Estimated architectural components: 3 (firmware, backend API, dashboard frontend) + 1 managed DB

### Technical Constraints & Dependencies

- Must run on Vercel free tier (serverless functions, no long-running processes, ephemeral/no local filesystem persistence)
- Database must be a managed free-tier option compatible with serverless (e.g. Vercel Postgres/Neon)
- Device is resource/power constrained (ESP32, deep sleep between cycles) — cannot run heavy crypto or maintain persistent connections
- Single device ↔ single battery mapping (confirmed) — no separate "battery" entity needed in data model

### Cross-Cutting Concerns Identified

- **Auth & data isolation:** two distinct auth mechanisms (per-device token for ingest, per-user JWT for dashboard) must both enforce strict ownership boundaries
- **Reliability of ingest:** offline-retry from firmware (FR5) requires the ingest endpoint to be idempotent/duplicate-safe
- **Baseline/health computation placement:** where FR16-18 logic lives (backend query-time vs frontend) affects API shape and is a decision to make explicitly

## Starter Template Evaluation

### Primary Technology Domain

Full-stack: SPA frontend + serverless backend functions + managed Postgres — based on project requirements (Vite+React frontend already chosen, Vercel hosting already chosen).

### Starter Options Considered

No single unified starter fits (user explicitly separated frontend from backend rather than a monolithic framework like Next.js). Composed from two zero-config primitives instead of a scaffolding tool:

- Frontend: Vite's official `react-ts` template
- Backend: Vercel's native `/api` directory convention (no framework, no starter needed — plain Node.js handler files)

### Selected Approach: Vite (react-ts) + Vercel `/api` functions + Neon Postgres

**Rationale for Selection:**
Matches the already-confirmed stack (React+Vite+Tailwind frontend, Vercel hosting, Postgres free tier) with the least moving parts — no meta-framework lock-in, each piece independently swappable later if needed.

**Initialization Commands:**

```bash
# Frontend
npm create vite@latest dashboard -- --template react-ts
cd dashboard && npm install

# Database driver (used inside /api functions)
npm install @neondatabase/serverless
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** TypeScript on both frontend (Vite) and backend (`/api/*.ts` Vercel Node.js functions)

**Styling Solution:** Tailwind CSS (added manually via `npm install -D tailwindcss` — not bundled by the Vite template by default)

**Build Tooling:** Vite for frontend bundling/dev server; Vercel's build system auto-builds `/api` functions, no separate bundler config needed

**Testing Framework:** ~~None included by default — to be added if/when needed~~ **Superseded 2026-07-18:** Vitest (unit — API handlers with mocked `lib/db`/`lib/auth`, plus `lib/health.ts` and `lib/db.ts` mapping logic directly) + Playwright (e2e — real browser driving the real React app, with `/api/*` responses mocked via route interception since no live database is available in this environment). See the new "Testing Strategy" section below for full rationale and coverage.

**Code Organization:** `/src` (frontend), `/api` (backend functions), `/lib` (shared DB client)

**Development Experience:** Vite dev server with HMR for frontend; `vercel dev` for local testing of `/api` functions against the same Neon DB

**Important correction from prior discussion:** `@vercel/postgres` is deprecated — Vercel migrated "Vercel Postgres" to Neon's native Marketplace integration. Use `@neondatabase/serverless` as the DB client instead.

**Note:** Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Database: Neon Postgres via `@neondatabase/serverless`
- Auth: argon2id password hashing + jsonwebtoken (httpOnly cookie) for users; hashed random token for devices
- Baseline/health computation lives in the backend, not the frontend

**Important Decisions (Shape Architecture):**

- REST API via Vercel `/api/*.ts` serverless functions, one file per endpoint
- Frontend: React Router + TanStack Query for server state, no Redux
- Deploy via Vercel's Git integration (auto-deploy on push to GitHub)

**Deferred Decisions (Post-MVP):**

- API rate limiting / versioning — not needed at internal-tool scale
- APM/observability beyond Vercel's built-in logs — revisit if usage grows

### Data Architecture

- **Database:** Neon Postgres (Vercel Marketplace integration), accessed via `@neondatabase/serverless`
- **Schema:**
  - `users(id, email UNIQUE, password_hash, created_at)`
  - `devices(id, user_id FK, name, token_hash, created_at)`
  - `readings(id, device_id FK, cycle, v_rest, delta_v, i_max, r_int, created_at, UNIQUE(device_id, cycle))`
- **Migration approach:** one-time manual SQL script at setup (schema is small and stable; no ORM/migration tool needed at this scale)
- **Duplicate-safe ingest:** `readings` has a unique constraint on `(device_id, cycle)`; inserts use `ON CONFLICT (device_id, cycle) DO NOTHING` so a firmware retry of an already-uploaded cycle never creates a duplicate row (resolves FR5's retry requirement safely).
- **Baseline/health computation:** done in the backend at query time — the reading-history endpoint returns each reading's `% change vs. baseline` and a computed `status` (stable/degrading/replace) alongside the raw values. Baseline = the device's reading with the **lowest `cycle` number** (not insertion order — a retried upload can be inserted later in real time than newer readings, so cycle number is the reliable ordering). Frontend only renders what the API returns; it does not compute health status itself.

### Authentication & Security

- **Password hashing:** `argon2` (argon2id variant) — 2026 best practice for new systems, memory-hard against brute force
- **User session:** `jsonwebtoken@9.0.3`, issued on login, stored as an httpOnly cookie (not localStorage, to reduce XSS exposure)
- **Device auth:** random 32-byte token generated at device registration, shown once, stored server-side as a hash (never plaintext) — device sends it as a bearer token on ingest requests
- **Authorization (ownership):** authentication (`requireAuth`) only confirms *who* is logged in — every route scoped to a specific device (`/api/devices/[id]/*`) must additionally call `requireDeviceOwnership(deviceId, userId)` to confirm the authenticated user actually owns that device, returning 403 otherwise. This is separate from and in addition to `requireAuth`.
- **Transport:** HTTPS enforced everywhere (Vercel default); no credentials in plaintext request bodies

### API & Communication Patterns

- **Style:** REST, JSON bodies, one Vercel serverless function per route under `/api`
- **Error format:** `{ "error": string }` with matching HTTP status (400 validation, 401 unauthenticated, 403 forbidden/not-owner, 404 not found, 500 unexpected)
- **No rate limiting or API versioning** — unnecessary at internal single-team scale; revisit only if usage pattern changes

### Frontend Architecture

- **Routing:** `react-router` (v7+)
- **State management:** `@tanstack/react-query` for server state (device list, reading history — handles caching/refetching); local component state via `useState` for UI-only concerns
- **Styling:** Tailwind CSS

### Infrastructure & Deployment

- **Hosting:** Vercel (frontend static build + `/api` serverless functions in the same project)
- **CI/CD:** Vercel's native Git integration — push to GitHub main branch triggers auto-deploy, no separate pipeline config needed
- **Environment config:** secrets (`DATABASE_URL`, `JWT_SECRET`) set via Vercel dashboard environment variables
- **Monitoring:** Vercel's built-in function logs; no separate APM at this scale

### Decision Impact Analysis

**Implementation Sequence:**

1. Provision Neon Postgres via Vercel Marketplace, run schema SQL
2. Build auth endpoints (register/login) with argon2 + JWT cookie
3. Build device registration endpoint (token issuance) and authenticated ingest endpoint
4. Build reading-history endpoint with baseline/% change/status computation
5. Scaffold frontend (Vite react-ts), wire up React Router + TanStack Query against the above endpoints
6. Update firmware: HTTPS + bearer device token + local persistence/retry on failed upload (per PRD FR5)

**Cross-Component Dependencies:**

- Firmware's auth header format must match exactly what the ingest endpoint expects (bearer token)
- Frontend's reading-history UI depends on the backend already returning computed `% change`/`status` — frontend work should not start until that endpoint contract is stable

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

6 potential conflict areas identified and resolved below (naming, structure, format, communication, process).

### Naming Patterns

**Database Naming Conventions:**

- Tables: plural snake_case (`users`, `devices`, `readings`)
- Columns: snake_case (`user_id`, `created_at`, `password_hash`)
- Foreign keys: `<referenced_table_singular>_id` (e.g. `user_id` on `devices`, `device_id` on `readings`)

**API Naming Conventions:**

- REST, plural nouns: `/api/devices`, `/api/devices/[id]/readings`
- Dynamic segments via Vercel file-based routing (`/api/devices/[id].ts`)

**Code Naming Conventions:**

- React components: PascalCase, file name matches component (`DeviceList.tsx`)
- Functions/variables: camelCase
- **DB ↔ API boundary:** DB rows are snake_case; a mapping layer in `/lib` converts to camelCase before any JSON response leaves the API. No snake_case ever reaches the frontend, no camelCase ever reaches SQL.

### Structure Patterns

**Project Organization:**

- `/api` — one file per route (Vercel serverless function convention)
- `/src/pages` — top-level pages (Login, DeviceList, DeviceDetail)
- `/src/components` — reusable UI components
- `/lib/db.ts` — shared DB client + query helpers (includes the snake_case→camelCase mapping)
- `/lib/auth.ts` — shared `requireAuth()` (JWT cookie check) and `requireDeviceToken()` (device bearer token check) helpers

**File Structure Patterns:**

- ~~No test suite in MVP scope~~ **Superseded 2026-07-18** (user requested full coverage across all 13 stories). Unit tests live in `test/unit/*.test.ts`; e2e tests live in `e2e/*.spec.ts`, co-located as originally planned.

### Format Patterns

**API Response Formats:**

- Success: return the resource directly, no `{data: ...}` envelope
- Error: `{ "error": string }` with matching HTTP status code (per step 4)

**Data Exchange Formats:**

- Dates: ISO 8601 strings (default serialization of Postgres `timestamptz`)
- JSON fields: camelCase only (see DB↔API boundary rule above)

### Communication Patterns

**Event System Patterns:**

- Not applicable — no pub/sub, no WebSocket/MQTT (confirmed earlier: not needed for this device's event-driven, low-frequency upload pattern)

**State Management Patterns:**

- Server state lives in TanStack Query; after a successful mutation (login, add device, regenerate token) invalidate the relevant query key to trigger refetch — never manually patch the cache

### Process Patterns

**Error Handling Patterns:**

- Every API route wraps its logic in try/catch and returns `{error}` + appropriate status code
- Frontend surfaces `isError`/`error` from TanStack Query through a shared error-display component

**Loading State Patterns:**

- Use TanStack Query's `isLoading` directly per section; no global loading spinner

**Validation:**

- Manual validation at the top of each API handler before any DB call — no schema validation library (kept minimal for this project's scale)

**Auth Flow:**

- Every protected API route calls the shared `requireAuth()` or `requireDeviceToken()` helper — never duplicates the check inline
- Every route scoped to a specific device additionally calls `requireDeviceOwnership(deviceId, userId)` — authentication alone does not imply authorization to access that device's data

### Enforcement Guidelines

**All AI Agents MUST:**

- Convert DB snake_case to API camelCase only inside `/lib/db.ts` mapping functions — never inline in route handlers
- Call `requireAuth()`/`requireDeviceToken()` rather than re-implementing auth checks
- Invalidate TanStack Query cache keys after mutations instead of manually editing cached data

**Pattern Enforcement:**

- Code review checks for inline snake_case leaking into API responses or components
- Any new route missing the shared auth helper is a defect, not a style preference

### Pattern Examples

**Good Examples:**

- `GET /api/devices/[id]/readings` → `{ error: "Not found" }`, 404
- Row `{ v_rest: 3.7, created_at: ... }` → mapped to `{ vRest: 3.7, createdAt: "2026-07-18T10:00:00Z" }` before response

**Anti-Patterns:**

- Returning `{ data: { v_rest: 3.7 } }` (wrong: envelope + snake_case leaked to frontend)
- A route reading the JWT cookie and verifying it inline instead of calling `requireAuth()`

## Project Structure & Boundaries

### Complete Project Directory Structure

```
iot-battery-dashboard/
├── README.md
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── vercel.json
├── .env.example
├── .gitignore
├── api/
│   ├── auth/
│   │   ├── register.ts
│   │   ├── login.ts
│   │   └── logout.ts
│   ├── devices/
│   │   ├── index.ts              (GET list, POST create)
│   │   └── [id]/
│   │       ├── index.ts          (DELETE device)
│   │       ├── regenerate-token.ts
│   │       └── readings.ts       (GET history — baseline/%change/status computed here)
│   └── readings.ts               (POST ingest, device-token auth — firmware calls this)
├── lib/
│   ├── db.ts                     (Neon client; snake_case→camelCase mapping lives here ONLY)
│   ├── auth.ts                   (requireAuth, requireDeviceToken, requireDeviceOwnership, argon2, jwt helpers)
│   └── health.ts                 (baseline % change + status calculation)
├── db/
│   └── schema.sql                (one-time manual migration script)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── DeviceList.tsx
│   │   └── DeviceDetail.tsx
│   ├── components/
│   │   ├── DeviceCard.tsx
│   │   ├── ReadingChart.tsx
│   │   ├── ReadingTable.tsx
│   │   ├── HealthBadge.tsx
│   │   └── ErrorMessage.tsx
│   ├── lib/
│   │   └── apiClient.ts          (fetch wrapper used by TanStack Query hooks)
│   └── styles/
│       └── index.css
└── public/
    └── favicon.ico
```

### Architectural Boundaries

**API Boundaries:**
`/api/*` is the sole entry point into the backend — the frontend never accesses the database directly.

**Component Boundaries:**
Pages own data-fetching (via TanStack Query hooks); presentational components (`DeviceCard`, `ReadingChart`, `ReadingTable`, `HealthBadge`) only receive props, they never fetch data themselves.

**Data Boundaries:**
Only `lib/db.ts` touches the DB client. Route handlers call functions exported from `lib/db.ts` / `lib/health.ts` — no inline SQL in route files.

### Requirements to Structure Mapping

**Feature/Epic Mapping:**

- FR1-7 (Device firmware): outside this repo (separate `.ino` firmware) — integrates solely via `POST /api/readings`
- FR8-12 (Backend — auth, device registration, ingest, reads, token revocation): `api/auth/*`, `api/devices/*`, `api/readings.ts`
- FR13-15 (Frontend — login/register, device list, reading history table/chart): `src/pages/*`, `src/components/DeviceCard.tsx`, `ReadingChart.tsx`, `ReadingTable.tsx`
- FR16-18 (Baseline comparison & health status): computed in `lib/health.ts`, exposed via `api/devices/[id]/readings.ts`, rendered by `HealthBadge.tsx`

**Cross-Cutting Concerns:**

- Authentication: `lib/auth.ts` (`requireAuth`, `requireDeviceToken`) used by every protected route
- DB naming mapping: `lib/db.ts` only

### Integration Points

**Internal Communication:**
Frontend calls `/api/*` through `src/lib/apiClient.ts`, wrapped by TanStack Query hooks per page.

**External Integrations:**
Only the ESP32 firmware, calling `POST /api/readings` with a bearer device token. No other third-party integrations.

**Data Flow:**
Device measures → `POST /api/readings` → `lib/db.ts` insert → dashboard requests `/api/devices/[id]/readings` → `lib/health.ts` computes baseline/%-change/status → `lib/db.ts` maps snake_case→camelCase → JSON response → TanStack Query cache → React components render.

### File Organization Patterns

**Configuration Files:** all at repo root (`vite.config.ts`, `tailwind.config.js`, `tsconfig.json`, `vercel.json`, `.env.example`)

**Source Organization:** backend split into `api/` (routes) and `lib/` (shared logic); frontend under `src/` (`pages/`, `components/`, `lib/`, `styles/`)

**Test Organization:** none in MVP scope (per step 3); if added later, co-locate as `*.test.ts`

**Asset Organization:** static assets under `public/`

### Development Workflow Integration

**Development Server Structure:**
`vercel dev` runs the Vite frontend and `/api` functions together locally, against the real Neon DB via env vars pulled with `vercel env pull`.

**Build Process Structure:**
Vercel auto-detects the Vite app for the static build and auto-builds each `/api/*.ts` file as its own serverless function — no separate bundler config needed.

**Deployment Structure:**
Push to the GitHub `main` branch triggers Vercel's Git integration to auto-build and deploy (per step 4's infrastructure decision).

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices are compatible — Vite/React frontend, Vercel serverless `/api` functions, Neon Postgres via `@neondatabase/serverless`, argon2 + jsonwebtoken for auth. No conflicting requirements between them; all fit within Vercel's free tier constraint (NFR4).

**Pattern Consistency:** Naming (snake_case DB / camelCase API), structure (`/api`, `/lib`, `/src`), and process patterns (shared `requireAuth`/`requireDeviceToken`/`requireDeviceOwnership` helpers) all align with the chosen stack and reinforce each other.

**Structure Alignment:** The project tree directly supports every pattern decided in step 5 (mapping layer isolated to `lib/db.ts`, auth helpers isolated to `lib/auth.ts`, no SQL outside `lib/`).

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

- FR1-7 (device firmware): outside this repo's architecture by design — integrates solely via `POST /api/readings`; FR5 (retry) and FR6 (device token) have corresponding backend support (unique constraint + `requireDeviceToken`)
- FR8-12 (backend): fully mapped to `api/auth/*`, `api/devices/*`, `api/readings.ts`
- FR13-18 (frontend, incl. baseline/health): fully mapped to `src/pages`, `src/components`, `lib/health.ts`

**Non-Functional Requirements Coverage:**

- NFR1 (power/time budget): firmware-side concern, not in conflict with backend design; cold-start latency risk noted below
- NFR2 (security/HTTPS): Vercel enforces HTTPS; no plaintext credentials in any flow
- NFR3 (data isolation): now fully covered after adding `requireDeviceOwnership` (previously a gap — see below)
- NFR4 (hosting free tier): Neon + Vercel serverless, no persistent local filesystem assumption anywhere in the design
- NFR5 (availability): best-effort accepted; no SLA-driving decisions required

### Gap Analysis Results

**Critical Gaps (found and resolved during this validation pass):**

1. Missing device-ownership authorization distinct from authentication → resolved by adding `requireDeviceOwnership(deviceId, userId)` to `lib/auth.ts`, required on all `/api/devices/[id]/*` routes
2. Ingest endpoint had no duplicate-safety for firmware retries → resolved with a `UNIQUE(device_id, cycle)` constraint on `readings` plus `ON CONFLICT DO NOTHING` on insert

**Important Gaps (found and resolved):**
3. Baseline definition was ambiguous under retry conditions (insertion order ≠ true chronological order) → resolved by defining baseline as the reading with the lowest `cycle` number, not the first-inserted row
4. Vercel cold-start latency could occasionally eat into the firmware's 4-second Wi-Fi upload window → accepted as a known, non-blocking risk given NFR5's best-effort availability target; no architectural change needed, just documented so it isn't mistaken for a bug later

**Nice-to-Have (not pursued, noted for awareness):**

- Schema validation library (e.g. zod) was considered and deliberately deferred (step 5) in favor of manual validation, matching the project's low-complexity scope

### Validation Issues Addressed

All four gaps above were resolved by updating the Data Architecture and Authentication & Security sections in place (unique constraint, `ON CONFLICT` upsert, `requireDeviceOwnership` helper, and the corrected baseline definition) rather than appending contradictory information — the document now reflects the final, consistent decisions.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [X] Project context thoroughly analyzed
- [X] Scale and complexity assessed
- [X] Technical constraints identified
- [X] Cross-cutting concerns mapped

**✅ Architectural Decisions**

- [X] Critical decisions documented with versions (argon2, jsonwebtoken@9.0.3, Neon/@neondatabase/serverless)
- [X] Technology stack fully specified
- [X] Integration patterns defined
- [X] Performance considerations addressed (cold-start risk documented, not ignored)

**✅ Implementation Patterns**

- [X] Naming conventions established
- [X] Structure patterns defined
- [X] Communication patterns specified
- [X] Process patterns documented (incl. authorization, not just authentication)

**✅ Project Structure**

- [X] Complete directory structure defined
- [X] Component boundaries established
- [X] Integration points mapped
- [X] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — small, well-bounded scope (internal tool, low complexity, single-tenant-per-device), all critical gaps resolved during validation rather than deferred.

**Key Strengths:**

- No meta-framework lock-in; each piece (Vite, Vercel functions, Neon) independently swappable later
- Clear, enforceable boundaries (single mapping layer, single auth helper set) that prevent the most likely inconsistencies
- Health/degradation logic (the PRD's actual deeper goal) has an explicit, unambiguous home in `lib/health.ts` with a retry-safe data model underneath it

**Areas for Future Enhancement:**

- Automatic alerting on degradation threshold (PRD Growth scope, not MVP)
- Schema validation library if the API surface grows beyond current scale
- Fleet management/OTA if multiple devices are added later

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
Scaffold the repo (`npm create vite@latest dashboard -- --template react-ts`), provision Neon Postgres via Vercel Marketplace, and run `db/schema.sql` (including the `UNIQUE(device_id, cycle)` constraint) — per the Decision Impact Analysis implementation sequence in Core Architectural Decisions.

## Testing Strategy (added 2026-07-18, post-implementation)

The original decision to ship the MVP with no test suite was superseded after implementation was complete — the user requested full coverage across all 13 stories. This section documents what was added and, importantly, its real limitation: **no live database was available in this environment**, so nothing here exercises a real Postgres connection end-to-end. Both layers were chosen specifically to test as much real code as possible without one.

### Unit tests (Vitest) — `test/unit/*.test.ts`

Runs the REAL handler/logic code, with only `lib/db.ts` (and `@neondatabase/serverless` itself, in `db.test.ts`) mocked via `vi.mock`:

- `health.test.ts` — `computeHealth`: baseline = lowest cycle (not insertion order), % change math, stable/degrading/replace thresholds, div-by-zero guard.
- `auth.test.ts` — password hashing round-trip (real argon2, not mocked), JWT session sign/verify, `requireAuth`/`requireDeviceToken`/`requireDeviceOwnership` authorization branches, `handleAuthError`.
- `db.test.ts` — snake_case (DB row) → camelCase (API) mapping correctness, with `neon()` stubbed to return canned rows.
- `register.test.ts`, `login.test.ts`, `logout-me.test.ts`, `devices.test.ts`, `readings.test.ts` — every API route handler, covering validation, auth/ownership rejection, the 409 unique-violation race, and the happy path — with `lib/db`/`lib/auth` mocked at the module boundary so the handler's own request/response logic is what's actually under test.

63 tests, all passing. Run with `npm test`.

### E2E tests (Playwright) — `e2e/*.spec.ts`

Drives the REAL React app in a REAL headless browser (real rendering, real client-side routing, real TanStack Query cache behavior) but mocks every `/api/*` response via `page.route()` interception, since there's no live backend to hit. This is a deliberate trade-off: it's genuine end-to-end coverage of the frontend, not of the full stack — the unit tests above are what cover the real backend logic.

- `auth.spec.ts` — unauthenticated redirect to `/login`, native form validation, register success/409-failure, login success/401-failure, already-logged-in redirect away from `/login`, logout.
- `devices.spec.ts` — empty state, device list rendering, add-device token-reveal-once modal.
- `device-detail.spec.ts` — empty state, chart + table + health badge rendering from backend-shaped data, regenerate-token modal.

14 tests, all passing. Run with `npm run test:e2e`.

**Known gotcha (fixed during this pass):** registering two `page.route()` handlers for the same URL pattern across different helper calls causes the later-registered handler's `route.continue()` to send non-matching-method requests straight to the network rather than falling through to the earlier handler — silently breaking the mock. Fixed by combining GET+POST into one handler per pattern (see `e2e/helpers.ts`).

### What this does NOT cover

- No test exercises a real Postgres/Neon connection — `lib/db.ts`'s actual SQL (as opposed to its mapping logic) is unverified against a real database. Recommended before going live: point `DATABASE_URL` at a real (or disposable branch) Neon database and re-run a smoke pass.
- No test covers the firmware (`IoT_Project.ino`) — that requires physical hardware or a wire-protocol simulator, out of scope for this web-stack test setup.
- E2E tests mock the network boundary, so they cannot catch a contract mismatch between the real backend's actual JSON shape and what the frontend expects — the unit tests' handler-level assertions are the closer check for that.
