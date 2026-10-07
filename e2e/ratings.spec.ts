import { test, expect } from '@playwright/test';

test('a non-owner rates a public Harness, sees the average on the card, and owners cannot rate', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = 'http://localhost:5173';
  const login = async (email: string, password: string) =>
    (
      await (
        await request.post('http://localhost:4000/api/auth/login', {
          headers: { Origin: origin },
          data: { email, password },
        })
      ).json()
    ).accessToken;
  const owner = {
    Origin: origin,
    Authorization: 'Bearer ' + (await login('demo@skillshare.test', 'SkillShare-Demo-2026!')),
  };
  const stamp = Date.now();
  const name = 'Rated Harness ' + stamp;
  const created = await request.post('http://localhost:4000/api/harnesses', {
    headers: owner,
    data: {
      name,
      slug: 'rated-harness-' + stamp,
      description: 'Harness used to verify star ratings and reviews.',
      visibility: 'public',
      files: [{ path: 'AGENTS.md', content: 'Rating acceptance instructions.\n' }],
    },
  });
  expect(created.status()).toBe(201);
  const harness = await created.json();
  const published = await request.post(
    'http://localhost:4000/api/harnesses/' + harness.id + '/releases',
    {
      headers: owner,
      data: { revision: harness.revision, version: '1.0.0', notes: 'First public release.' },
    },
  );
  expect(published.status()).toBe(201);
  const reviews = '/harnesses/' + harness.id + '/reviews';

  const guest = await browser.newContext();
  const visitor = await guest.newPage();
  try {
    await visitor.goto(reviews);
    await expect(visitor.getByTestId('rating-count')).toHaveText('0 reviews');
    await expect(visitor.getByRole('link', { name: 'Sign in', exact: true }).last()).toBeVisible();
    await expect(visitor.getByRole('radiogroup')).toHaveCount(0);
  } finally {
    await guest.close();
  }

  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Admin-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(reviews);
  await expect(page.getByRole('heading', { name: 'Ratings and reviews' })).toBeVisible();
  await page.getByRole('button', { name: /^Post review$/ }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a star rating');
  await page.getByRole('radio', { name: /^4 stars/ }).click();
  await page.getByLabel(/Share details/).fill('Clear instructions and easy to adopt.');
  await page.getByRole('button', { name: 'Post review', exact: true }).click();
  await expect(page.getByTestId('rating-average')).toHaveText('4.0');
  await expect(page.getByTestId('rating-count')).toHaveText('1 review');
  await expect(page.getByTestId('review-item')).toContainText('Clear instructions');

  await page.getByRole('radio', { name: /^5 stars/ }).click();
  await page.getByRole('button', { name: 'Update review', exact: true }).click();
  await expect(page.getByTestId('rating-average')).toHaveText('5.0');
  await expect(page.getByTestId('rating-count')).toHaveText('1 review');

  await page.goto('/?q=' + encodeURIComponent(name));
  const card = page.getByTestId('asset-card').filter({ hasText: name }).first();
  await expect(card.getByTestId('rating-inline')).toContainText('5.0');
  await card.getByTestId('rating-inline').click();
  await expect(page).toHaveURL(new RegExp(reviews + '$'));

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/screenshots/reviews-mobile.png', fullPage: true });

  await page.getByRole('button', { name: 'Delete review', exact: true }).click();
  await expect(page.getByTestId('rating-count')).toHaveText('0 reviews');
  await expect(page.getByTestId('review-item')).toHaveCount(0);

  const ownerRating = await request.put(
    'http://localhost:4000/api/harnesses/' + harness.id + '/ratings/me',
    { headers: owner, data: { rating: 5 } },
  );
  expect(ownerRating.status()).toBe(403);
  expect(errors).toEqual([]);
});
