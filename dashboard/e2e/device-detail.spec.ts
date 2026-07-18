import { test, expect } from '@playwright/test';
import { mockLoggedIn, mockDevices, mockReadings, mockRegenerateToken } from './helpers';

const DEVICE = { id: 9, name: 'Bench pack #1', createdAt: '2026-01-01T00:00:00Z' };

test.describe('Device detail', () => {
  test('shows an empty state when the device has no readings', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [DEVICE]);
    await mockReadings(page, DEVICE.id, []);
    await page.goto(`/devices/${DEVICE.id}`);
    await expect(page.getByText('No readings yet')).toBeVisible();
  });

  test('shows chart, table, and a health badge reflecting backend-computed status', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [DEVICE]);
    await mockReadings(page, DEVICE.id, [
      {
        id: 1, deviceId: 9, cycle: 1, vRest: 4.0, deltaV: 0.5, iMax: 2.0, rInt: 100,
        createdAt: '2026-01-01T00:00:00Z', percentChangeFromBaseline: 0, status: 'stable',
      },
      {
        id: 2, deviceId: 9, cycle: 2, vRest: 3.9, deltaV: 0.7, iMax: 1.9, rInt: 135,
        createdAt: '2026-01-05T00:00:00Z', percentChangeFromBaseline: 35, status: 'degrading',
      },
    ]);
    await page.goto(`/devices/${DEVICE.id}`);

    // Latest reading's status badge is shown prominently near the title (Story 3.3).
    // "Degrading" also appears in the table row for that same reading, so scope to the heading.
    await expect(page.getByRole('heading').locator('..').getByText('Degrading')).toBeVisible();

    // Table shows raw values + % change for every row (Story 3.2 / FR17)
    await expect(page.getByRole('cell', { name: '100.00' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '135.00' })).toBeVisible();
    await expect(page.getByText('+35.0%')).toBeVisible();

    // Chart renders (recharts draws an SVG with the line path)
    await expect(page.locator('.recharts-line-curve')).toBeVisible();
  });

  test('regenerating the token shows the new plaintext token exactly once', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [DEVICE]);
    await mockReadings(page, DEVICE.id, []);
    await mockRegenerateToken(page, DEVICE.id, 'new-token-xyz');
    await page.goto(`/devices/${DEVICE.id}`);

    await page.getByRole('button', { name: 'Regenerate token' }).click();
    await expect(page.getByText('new-token-xyz')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('new-token-xyz')).not.toBeVisible();
  });
});
