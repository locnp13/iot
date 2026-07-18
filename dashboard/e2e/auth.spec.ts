import { test, expect } from '@playwright/test';
import { mockLoggedOut, mockLoggedIn } from './helpers';

test.describe('Authentication', () => {
  test('unauthenticated visitor is redirected from / to /login', async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });

  test('empty login form is blocked by native required-field validation', async ({ page }) => {
    await mockLoggedOut(page);
    await page.goto('/login');
    await page.click('button[type="submit"]');
    const emailInvalid = await page.locator('#email').evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(emailInvalid).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('register -> success navigates to /login', async ({ page }) => {
    await mockLoggedOut(page);
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({ status: 201, json: { id: 1, email: 'new@b.com' } }),
    );
    await page.goto('/register');
    await page.fill('#email', 'new@b.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('register -> 409 email-in-use shows the server error, not a crash', async ({ page }) => {
    await mockLoggedOut(page);
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({ status: 409, json: { error: 'Email already in use' } }),
    );
    await page.goto('/register');
    await page.fill('#email', 'taken@b.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toHaveText('Email already in use');
    await expect(page).toHaveURL(/\/register$/);
  });

  test('login -> success navigates to /devices', async ({ page }) => {
    await mockLoggedOut(page);
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 200, json: { id: 1, email: 'a@b.com' } }),
    );
    await mockDevicesEmpty(page);
    await page.goto('/login');
    await page.fill('#email', 'a@b.com');
    await page.fill('#password', 'correct-password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/devices$/);
  });

  test('login -> wrong credentials shows a generic error, stays on /login', async ({ page }) => {
    await mockLoggedOut(page);
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 401, json: { error: 'Invalid credentials' } }),
    );
    await page.goto('/login');
    await page.fill('#email', 'a@b.com');
    await page.fill('#password', 'wrong-password');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('already-logged-in visitor to /login is redirected straight to /devices', async ({ page }) => {
    await mockLoggedIn(page);
    await mockDevicesEmpty(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/devices$/);
  });

  test('logout returns the user to /login', async ({ page }) => {
    let loggedIn = true;
    // Mirrors real backend behavior: /api/auth/me must honor the post-logout (cookie-cleared)
    // state on any refetch — e.g. a window-focus refetch racing the logout click — not just
    // return a fixed "logged in" response regardless of whether logout already happened.
    await page.route('**/api/auth/me', (route) =>
      loggedIn ? route.fulfill({ status: 200, json: { id: 1, email: 'a@b.com' } }) : route.fulfill({ status: 401, json: { error: 'Not authenticated' } }),
    );
    await mockDevicesEmpty(page);
    await page.route('**/api/auth/logout', (route) => {
      loggedIn = false;
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto('/devices');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

async function mockDevicesEmpty(page: import('@playwright/test').Page) {
  await page.route('**/api/devices', (route) => route.fulfill({ status: 200, json: [] }));
}
