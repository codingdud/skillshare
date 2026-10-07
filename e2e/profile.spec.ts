import { test, expect } from '@playwright/test';
import type { OwnUserProfile } from '../packages/contracts/src/profiles';

test('creator profile editing, privacy, conflicts, account menu, and responsive themes', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const auth = await request.post('http://localhost:4000/api/auth/login', {
    headers: { Origin: 'http://localhost:5173' },
    data: { email: 'demo@skillshare.test', password: 'SkillShare-Demo-2026!' },
  });
  expect(auth.ok()).toBe(true);
  const token = (await auth.json()).accessToken;
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer ' + token };
  const original: OwnUserProfile = await (
    await request.get('http://localhost:4000/api/users/me', { headers })
  ).json();
  const savedValues = (profile: OwnUserProfile) => ({
    name: profile.name,
    bio: profile.bio,
    location: profile.location,
    company: profile.company,
    website: profile.website,
    github: profile.github,
    revision: profile.account.revision,
  });
  let anonymous;
  try {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('demo@skillshare.test');
    await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/harnesses$/);
    await page.getByLabel('Account menu').click();
    await page.getByRole('menuitem', { name: 'Your profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    await expect(page.getByTestId('profile-email')).toHaveText(original.account.email);
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
    await page.getByLabel('Display name').fill('SkillShare Profile Test');
    await page
      .getByLabel('Bio', { exact: true })
      .fill('I build practical code review Harnesses for Claude Code, Gemini CLI, and Copilot.');
    await page.getByLabel('Location', { exact: true }).fill('Bhubaneswar, India');
    await page.getByLabel('Company or team').fill('SkillSync');
    await page.getByLabel('GitHub username').fill('skillsync');
    await page.getByLabel('Website', { exact: true }).fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByLabel('Website', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByLabel('Bio', { exact: true })).toHaveValue(/practical code review/);
    await page.getByLabel('Website', { exact: true }).fill('https://example.com');
    await page.route('**/api/users/me', async (route) => {
      if (route.request().method() === 'PATCH')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Temporary test failure; your edits are preserved.',
            },
          }),
        });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary test failure');
    await expect(page.getByLabel('Bio', { exact: true })).toHaveValue(/practical code review/);
    await page.unroute('**/api/users/me');
    const concurrent = await request.patch('http://localhost:4000/api/users/me', {
      headers,
      data: { ...savedValues(original), bio: 'Saved by another session.' },
    });
    expect(concurrent.ok()).toBe(true);
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review the latest profile' })).toBeVisible();
    await expect(page.getByTestId('profile-conflict')).toContainText('Saved by another session.');
    await page.getByRole('button', { name: 'Keep my edits', exact: true }).click();
    await expect(page.getByLabel('Bio', { exact: true })).toHaveValue(/practical code review/);
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('profile-identity').locator('h2')).toHaveText(
      'SkillShare Profile Test',
    );
    await expect(page.getByTestId('workspace-label')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('profile-bio')).toContainText('practical code review');
    await page.screenshot({ path: '.local/screenshots/profile-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: '.local/screenshots/profile-dark.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('profile-identity')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/profile-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
    await expect(page.getByLabel('Display name')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/profile-edit-mobile.png', fullPage: true });
    anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto('http://localhost:5173/users/' + original.id);
    await expect(visitor.getByTestId('profile-identity').locator('h2')).toHaveText(
      'SkillShare Profile Test',
    );
    await expect(visitor.getByText(original.account.email, { exact: true })).toHaveCount(0);
    await expect(visitor.getByRole('link', { name: 'Edit profile', exact: true })).toHaveCount(0);
    await expect(visitor.getByLabel('Account menu')).toHaveCount(0);
    await visitor.goto('http://localhost:5173/');
    await visitor.getByTestId('asset-meta').locator('a[href^="/users/"]').first().click();
    await expect(visitor).toHaveURL(/\/users\/[\da-f-]+$/);
    await expect(
      visitor.getByRole('heading', { name: 'Creator profile', exact: true }),
    ).toBeVisible();
    const accountTrigger = page.getByRole('button', {
      name: 'Account menu',
      exact: true,
      includeHidden: true,
    });
    await accountTrigger.click();
    await expect(accountTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(accountTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await accountTrigger.click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    await page.goto('/profile/edit');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fprofile%2Fedit$/);
    expect(errors).toEqual([]);
  } finally {
    await anonymous?.close();
    const current: OwnUserProfile = await (
      await request.get('http://localhost:4000/api/users/me', { headers })
    ).json();
    const restored = await request.patch('http://localhost:4000/api/users/me', {
      headers,
      data: { ...savedValues(original), revision: current.account.revision },
    });
    expect(restored.ok()).toBe(true);
  }
});
