import { test, expect } from '@playwright/test';
import { mockLoggedIn, mockReadings } from './helpers';

test.describe('Reading notifications', () => {
  test('shows a toast when a new reading arrives via polling, and clicking it navigates to the device', async ({
    page,
  }) => {
    await mockLoggedIn(page);
    const DEVICE = { id: 21, name: 'Bench pack #7', createdAt: '2026-01-01T00:00:00Z' };
    let latestReading: { id: number; cycle: number; rInt: number; createdAt: string } | null = null;

    await page.route('**/api/devices', (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
      }
      return route.fulfill({
        status: 200,
        json: [
          {
            id: DEVICE.id,
            name: DEVICE.name,
            createdAt: DEVICE.createdAt,
            status: latestReading ? 'stable' : null,
            latestReading,
          },
        ],
      });
    });
    await mockReadings(page, DEVICE.id, []);

    await page.goto('/devices');
    await expect(page.getByText(DEVICE.name)).toBeVisible();

    // Let the baseline poll (immediate on mount) establish "no reading yet" before a new one lands —
    // otherwise a race could make the first poll itself look like "new data" and fire a false toast.
    await page.waitForTimeout(500);
    latestReading = { id: 501, cycle: 1, rInt: 42.3, createdAt: '2026-01-02T00:00:00Z' };

    const toast = page.getByRole('button', { name: /Bench pack #7.*Rint: 42\.3mΩ/ });
    await expect(toast).toBeVisible({ timeout: 8000 });

    await toast.click();
    await expect(page).toHaveURL(`/devices/${DEVICE.id}`);
  });

  test('batches multiple devices reporting in the same poll into one summary toast', async ({ page }) => {
    await mockLoggedIn(page);
    const DEVICES = [
      { id: 31, name: 'Bench pack #A', createdAt: '2026-01-01T00:00:00Z' },
      { id: 32, name: 'Bench pack #B', createdAt: '2026-01-01T00:00:00Z' },
    ];
    let readingsLanded = false;

    await page.route('**/api/devices', (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
      }
      return route.fulfill({
        status: 200,
        json: DEVICES.map((d) => ({
          ...d,
          status: readingsLanded ? 'stable' : null,
          latestReading: readingsLanded ? { id: d.id * 100, cycle: 1, rInt: 10, createdAt: '2026-01-02T00:00:00Z' } : null,
        })),
      });
    });
    await mockReadings(page, DEVICES[0].id, []);
    await mockReadings(page, DEVICES[1].id, []);

    await page.goto('/devices');
    await expect(page.getByText('Bench pack #A')).toBeVisible();

    await page.waitForTimeout(500);
    readingsLanded = true;

    await expect(page.getByText('2 thiết bị vừa có dữ liệu mới')).toBeVisible({ timeout: 8000 });
  });

  test('shows a disconnect indicator when polling fails', async ({ page }) => {
    await mockLoggedIn(page);
    await page.route('**/api/devices', (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
      }
      return route.fulfill({ status: 500, json: { error: 'boom' } });
    });

    await page.goto('/devices');
    await expect(page.getByText('Mất kết nối')).toBeVisible({ timeout: 8000 });
  });
});
