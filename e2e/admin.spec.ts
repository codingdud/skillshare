import { test, expect } from '@playwright/test';

test('admin dashboard, role changes, immediate authorization, themes, and signed-out access', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const login = await request.post('http://localhost:4000/api/auth/login', {
    headers: { Origin: 'http://localhost:5173' },
    data: { email: 'admin@skillshare.test', password: 'SkillShare-Admin-2026!' },
  });
  expect(login.ok()).toBe(true);
  const auth = await login.json();
  expect(auth.user.role).toBe('admin');
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer ' + auth.accessToken };
  const demo = (
    await (
      await request.get('http://localhost:4000/api/admin/users?q=demo%40skillshare.test', {
        headers,
      })
    ).json()
  ).items[0];
  expect(demo.role).toBe('user');
  const ordinary = await browser.newContext();
  const visitor = await ordinary.newPage();
  let adminRequests = 0;
  visitor.on('request', (req) => {
    if (req.url().includes('/api/admin/')) adminRequests++;
  });
  try {
    await visitor.goto('http://localhost:5173/admin');
    await expect(visitor).toHaveURL(/\/login\?returnTo=/);
    await visitor.getByLabel('Email address').fill('demo@skillshare.test');
    await visitor.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
    await visitor.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      visitor.getByRole('heading', { name: 'Administrator access required' }),
    ).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
    expect(adminRequests).toBe(0);
    await page.goto('/login');
    await page.getByLabel('Email address').fill('admin@skillshare.test');
    await page.getByLabel('Password', { exact: true }).fill('SkillShare-Admin-2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Platform contributions' })).toBeVisible();
    await expect(page.locator('.admin-metric')).toHaveCount(4);
    await page.getByLabel('Time range').selectOption('7');
    await expect(page.locator('.admin-chart-day')).toHaveCount(7);
    await page.getByText('View daily totals', { exact: true }).click();
    await expect(page.locator('.admin-daily-data tbody tr')).toHaveCount(7);
    await page.getByText('View daily totals', { exact: true }).click();
    await page.screenshot({ path: '.local/screenshots/admin-desktop.png', fullPage: true });
    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await page.getByLabel('Search name or email').fill('demo@skillshare.test');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('.admin-page tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Make admin', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Make admin', exact: true }).click();
    await page.getByRole('button', { name: 'Change to admin', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Make user', exact: true })).toBeVisible();
    // The existing browser session gains and loses access without a new JWT/login.
    await visitor.goto('http://localhost:5173/admin');
    await expect(visitor.getByRole('heading', { name: 'Platform contributions' })).toBeVisible();
    await page.getByRole('button', { name: 'Make user', exact: true }).click();
    await page.getByRole('button', { name: 'Change to user', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Make admin', exact: true })).toBeVisible();
    await visitor.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(
      visitor.getByRole('heading', { name: 'Administrator access required' }),
    ).toBeVisible();
    await page.screenshot({ path: '.local/screenshots/admin-users.png', fullPage: true });
    await page.getByRole('link', { name: 'Harnesses', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Harness inventory' })).toBeVisible();
    await page.getByLabel('Visibility', { exact: true }).selectOption('private');
    await expect(page.getByText('Open →', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Activity log', exact: true }).click();
    await page.getByLabel('Event group').selectOption('accounts');
    await expect(page.locator('.admin-events')).toContainText('Role changed from admin to user');
    await page.getByRole('link', { name: 'Monitoring', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request performance' })).toBeVisible();
    await expect(page.locator('.admin-metric').first()).toContainText('Healthy');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: '.local/screenshots/admin-dark.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/admin-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account access' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByLabel('Account menu').click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    expect(errors).toEqual([]);
  } finally {
    const current = (
      await (
        await request.get('http://localhost:4000/api/admin/users?q=demo%40skillshare.test', {
          headers,
        })
      ).json()
    ).items[0];
    if (current.role !== demo.role)
      expect(
        (
          await request.patch(`http://localhost:4000/api/admin/users/${demo.id}/role`, {
            headers,
            data: { role: demo.role, revision: current.revision },
          })
        ).ok(),
      ).toBe(true);
    await ordinary.close();
  }
});
