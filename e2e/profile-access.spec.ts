import { test, expect } from '@playwright/test';

for (const [email, password] of [
  ['demo@skillshare.test', 'SkillShare-Demo-2026!'],
  ['admin@skillshare.test', 'SkillShare-Admin-2026!'],
]) {
  test(`direct profile access survives login for ${email}`, async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fprofile$/);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    await expect(page.getByTestId('profile-email')).toHaveText(email);
    await page.goto('/harnesses');
    await page.getByLabel('Account menu').click();
    await page
      .getByTestId('account-menu')
      .getByRole('menuitem', { name: 'Your profile', exact: true })
      .click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('profile-email')).toHaveText(email);
    await page.goto('/users/me');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('profile-email')).toHaveText(email);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Account menu').click();
    await page
      .getByTestId('account-menu')
      .getByRole('menuitem', { name: 'Edit profile', exact: true })
      .click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByLabel('Display name')).toBeVisible();
    await page.getByLabel('Account menu').click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.goto('/profile/edit');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fprofile%2Fedit$/);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByLabel('Display name')).toBeVisible();
    await page.getByLabel('Account menu').click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  });
}
