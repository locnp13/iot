---
title: "Product Brief: Dashboard Notifications for New Device Readings"
status: "complete"
created: "2026-07-19"
updated: "2026-07-19"
review: "reviewed by skeptic + opportunity panel; all substantive gaps resolved with user"
inputs: ["_bmad-output/planning/prd.md", "_bmad-output/planning/architecture.md", "_bmad-output/planning/epics.md", "user conversation", "web research on real-time delivery patterns for serverless dashboards"]
---

# Product Brief: Dashboard Notifications for New Device Readings

## Executive Summary

Right now, the only way an operator learns that a battery bench just reported a new reading is to manually navigate to that device's page and look. If they're reviewing a different device, filling in a form, or simply away from the tab, a completed test sits invisible until they think to go check. This brief proposes a lightweight, polling-based notification: a toast in the bottom corner of the dashboard that appears within seconds of any owned device uploading a new reading — naming the device and its result, batching multiple simultaneous arrivals into one message, and linking straight to the device's detail page. It's built entirely on infrastructure already in place (Vercel serverless + Neon Postgres, TanStack Query's refetch pattern), deliberately choosing a 5-second poll over a true real-time push mechanism, because at this project's scale — a handful of internal operators, one reading per test cycle — push infrastructure would add cost and complexity for a benefit no one would notice.

## The Problem

An operator runs a battery bench: press the button, wait ~12-15 seconds through the measurement cycle, and the device uploads its result. Today, the only way to see that result is to be on — or navigate to — that specific device's detail page and look at the table. If an operator is testing three benches in parallel, or steps away to do something else after starting a test, there's no signal that data has landed. They either babysit the page (wasteful) or periodically re-navigate to check (easy to forget, and delays noticing a bench that came back "degrading" and needs attention).

This gets worse as the number of devices being tested in a session grows — the cost of "go check each one" scales linearly with devices, while the actual event (a reading landing) is rare and instantaneous.

## The Solution

A dashboard-wide notification, designed around one principle: **ambient awareness, not an alert firehose.** While any authenticated user is on the dashboard (any page, not just the device they're currently viewing), the app polls for new readings across all devices they own every 5 seconds. The moment a new reading is detected for a device, a toast appears in the bottom corner naming the device and its key result (e.g. *"Bench pack #3 vừa có reading mới (Rint: 42.3mΩ)"*). Readings detected within the same poll tick are collapsed into a single summary toast instead of stacking individually; readings detected on separate ticks still surface as separate toasts. The toast is clickable (jumps straight to that device's detail page), auto-dismisses after 5 seconds, and can be dismissed manually.

The first poll after the dashboard loads establishes a baseline (records each device's current latest-reading marker) without emitting any toasts — only readings that arrive *after* that baseline notify. This is a pure convenience layer, not the system of record: the existing device detail page remains the reliable, always-correct source of truth if a toast is missed or a tab was closed.

## Why This Approach (Polling, Not Push)

The architecture already made an explicit call: no pub/sub, no WebSocket, no MQTT — "not needed for this device's event-driven, low-frequency upload pattern." This brief doesn't reopen that decision. A true real-time push (managed service like Ably/Pusher/Supabase Realtime, or a self-hosted SSE/WebSocket relay) would work, but:

- It adds a new vendor, auth layer, and ongoing cost disproportionate to a handful of internal users generating one event per test cycle.
- Vercel's serverless functions don't natively hold long-lived connections, so self-hosting SSE/WebSocket means fighting the platform's execution-duration limits and building reconnect logic — real engineering cost for a "show a toast" feature.
- A 5-second poll is imperceptibly different from instant push at this event frequency, and it reuses the exact refetch pattern (TanStack Query) already powering the rest of the dashboard.

If usage ever grows to many concurrent operators or high-frequency telemetry (continuous streaming rather than one-shot test cycles), that's the trigger to revisit this decision — not before.

**Known limitation, handled deliberately:** browsers throttle timers in backgrounded/inactive tabs anyway (often down to ~once a minute), so v1 embraces this rather than fighting it — polling explicitly pauses when the tab isn't visible and catches up immediately on refocus (see Scope). A tab left open but unfocused simply won't notify until you look at it again, which is consistent with the convenience-layer framing above, not a bug to work around with push infrastructure.

## Who This Serves

The single existing persona from the PRD: the **internal test operator** running battery benches. Today their workflow is "start a test, go do something else, remember to come back and check." This feature turns that last step from an active chore into a passive signal — they find out the moment it matters, without babysitting a page or context-switching to check.

## Success Criteria

- An operator notices a new reading within ~5-10 seconds of it landing, without manually navigating or refreshing — verified via a basic latency log (reading-created timestamp vs. toast-rendered timestamp), not self-report alone.
- Operators self-report fewer manual "let me go check if it's done" page visits during multi-device test sessions.
- Zero added infrastructure cost or vendor dependency — runs entirely inside the existing Vercel + Neon free-tier footprint.
- No measurable increase in perceived dashboard sluggishness or Neon load at current device/user scale.

**Ownership model:** each device belongs to exactly one user (as today — no shared/multi-operator visibility into a single device). Notifications follow that same boundary; revisit only if a real need for shared device visibility emerges.

## Scope

**In (v1):**
- App-shell-level polling (every 5s) across all devices the logged-in user owns, regardless of which page is active.
- Bottom-corner toast, named device + key result for a single arrival; batched summary toast when multiple devices are detected within the *same* poll tick (arrivals landing in separate ticks still surface as separate toasts — accepted tradeoff for v1 simplicity).
- Click-through from toast to the device's detail page.
- Auto-dismiss after 5 seconds; manual dismiss available.
- A visible indicator when polling itself fails (network error, expired session) — so a silently broken feed doesn't masquerade as "no new data," which would be worse than not having the feature at all.
- Polling pauses while the tab is backgrounded/inactive (Page Visibility API) and immediately re-checks on refocus — cuts wasted requests and replaces the browser's unpredictable background-timer throttling with an intentional, correctly-handled pause.

**Explicitly out (v1):**
- Sound/audio alerts.
- Notifications when the browser tab or window is closed (no push-to-device, no service worker).
- Persisted notification history/log.
- Threshold-based degradation alerting (e.g. "Rint crossed X% of baseline, email me") — this is a *different*, already-deferred PRD growth item and should not be conflated with this feature.
- True real-time push (WebSocket/SSE/managed pub-sub) — deliberately deferred per "Why This Approach" above.
- Cross-tab deduplication — each open tab polls and notifies independently.

## Technical Note

`GET /api/devices` today returns each device's `id`, `name`, `createdAt`, and computed `status`, but nothing that identifies *which* reading was last seen (no latest cycle number, reading id, or timestamp). Detecting "this device has a reading since my last poll" needs that endpoint to expose one such marker per device (e.g. `latestReadingId` or `latestCycle`) — a small, additive backend change, not a new endpoint.

This marker is also the reusable seed for the deferred threshold-alerting feature below: that feature will separately need to know "has this device's data changed since I last evaluated it" before it can check a threshold, so this brief's change is the first consumer of a piece of plumbing the next feature would need anyway.

A frontend toast/snackbar system doesn't exist in the codebase yet (only modal dialogs like `TokenRevealModal`/`ConfirmDialog`) — building it (positioning, stacking, timing, dismissal, accessibility) is real, if modest, net-new UI work, not a trivial reuse of an existing primitive.

## Vision

If this proves useful, the natural next step isn't "make polling faster" — it's revisiting the deferred threshold-based degradation alert (email/notification when Rint crosses a danger threshold), which is a genuinely different problem (alerting on a computed condition, not on data arrival) already scoped as a future PRD growth item, and one that can build directly on the last-seen marker introduced here.
