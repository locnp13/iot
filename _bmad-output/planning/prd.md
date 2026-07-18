---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
inputDocuments: []
workflowType: 'prd'
classification:
  projectType: iot_embedded
  domain: general
  complexity: low
  projectContext: greenfield
note: 'Fast-tracked at user request on 2026-07-18 — sections drafted directly from prior conversation context instead of step-by-step elicitation (step-05-domain, step-06-innovation, step-07-project-type skipped as not applicable/not needed).'
---

# Product Requirements Document - IoT Battery Internal Resistance Monitoring System

**Author:** BMad
**Date:** 2026-07-18

## Executive Summary

An ESP32-based handheld/bench device measures a battery's internal resistance (Rint) on demand: press a button, the device applies a fixed 3-second load through a relay while sampling voltage (ADS1115) and current (ACS758), computes Rint from the voltage sag and peak current, then uploads the result to a cloud backend over HTTPS. Readings are tied to the device's owning user account and viewable on a web dashboard, replacing the current manual workflow of multimeter + stopwatch + handwritten log.

The deeper goal is not the single Rint number — it's **assessing battery health and tracking degradation over time**. Rint rises as a battery ages or degrades, so the real value comes from comparing a battery's current reading against its own history (or a healthy baseline) to answer "is this battery still good, and how fast is it declining?" A single measurement tells you a data point; the repeated, logged measurements this system enables are what make health assessment possible.

The system is for **internal use only** — a single team/operator testing batteries — not a public multi-tenant product. Scope is intentionally narrow: this one measurement/assessment workflow, not a general sensor/IoT platform.

### What Makes This Special

- **One button, full cycle:** measurement, computation, and cloud upload happen automatically in one ~12-second cycle with no manual data entry.
- **Power-conscious by design:** the device stays in deep sleep between tests and only wakes on button press (EXT0 GPIO interrupt), so it can sit idle indefinitely on battery power.
- **Resilient to no-network conditions:** if Wi-Fi isn't available at upload time, the device does not block or retry indefinitely — it logs locally and returns to sleep within a bounded time budget.

### Project Classification

- **Project Type:** `iot_embedded` (device firmware) + `web_app` dashboard component
- **Domain:** `general` (no regulatory/compliance domain — internal engineering tool)
- **Complexity:** `low`
- **Project Context:** Greenfield
- **Tenancy:** Internal use only — devices belong to users for data ownership/isolation, not for public self-service signup
- **Device-battery mapping:** Each device is permanently attached to one battery/battery pack (confirmed 1:1) — a device's full reading history *is* that battery's health/degradation history, no separate "battery" entity needed

## Goals & Success Criteria

**User goal:** An operator presses the button on a battery under test and, within ~10-15 seconds, has a logged Rint reading retrievable later from the dashboard — with zero manual transcription. Beyond the single reading, the operator can look at a battery's history and judge whether it's still healthy or degrading, without doing the comparison by hand.

**Success criteria:**
- A full measure → compute → upload cycle completes without operator intervention beyond the initial button press.
- Every completed measurement is either uploaded immediately or preserved for later reporting — no silent data loss when Wi-Fi is unavailable at upload time.
- A user can log into the dashboard and see the reading history (Rint, ΔV, Imax, cycle count) for each device they own, presented as a trend over time rather than a flat list.
- A user can tell, from the dashboard alone, whether a given battery's Rint is stable, rising, or has crossed a concerning threshold — without manually comparing numbers across past sessions.
- Device credentials are scoped per-device and per-owner, so one compromised device token cannot expose another user's data.

## User Journey

**Persona: Internal test operator**

1. Operator wants to check whether a battery is still healthy before reuse.
2. Operator connects the device's test leads to the battery and presses the button (D4).
3. Device wakes from deep sleep, takes a 1-second resting-voltage baseline, closes the relay for exactly 3 seconds under load while sampling ~50 times/second, then opens the relay.
4. Device computes ΔV, peak current, and Rint, increments its cycle counter, and attempts Wi-Fi upload for up to 4 seconds.
5. If upload succeeds, the reading appears under the operator's account on the dashboard. If Wi-Fi isn't available, the reading is preserved locally for the next successful sync.
6. Operator opens the dashboard, selects the device, and reviews the Rint trend over time — compared against that battery's own first (baseline) reading — to judge whether it's still healthy or degrading, and by how much.

## Scope

**MVP (this phase):**
- Firmware: existing measurement/compute/deep-sleep cycle, upgraded to authenticate via a per-device token over HTTPS (replacing the current plaintext user/pass-in-JSON approach).
- Firmware: persist the full reading (not just the cycle counter) to flash when upload fails, and retry upload on the next wake with connectivity — closing the current gap where only the counter survives a missed upload.
- Backend (Vercel + Postgres/Neon, free tier): user auth (register/login, JWT session), device registration issuing a one-time-visible API token, authenticated ingest endpoint, per-owner read endpoints.
- Frontend (React + Vite + Tailwind, hosted on Vercel): login/register, device list with "add device" flow, per-device reading history (table + chart), Rint trend vs. the device's own baseline (first) reading with a simple health status (stable / degrading / replace-threshold).

**Growth (later, not now):**
- Automatic alerting (email/notification) when Rint trend crosses a degradation threshold, instead of requiring the operator to check the dashboard.
- Fleet management / OTA firmware updates across multiple devices.

**Explicitly out of scope (per user decision — internal tool, single problem focus):**
- Public multi-tenant self-service signup.
- Support for additional sensor/measurement types beyond battery Rint testing.

## Functional Requirements

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

## Non-Functional Requirements

- NFR1 (Power): The full measure-compute-upload cycle must stay within a bounded time budget (target ≤15s: 3s load + up to 4s Wi-Fi wait + 5s cooldown) to limit battery drain per test.
- NFR2 (Security): All device-to-backend and dashboard-to-backend traffic must use HTTPS; no credentials transmitted in plaintext request bodies.
- NFR3 (Data isolation): A user must never be able to read another user's device tokens or readings.
- NFR4 (Hosting cost): Backend and database must run within Vercel's and the database provider's free tiers (serverless functions + free-tier Postgres, e.g. Neon) — no assumption of a persistent local filesystem for storage.
- NFR5 (Availability): Best-effort availability is acceptable; no formal SLA, given internal-only usage.
