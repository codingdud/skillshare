import { test, expect } from '@playwright/test';

test('discovery contains Harness releases and native file links instead of legacy assets', async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Native review toolkit', exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/assets/"],a[href^="/projects/"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Skills', exact: true }).click();
  await expect(page).toHaveURL(/\?type=skill/);
  await expect(page.getByRole('link', { name: 'Skills', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByLabel('Runtime filter').selectOption('Gemini CLI');
  await expect(page.getByTestId('asset-card')).toHaveCount(1);
  await page.getByTestId('asset-card').getByTestId('asset-title').click();
  await expect(page).toHaveURL(/\/harnesses\/.+\/edit\?release=.+&file=/);
  await expect(page.getByTestId('harness-file-heading')).toContainText(
    '.gemini/skills/review-checklist/SKILL.md',
  );
  await expect(page.locator('.view-lines')).toContainText('Inspect the supplied diff.');
  await expect(page.getByTestId('harness-editor-header')).toContainText('Read only');
  await page.goto('/assets/11111111-1111-4111-8111-111111111111');
  await expect(page.getByRole('heading', { name: "This page isn't here" })).toBeVisible();
  expect(
    requests.filter((path) => path.startsWith('/api/assets') || path.startsWith('/api/projects')),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('asset-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('header navigation marks the current page and the command palette searches', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Explore', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('combobox', { name: 'Command palette search' });
  await expect(palette).toBeFocused();
  await palette.fill('code review');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/\?q=code%20review/);
  await expect(palette).toBeHidden();
  await page.keyboard.press('/');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('header title follows the current page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page-title')).toHaveText('Explore');
  await page.goto('/login');
  await expect(page.getByTestId('page-title')).toHaveText('Sign in');
});

test('mobile navigation opens from the menu button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Explore' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('saved and activity use Harnesses only', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('demo@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/harnesses$/);
  await page.goto('/?q=Native%20review%20toolkit');
  const save = page.getByRole('button', { name: 'Save Native review toolkit', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(
    page.getByRole('button', { name: 'Unsave Native review toolkit', exact: true }),
  ).toBeVisible();
  await page.goto('/saved');
  await expect(
    page.getByRole('link', { name: 'Native review toolkit', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Unsave Native review toolkit', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Native review toolkit', exact: true })).toHaveCount(
    0,
  );
  await page.goto('/activity');
  await expect(page.locator('a[href^="/assets/"],a[href^="/projects/"]')).toHaveCount(0);
});
