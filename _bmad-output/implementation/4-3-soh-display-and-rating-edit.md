# Story 4.3: Display SOH% and Edit Battery Rating (Frontend + supporting endpoint)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want to see each battery's SOH% and edit its rated R_new,
so that I can judge absolute battery quality at a glance and correct the rated value if it was wrong at registration.

## Acceptance Criteria

1. On a device's detail page, the latest reading's `soh` is shown prominently (e.g. next to the existing stable/degrading/replace `HealthBadge`), visually distinct from the baseline-drift percentage.
2. If `soh` is `null` (device has no `rNew`/`rEol` — e.g. pre-Story-4.1 device), the UI shows a neutral "not rated" state instead of `null`, `NaN`, or a blank.
3. From the device detail page, an operator can open an edit view/modal and update `rNew` (and optionally `rEol`).
4. After a successful edit, SOH for all of that device's readings reflects the new rating on next view — recomputed server-side from stored `rInt` values, NOT stored per-reading (no reading rows are touched).
5. `PATCH /api/devices/:id` accepts `{ rNew, rEol? }`, requires device ownership (`requireDeviceOwnership`), and returns `403` for a caller who doesn't own the device — mirrors the existing `DELETE /api/devices/:id` ownership check in the same file.
6. Same validation as Story 4.1's create-time check: `rNew`/`rEol` must be positive numbers if provided; invalid → `400`, no update applied.

## Tasks / Subtasks

- [x] Task 1: Backend — `lib/db.ts` (AC: #4, #5, #6)
  - [x] Add `updateDeviceRating(deviceId: number, rNew: number, rEol?: number): Promise<void>` — apply the same defaulting rule as `createDevice` from Story 4.1 (`rEol ?? rNew * 2`), then `UPDATE devices SET r_new = ..., r_eol = ... WHERE id = ...`.
- [x] Task 2: Backend — `api/devices/[id]/index.ts` — add PATCH (AC: #5, #6)
  - [x] This file currently only handles `DELETE` (returns `405` for everything else). Add a `PATCH` branch alongside it — do not create a new route file; `architecture.md`'s "one file per route" means `[id]/index.ts` is already the route for a specific device by id, method-branching (like `api/devices/index.ts` already does for GET/POST).
  - [x] Reuse the exact same `deviceId` parsing / `Number.isInteger` check and `requireAuth` → `requireDeviceOwnership(deviceId, userId)` sequence already present in the `DELETE` branch — do not duplicate logic into a separate helper unless the file already has one.
  - [x] Validate `rNew` (required) and `rEol` (optional) as positive numbers — same style as Story 4.1's `POST /api/devices` validation. `400` on failure.
  - [x] Call `updateDeviceRating(deviceId, rNew, rEol)`, return `200 { ok: true }` (matches the `DELETE` handler's response shape).
- [x] Task 3: Frontend — `src/lib/apiClient.ts` (AC: #1, #2, #3, #4)
  - [x] Add `soh: number | null` to `ReadingWithHealth`.
  - [x] Add `rNew: number | null`, `rEol: number | null` to `Device` (and therefore `DeviceWithToken`, `DeviceLatestReading` if `soh` needs to appear there too — check whether the dashboard list view also needs SOH; if only the detail page needs it per AC #1, only extend `ReadingWithHealth`, not `DeviceLatestReading`).
  - [x] Add `updateDeviceRating: (deviceId: number, rNew: number, rEol?: number) => request<{ ok: true }>(\`/devices/${deviceId}\`, { method: 'PATCH', body: JSON.stringify({ rNew, rEol }) })` to the `api` object, following the exact call shape of the existing `regenerateToken`/`deleteDevice` entries.
- [x] Task 4: Frontend — SOH display (AC: #1, #2)
  - [x] In `src/pages/DeviceDetail.tsx`, next to the existing `{latest && <HealthBadge status={latest.status} />}` line, render the SOH value when `latest.soh !== null` (e.g. `SOH: {latest.soh.toFixed(0)}%`), and a "Not rated" indicator when `latest.soh === null`. Match existing badge/typography conventions in that file rather than introducing a new visual style — check `HealthBadge.tsx`'s STYLES/LABELS pattern for how status-driven color coding is done here, and follow the same approach for SOH if it needs status-like coloring (e.g. reuse the `success`/`warning`/`destructive` color tokens already used there).
- [x] Task 5: Frontend — edit rating modal (AC: #3)
  - [x] Create `src/components/EditRatingModal.tsx` following the exact structural pattern of `src/components/TokenRevealModal.tsx` (fixed inset-0 overlay, `max-w-md` card, header, body, footer buttons) — two numeric inputs (R_new required, R_eol optional with placeholder hint "defaults to 2× R_new"), Cancel + Save buttons.
  - [x] Wire it into `DeviceDetail.tsx` the same way `TokenRevealModal`/`ConfirmDialog` are wired: local `useState` for modal visibility, a `useMutation` calling `api.updateDeviceRating`, `onSuccess` invalidates the `['readings', deviceId]` query key (NOT `['devices']` — SOH is per-reading, recomputed from the `readings` endpoint) so the new SOH values are refetched per AC #4.
  - [x] Add an "Edit rating" trigger button near the existing "Regenerate token" / "Delete device" buttons in the detail page header.
- [x] Task 6: Unit tests — backend (AC: #5, #6)
  - [x] `dashboard/test/unit/devices.test.ts`: add a `PATCH /api/devices/[id]` describe block (sibling to the existing `DELETE /api/devices/[id]` one) — reuse `dbMock`/`authMock`. Cases: non-owner → `403`, `dbMock.updateDeviceRating` not called; invalid `rNew` → `400`; valid update → `dbMock.updateDeviceRating` called with correct args, `200 { ok: true }`.
- [x] Task 7: E2E test (AC: #1, #2, #3, #4)
  - [x] `dashboard/e2e/device-detail.spec.ts`: extend with a case that opens the edit modal, submits a new `rNew`, and asserts the displayed SOH value changes after save — mock the `/api/*` route responses per this file's existing interception pattern (check `e2e/helpers.ts` for the established mocking helper before writing new interception code).

## Dev Notes

- **Recomputed, not stored (AC #4) is the load-bearing constraint of this story.** `soh` must NEVER be written to the `readings` table. It's derived at read-time in `lib/health.ts` (Story 4.2) from whatever `rNew`/`rEol` the device currently has. Editing the rating therefore requires no reading-table migration or backfill — just invalidating the readings query on the frontend so it refetches through the already-updated `computeHealth` path.
- **`[id]/index.ts` already has the ownership-check + method-branch skeleton you need** — read the existing `DELETE` handler in full before adding `PATCH`; copy its `requireAuth` → parse `deviceId` → `requireDeviceOwnership` sequence exactly, then diverge only at the point where `DELETE` calls `deleteDevice` vs where this story calls `updateDeviceRating`.
- **Query invalidation target matters:** `['devices']` (used by `regenerateMutation`/`deleteMutation` in `DeviceDetail.tsx`) refreshes the device list/summary, NOT the per-device readings-with-SOH array. SOH lives on `ReadingWithHealth`, fetched via `['readings', deviceId]`. Invalidating the wrong key will make the UI look like nothing happened after a successful save.
- **This story depends on both Story 4.1 (schema/creation) and Story 4.2 (`computeHealth` returning `soh`)** — do not start frontend display work until `ReadingWithHealth.soh` is actually populated by the backend.
- **Scope boundary:** this story does NOT add rating fields to the device *creation* form (that's out of scope per epics.md — Story 4.1 only requires the API to accept them; the create-device UI can continue to omit rNew/rEol and rely on the 0.015Ω default). Only *editing an existing* device's rating is a frontend requirement here.

### Project Structure Notes

- Files touched: `dashboard/lib/db.ts`, `dashboard/api/devices/[id]/index.ts`, `dashboard/src/lib/apiClient.ts`, `dashboard/src/pages/DeviceDetail.tsx`, `dashboard/test/unit/devices.test.ts`, `dashboard/e2e/device-detail.spec.ts`.
- New file: `dashboard/src/components/EditRatingModal.tsx` (mirrors `TokenRevealModal.tsx` placement/pattern — no new directory needed).

### References

- [Source: _bmad-output/planning/epics.md#Story 4.3] — story origin, full AC text
- [Source: dashboard/api/devices/[id]/index.ts] — existing DELETE handler and ownership-check sequence to extend with PATCH
- [Source: dashboard/src/components/TokenRevealModal.tsx] — modal structure/styling pattern to mirror for `EditRatingModal`
- [Source: dashboard/src/components/HealthBadge.tsx] — status-driven color-coding pattern, reusable for SOH visual treatment
- [Source: dashboard/src/pages/DeviceDetail.tsx] — mutation + query-invalidation pattern (`regenerateMutation`, `deleteMutation`) to follow for the new edit mutation
- [Source: dashboard/src/lib/apiClient.ts] — `api` object shape and `Device`/`ReadingWithHealth` types to extend
- [Source: _bmad-output/implementation/4-1-battery-rating-schema.md] — prerequisite: schema + creation-time defaults
- [Source: _bmad-output/implementation/4-2-soh-computation.md] — prerequisite: `computeHealth` returning `soh`

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- e2e run caught a real regression before it shipped: `latest.soh !== null` treated `undefined` (the shape of pre-Story-4.2-era mocked/stale reading objects lacking a `soh` field) as "rated", then called `.toFixed(0)` on `undefined` and crashed the whole `DeviceDetail` component, taking down an unrelated pre-existing e2e test (`shows chart, table, and a health badge...`). Fixed by switching the guard to `typeof latest.soh === 'number'`, which treats both `null` and `undefined` as "not rated" — this also makes the frontend defensive against any future backend response shape drift, not just the one test that caught it.
- The `EditRatingModal`'s R_eol label text ("R_eol (Ω) — optional, defaults to 2× R_new") contains the substring "R_new", so the e2e test's initial `getByLabel(/R_new/)` regex matched both inputs (strict-mode violation). Anchored both label regexes (`/^R_new/`, `/^R_eol/`) to fix.
- `@phosphor-icons/react` icon existence can't be checked via `node -e "require(...)"` in this project — it's an ESM package and CJS interop resolves every named export to `undefined` even for icons that work fine at runtime (confirmed `ArrowLeft`, already used elsewhere, also showed `undefined` under the same check). Verified `Pencil` exists instead by checking `node_modules/@phosphor-icons/react/dist/csr/Pencil.es.js` directly.

### Completion Notes List

- `computeHealth`/backend deliberately unchanged in this story — SOH is entirely derived at read-time (Story 4.2); this story only adds a write path (`updateDeviceRating`/PATCH) and a read-time display, no new stored/denormalized `soh` anywhere.
- SOH display only added to `DeviceDetail.tsx` (per-reading, from `ReadingWithHealth`), NOT to the device list/`StatCard`/`DeviceCard` — matches the story's explicit scope boundary (AC #1 only requires the detail page) and keeps `DeviceLatestReading` unchanged.
- Device-creation form intentionally NOT touched — rating is create-time-optional (Story 4.1, defaults applied server-side) and only edit-after-creation is a UI requirement here, per the story's stated scope boundary.
- Full regression suite: 91 unit tests (8 files, up from 84 after Story 4.2) + all 21 e2e tests across every spec file (not just `device-detail.spec.ts`) pass; `tsc -b` and `oxlint` both clean, same 2 pre-existing unrelated warnings as prior stories.

### File List

- `dashboard/lib/db.ts` (modified)
- `dashboard/api/devices/[id]/index.ts` (modified)
- `dashboard/src/lib/apiClient.ts` (modified)
- `dashboard/src/pages/DeviceDetail.tsx` (modified)
- `dashboard/src/components/EditRatingModal.tsx` (new)
- `dashboard/test/unit/devices.test.ts` (modified)
- `dashboard/e2e/helpers.ts` (modified)
- `dashboard/e2e/device-detail.spec.ts` (modified)
