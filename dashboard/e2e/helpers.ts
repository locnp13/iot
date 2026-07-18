import type { Page } from '@playwright/test';

// These tests mock every /api/* response via Playwright route interception — they drive
// the REAL React app in a REAL browser end-to-end, but stub the network boundary since no
// live database is available in this environment. See test/unit/*.test.ts for the real
// handler + DB-mapping logic tests that these mocks stand in for here.

export async function mockLoggedOut(page: Page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: 'Not authenticated' } }));
}

export async function mockLoggedIn(page: Page, user = { id: 1, email: 'a@b.com' }) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: user }));
}

// IMPORTANT: only one `page.route('**/api/devices', ...)` handler should ever be registered
// per test — Playwright resolves the LAST-registered matching handler first, and its
// `route.continue()` sends the request straight to the network rather than falling through
// to an earlier handler for the same pattern. Register a single combined handler instead of
// calling this alongside mockCreateDevice for the same test.
type MockDevice = { id: number; name: string; createdAt: string; status?: 'stable' | 'degrading' | 'replace' | null };

export async function mockDevices(page: Page, devices: MockDevice[]) {
  await page.route('**/api/devices', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: devices });
    }
    return route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
  });
}

/** Combined GET (list, starts empty) + POST (create) handler for a single `**\/api/devices` route. */
export async function mockDevicesWithCreate(page: Page, device: MockDevice & { token: string }) {
  const created: MockDevice[] = [];
  await page.route('**/api/devices', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: created });
    }
    if (route.request().method() === 'POST') {
      created.push({ id: device.id, name: device.name, createdAt: device.createdAt });
      return route.fulfill({ status: 201, json: device });
    }
    return route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
  });
}

export async function mockReadings(page: Page, deviceId: number, readings: unknown[]) {
  await page.route(`**/api/devices/${deviceId}/readings`, (route) =>
    route.fulfill({ status: 200, json: readings }),
  );
}

export async function mockRegenerateToken(page: Page, deviceId: number, token: string) {
  await page.route(`**/api/devices/${deviceId}/regenerate-token`, (route) =>
    route.fulfill({ status: 200, json: { token } }),
  );
}
