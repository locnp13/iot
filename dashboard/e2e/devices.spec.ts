import { test, expect } from '@playwright/test';
import { mockLoggedIn, mockDevices, mockDevicesWithCreate } from './helpers';

test.describe('Device list', () => {
  test('shows an empty state when the user has no devices', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, []);
    await page.goto('/devices');
    await expect(page.getByText('No devices yet')).toBeVisible();
  });

  test('lists the devices the user owns', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [
      { id: 1, name: 'Bench pack #1', createdAt: '2026-01-01T00:00:00Z', status: 'stable' },
      { id: 2, name: 'Bench pack #2', createdAt: '2026-01-02T00:00:00Z', status: 'degrading' },
    ]);
    await page.goto('/devices');
    await expect(page.getByText('Bench pack #1')).toBeVisible();
    await expect(page.getByText('Bench pack #2')).toBeVisible();
  });

  test('summarizes device health as a KPI row', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevices(page, [
      { id: 1, name: 'Bench pack #1', createdAt: '2026-01-01T00:00:00Z', status: 'stable' },
      { id: 2, name: 'Bench pack #2', createdAt: '2026-01-02T00:00:00Z', status: 'degrading' },
      { id: 3, name: 'Bench pack #3', createdAt: '2026-01-03T00:00:00Z', status: 'replace' },
    ]);
    await page.goto('/devices');

    await expect(page.getByTestId('stat-total-devices')).toContainText('3');
    await expect(page.getByTestId('stat-stable')).toContainText('1');
    await expect(page.getByTestId('stat-degrading')).toContainText('1');
    await expect(page.getByTestId('stat-replace')).toContainText('1');
  });

  test('adding a device reveals the plaintext token exactly once, in a dismissible modal', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevicesWithCreate(page, {
      id: 9,
      name: 'New bench',
      createdAt: '2026-01-01T00:00:00Z',
      token: 'abc123deadbeef',
    });
    await page.goto('/devices');

    await page.getByRole('button', { name: 'Add device' }).click();
    await page.getByPlaceholder(/Device name/).fill('New bench');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('abc123deadbeef')).toBeVisible();
    await expect(page.getByText('shown only once')).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('abc123deadbeef')).not.toBeVisible();
  });
});
