import { test, expect } from '@playwright/test';
test('protected Harness proposal can be edited, approved by another publisher, and merged', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  const token = await login('demo@skillshare.test', 'SkillShare-Demo-2026!');
  const headers = { Origin: origin, Authorization: 'Bearer ' + token };
  const initial = [{ path: 'AGENTS.md', content: 'Initial approved instructions.\n' }];
  const created = await request.post('http://localhost:4000/api/harnesses', {
    headers,
    data: {
      name: 'Collaboration browser ' + Date.now(),
      slug: 'collaboration-browser-' + Date.now(),
      description: 'Validate protected drafts and reviewed native contributions.',
      visibility: 'private',
      files: initial,
    },
  });
  expect(created.status()).toBe(201);
  const h = await created.json();
  expect(
    (
      await request.post('http://localhost:4000/api/harnesses/' + h.id + '/members', {
        headers,
        data: { email: 'admin@skillshare.test', role: 'publisher' },
      })
    ).status(),
  ).toBe(204);
  await page.goto('/login');
  await page.getByLabel('Email address').fill('demo@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/harnesses/' + h.id + '/changes');
  await page.getByText('Team access & draft protection', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Require approved change proposals' }).check();
  await expect(page.getByText('Approved proposals required', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await page.getByLabel('Change title').fill('Improve native instructions');
  await page.getByLabel('Why this change is useful').fill('Add a concrete review step.');
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Updated reviewed instructions.\n');
  await page.getByRole('button', { name: 'Review differences', exact: true }).click();
  await expect(page.getByLabel('Compare AGENTS.md')).toBeVisible();
  await page.getByRole('button', { name: 'Submit proposal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Proposal submitted');
  await expect(page).toHaveURL(/\?proposal=/);
  const proposalURL = page.url();
  expect(
    (await (await request.get('http://localhost:4000/api/harnesses/' + h.id, { headers })).json())
      .files,
  ).toEqual(initial);
  await expect(page.getByRole('button', { name: 'Approve snapshot', exact: true })).toHaveCount(0);
  const reviewer = await browser.newContext({ baseURL: origin });
  const review = await reviewer.newPage();
  try {
    await review.goto('/login');
    await review.getByLabel('Email address').fill('admin@skillshare.test');
    await review.getByLabel('Password', { exact: true }).fill('SkillShare-Admin-2026!');
    await review.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(review).not.toHaveURL(/\/login/);
    await review.goto('/harnesses/' + h.id + '/changes');
    await expect(review.getByText('Your role:', { exact: false })).toContainText('publisher');
    await expect(review.getByText('Team access & draft protection', { exact: true })).toHaveCount(
      0,
    );
    await review.getByRole('button', { name: /Improve native instructions/ }).click();
    await review.getByLabel('Review comment').fill('Checked the exact diff.');
    await review.getByRole('button', { name: 'Approve snapshot', exact: true }).click();
    await expect(review.getByText(/Approved by /)).toBeVisible();
    await review.getByRole('button', { name: 'Merge proposal', exact: true }).click();
    await expect(review.getByRole('status')).toContainText('Proposal merged');
    expect(
      (await (await request.get('http://localhost:4000/api/harnesses/' + h.id, { headers })).json())
        .files,
    ).toEqual([{ path: 'AGENTS.md', content: 'Updated reviewed instructions.\n' }]);
    await review.goto('/harnesses/' + h.id + '/edit');
    await expect(review.getByText('Changes require approval.', { exact: false })).toBeVisible();
    await expect(review.getByRole('button', { name: 'New skill', exact: true })).toHaveCount(0);
    await expect(
      review.getByRole('button', { name: 'Review & publish', exact: false }),
    ).toBeVisible();
    await review.goto(proposalURL);
    await expect(
      review.getByRole('heading', { name: /Improve native instructions.*merged/ }),
    ).toBeVisible();
    const endpoint = 'http://localhost:4000/api/harnesses/' + h.id;
    const current = await (await request.get(endpoint, { headers })).json();
    expect(
      (
        await request.post(endpoint + '/proposals', {
          headers,
          data: {
            title: 'Rebase conflicting contribution',
            revision: current.revision,
            files: [{ path: 'AGENTS.md', content: 'Proposed conflicting instructions.\n' }],
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await request.put(endpoint + '/policy', { headers, data: { requireReview: false } })
      ).status(),
    ).toBe(204);
    expect(
      (
        await request.put(endpoint + '/files', {
          headers,
          data: {
            revision: current.revision,
            files: [
              { path: 'AGENTS.md', content: 'Independent current instructions.\n' },
              {
                path: '.claude/agents/independent.md',
                content: 'Preserve this independent agent.\n',
              },
            ],
          },
        })
      ).status(),
    ).toBe(200);
    await review.goto('/harnesses/' + h.id + '/changes');
    await review.getByRole('button', { name: /Rebase conflicting contribution/ }).click();
    await expect(
      review.getByRole('button', { name: 'Merge proposal', exact: true }),
    ).toBeDisabled();
    await review.getByRole('button', { name: 'Update against current draft', exact: true }).click();
    await expect(
      review.getByRole('button', { name: 'Submit proposal', exact: true }),
    ).toBeDisabled();
    await review.getByRole('button', { name: 'Keep proposed file', exact: true }).click();
    await review.getByRole('button', { name: 'Submit proposal', exact: true }).click();
    await expect(review.getByRole('status')).toContainText('Proposal submitted');
    await expect(review.getByRole('button', { name: 'Approve snapshot', exact: true })).toHaveCount(
      0,
    );
    const proposals = (await (await request.get(endpoint + '/proposals', { headers })).json())
      .items;
    const rebased = proposals
      .filter((p: { title: string }) => p.title === 'Rebase conflicting contribution')
      .find((p: { baseRevision: number }) => p.baseRevision === current.revision + 1);
    expect(rebased).toBeTruthy();
    const snapshot = await (
      await request.get(endpoint + '/proposals/' + rebased.id, { headers })
    ).json();
    expect(snapshot.reviews).toEqual([]);
    expect(snapshot.files).toContainEqual({
      path: '.claude/agents/independent.md',
      content: 'Preserve this independent agent.\n',
    });
    expect(snapshot.files).toContainEqual({
      path: 'AGENTS.md',
      content: 'Proposed conflicting instructions.\n',
    });
    expect(errors).toEqual([]);
  } finally {
    await reviewer.close();
  }
});
