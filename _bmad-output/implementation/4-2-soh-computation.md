# Story 4.2: Absolute SOH% Computation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want each reading's SOH% computed from the device's R_new and R_EOL,
so that I see an absolute battery-quality figure — relative to a manufacturer-rated new battery — not just drift relative to this device's own first reading.

## Acceptance Criteria

1. `computeHealth` accepts the owning device's `rNew`/`rEol` and returns each reading with an added `soh` field: `soh = clamp(((rEol - rInt) / (rEol - rNew)) * 100, 0, 100)`.
2. When `rInt <= rNew`, `soh` is clamped to `100` (never exceeds it).
3. When `rInt >= rEol`, `soh` is clamped to `0` (never negative).
4. When a device has no `rNew`/`rEol` set (both `null` — should not normally happen after Story 4.1 defaults new devices, but pre-existing devices from before this story may have `null`), `soh` is `null` for all its readings rather than throwing or producing `NaN`/`Infinity`.
5. `GET /api/devices/:id/readings` (`api/devices/[id]/readings.ts`) includes `soh` on every returned reading.
6. `GET /api/devices` (`api/devices/index.ts`) includes `soh` on the `latestReading` object it returns per device.
7. Existing `percentChangeFromBaseline` and `status` (baseline-drift classification) fields are unchanged — `soh` is additive, computed from the same input readings, answering a different question (see Dev Notes).

## Tasks / Subtasks

- [x] Task 1: Extend `lib/health.ts` (AC: #1, #2, #3, #4, #7)
  - [x] Add `soh: number | null` to the `ReadingWithHealth` interface.
  - [x] Change `computeHealth` signature from `computeHealth(readings: Reading[])` to `computeHealth(readings: Reading[], device: { rNew: number | null; rEol: number | null })`.
  - [x] Implement the SOH formula per AC #1, with the `null` short-circuit per AC #4 BEFORE the division (guard `rNew === null || rEol === null`, not just a post-hoc `isNaN` check).
  - [x] Clamp with `Math.min(100, Math.max(0, ...))` — do not rely on the formula's natural range; degraded batteries can produce `rInt > rEol` and must still clamp to exactly `0`, not a negative number.
  - [x] Leave the existing baseline/status logic (lines computing `percentChangeFromBaseline` and `status`) completely untouched — do not refactor or "clean up" adjacent code.
- [x] Task 2: Update call site — `api/devices/[id]/readings.ts` (AC: #5)
  - [x] `requireDeviceOwnership(deviceId, userId)` already returns the full `Device` row (confirmed in `lib/auth.ts`) — capture it into a variable (currently the return value is discarded) and pass it to `computeHealth(readings, device)`.
- [x] Task 3: Update call site — `api/devices/index.ts` (AC: #6)
  - [x] In the `devices.map(async (d) => {...})` block, `d` is already the full device row — change `computeHealth(readings)` to `computeHealth(readings, d)`.
  - [x] `latest` (the last element of the `computeHealth` result) already carries `soh` once Task 1 is done — extend the `latestReading` object literal (`{ id: latest.id, cycle: latest.cycle, rInt: latest.rInt, createdAt: latest.createdAt }`) to include `soh: latest.soh`.
- [x] Task 4: Unit tests — `lib/health.ts` (AC: all)
  - [x] `dashboard/test/unit/health.test.ts`: every existing `computeHealth(readings)` call in this file becomes `computeHealth(readings, device)` — update ALL of them (there are 6 test cases as of this writing), not just new ones, or the suite will fail to compile against the new signature.
  - [x] Add cases: `rInt` below `rNew` → `soh` clamped to 100; `rInt` above `rEol` → `soh` clamped to 0; `rInt` exactly at `rNew` → `soh === 100`; `rInt` exactly at `rEol` → `soh === 0`; a value strictly between → correct proportional `soh` (e.g. `rNew=10, rEol=20, rInt=15` → `soh===50`); device with `rNew: null, rEol: null` → every reading's `soh === null`, and baseline/status fields still compute normally (they don't depend on rNew/rEol).
- [x] Task 5: Unit tests — API call sites (AC: #5, #6)
  - [x] `dashboard/test/unit/readings.test.ts`: in the `GET /api/devices/[id]/readings` describe block, update `authMock.requireDeviceOwnership.mockResolvedValue({ id: 9, userId: 1 })` to also include `rNew`/`rEol` in at least one test, and assert the returned payload's `soh` values.
  - [x] `dashboard/test/unit/devices.test.ts`: in the GET tests, ensure mocked devices include `rNew`/`rEol` and assert `payload[0].latestReading.soh` is present and correct.

## Dev Notes

- **Baseline-drift vs SOH — do not conflate them:** `percentChangeFromBaseline`/`status` compare a reading to *this device's own first reading* (whatever condition the battery was already in when first tested — could itself be half-dead). `soh` compares a reading to the *manufacturer-rated new-battery resistance* (`rNew`) supplied in Story 4.1. Both are computed from the same `Reading[]` input and coexist on the same object; this story does not replace or touch the existing baseline logic, only adds to it.
- **Signature change is a breaking change to an internal function** — `computeHealth` has exactly two callers in the whole codebase (`api/devices/index.ts`, `api/devices/[id]/readings.ts`) plus its own unit tests. Grep for `computeHealth(` before finishing to confirm no other call site was missed.
- **`requireDeviceOwnership` already returns what you need** — no new DB query required in `api/devices/[id]/readings.ts`; the device row (with `rNew`/`rEol`, once Story 4.1 lands) is already fetched by the existing `requireDeviceOwnership` call, just not currently captured into a variable.
- **Formula reference (from the source paper):** `SOH = (R_EOL − R_int) / (R_EOL − R_new) × 100`. This is a strictly decreasing linear interpolation from 100% (at `R_int = R_new`) to 0% (at `R_int = R_EOL`) — same shape described in `IoT_EN.docx`, "Correlation Between Internal Resistance and State of Health".
- **This story depends on Story 4.1** (`rNew`/`rEol` columns, `Device.rNew`/`Device.rEol` fields) being complete first. Do not implement against a `devices` table that doesn't yet have these columns.

### Project Structure Notes

- Files touched: `dashboard/lib/health.ts`, `dashboard/api/devices/[id]/readings.ts`, `dashboard/api/devices/index.ts`, `dashboard/test/unit/health.test.ts`, `dashboard/test/unit/readings.test.ts`, `dashboard/test/unit/devices.test.ts`. No new files.
- Pure-function change (`lib/health.ts`) plus two thin call-site updates — no new architectural pattern introduced.

### References

- [Source: _bmad-output/planning/epics.md#Story 4.2] — story origin, full AC text
- [Source: dashboard/lib/health.ts] — current `computeHealth` implementation to extend (baseline-drift logic must remain untouched)
- [Source: dashboard/lib/auth.ts#requireDeviceOwnership] — confirms it returns the full `Device` row, not just `{id, userId}`
- [Source: dashboard/api/devices/index.ts] — GET handler's `withStatus` map block, exact object literal to extend
- [Source: dashboard/api/devices/[id]/readings.ts] — GET handler, exact line where `computeHealth(readings)` is called
- [Source: dashboard/test/unit/health.test.ts] — existing test file; ALL cases need signature update, not just new ones
- [Source: IoT_EN.docx §"Correlation Between Internal Resistance and State of Health (SOH)"] — SOH formula and its physical meaning

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Grepped `computeHealth(` across the repo before finishing — confirmed exactly two production call sites (both updated) plus the test file; no missed callers.

### Completion Notes List

- `computeSoh` extracted as a small private helper in `lib/health.ts` rather than inlined into `computeHealth`'s `.map` — keeps the null-guard and clamp logic isolated and readable next to the untouched baseline-drift logic.
- Both call sites now pass the full `Device` row through: `api/devices/[id]/readings.ts` previously discarded `requireDeviceOwnership`'s return value — now captured as `device` and reused, no extra DB query added. `api/devices/index.ts` already had `d` in scope.
- Full regression suite (84 tests, 8 files — up from 76 after Story 4.1), `tsc -b`, and `oxlint` all pass clean; same 2 pre-existing warnings as before (unrelated to this story).

### File List

- `dashboard/lib/health.ts` (modified)
- `dashboard/api/devices/[id]/readings.ts` (modified)
- `dashboard/api/devices/index.ts` (modified)
- `dashboard/test/unit/health.test.ts` (modified)
- `dashboard/test/unit/readings.test.ts` (modified)
- `dashboard/test/unit/devices.test.ts` (modified)
