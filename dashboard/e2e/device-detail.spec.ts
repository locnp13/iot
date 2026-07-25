import { test, expect } from '@playwright/test';
import { mockLoggedIn, mockDevices, mockReadings, mockRegenerateToken, mockDeleteDevice, mockUpdateRating } from './helpers';

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

  test('cancelling the delete confirm dialog keeps the device', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [DEVICE]);
    await mockReadings(page, DEVICE.id, []);
    await page.goto(`/devices/${DEVICE.id}`);

    await page.getByRole('button', { name: 'Delete device' }).click();
    await expect(page.getByText('Delete this device?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Delete this device?')).not.toBeVisible();
    await expect(page).toHaveURL(`/devices/${DEVICE.id}`);
  });

  test('confirming delete removes the device and returns to the device list', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [DEVICE]);
    await mockReadings(page, DEVICE.id, []);
    await mockDeleteDevice(page, DEVICE.id);
    await page.goto(`/devices/${DEVICE.id}`);

    await page.getByRole('button', { name: 'Delete device' }).click();
    await expect(page.getByText('permanently delete')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL('/devices');
  });

  test('shows "Not rated" for an unrated device, then displays SOH after editing the rating', async ({ page }) => {
    await mockLoggedIn(page);

    let rated = false;
    // Editing the rating invalidates both the readings query (soh per reading) and the
    // devices query (rNew/rEol, used by the formula panel) — both routes must reflect it.
    await page.route('**/api/devices', (route) => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: {} });
      return route.fulfill({
        status: 200,
        json: [{ ...DEVICE, rNew: rated ? 10 : null, rEol: rated ? 20 : null }],
      });
    });
    await page.route(`**/api/devices/${DEVICE.id}/readings`, (route) => {
      const reading = {
        id: 1, deviceId: DEVICE.id, cycle: 1, vRest: 4.0, deltaV: 0.5, iMax: 2.0, rInt: 15,
        createdAt: '2026-01-01T00:00:00Z', percentChangeFromBaseline: 0, status: 'stable',
        soh: rated ? 50 : null,
      };
      return route.fulfill({ status: 200, json: [reading] });
    });
    await mockUpdateRating(page, DEVICE.id, () => {
      rated = true;
    });

    await page.goto(`/devices/${DEVICE.id}`);
    await expect(page.getByTestId('soh-value')).toHaveText('Not rated');

    await page.getByRole('button', { name: 'Edit rating' }).click();
    await page.getByLabel(/^R_new/).fill('10');
    await page.getByLabel(/^R_eol/).fill('20');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('soh-value')).toHaveText('50%');

    // Formula disclosure: hidden by default, shows the SOH formula with this reading's actual numbers on click.
    await expect(page.getByRole('tooltip')).not.toBeVisible();
    await page.getByRole('button', { name: 'How is SOH calculated?' }).click();
    await expect(page.getByRole('tooltip')).toContainText('SOH = (R_eol − R_int) / (R_eol − R_new) × 100');
    await expect(page.getByRole('tooltip')).toContainText('(20 − 15) / (20 − 10) × 100 = 50%');
  });
});
