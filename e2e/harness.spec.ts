import { test, expect } from '@playwright/test';

test('creates editable skills for each runtime and edits MCP through Monaco and explorer actions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('demo@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/harnesses/new');
  await page
    .getByLabel('Harness name', { exact: true })
    .fill('Editor Harness browser ' + Date.now());
  await page
    .getByLabel('What does this repository help people do?')
    .fill('Check skill creation and direct MCP source editing.');
  await page.getByRole('button', { name: 'Create Harness', exact: true }).click();
  await expect(page).toHaveURL(/\/harnesses\/[^/]+\/edit/);
  const url = page.url();
  async function typeSource(scope: string, value: string) {
    const editor = page.locator(scope + ' .monaco-editor').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(value);
  }
  for (const [runtime, root] of [
    ['claude-code', '.claude'],
    ['gemini-cli', '.gemini'],
    ['copilot-vscode', '.github'],
  ]) {
    await page
      .locator('.harness-editor-header')
      .getByRole('button', { name: 'New skill', exact: true })
      .click();
    await page.getByLabel('Runtime profile', { exact: true }).selectOption(runtime!);
    await page.getByLabel('Template name', { exact: true }).fill('acceptance-' + runtime);
    const content =
      '---\nname: acceptance-' +
      runtime +
      '\ndescription: Write testable criteria.\n---\n\n# Custom skill\n\nProduce three reviewed scenarios.\n';
    await typeSource('.harness-template-preview', content);
    await page.getByRole('button', { name: 'Apply reviewed files' }).click();
    await expect(page.locator('.harness-file-heading')).toContainText(
      root + '/skills/acceptance-' + runtime + '/SKILL.md',
    );
    await expect(page.locator('.harness-editor-main .view-lines')).toContainText(
      'Produce three reviewed scenarios.',
    );
    await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  }
  await page
    .locator('.harness-editor-header')
    .getByRole('button', { name: 'Add native files', exact: true })
    .click();
  await page.getByLabel('Runtime profile', { exact: true }).selectOption('gemini-cli');
  await page.getByLabel('File template').selectOption('mcp');
  await page.getByLabel('Server name').fill('delivery');
  const mcp =
    '{"mcpServers":{"delivery":{"httpUrl":"https://example.com/custom-mcp"}},"general":{"vimMode":true}}\n';
  await typeSource('.harness-template-preview', mcp);
  await page.getByRole('button', { name: 'Apply reviewed files' }).click();
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  const revised =
    '{"mcpServers":{"delivery":{"httpUrl":"https://example.com/edited-mcp"}},"general":{"vimMode":true}}\n';
  await typeSource('.harness-editor-main', revised);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page.reload();
  await page
    .locator('.harness-editor-header')
    .getByRole('button', { name: 'MCP configuration', exact: true })
    .click();
  await expect(page.locator('.harness-file-heading')).toContainText('.gemini/settings.json');
  await expect(page.locator('.harness-editor-main .view-lines')).toContainText('edited-mcp');
  await typeSource('.harness-editor-main', '{"mcpServers":');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page
    .getByRole('button', { name: '.claude/skills/acceptance-claude-code/SKILL.md', exact: true })
    .click();
  await expect(page.locator('.harness-editor-main .view-lines')).toContainText(
    'Produce three reviewed scenarios.',
  );
  await page
    .locator('.harness-editor-header')
    .getByRole('button', { name: 'MCP configuration', exact: true })
    .click();
  await expect(page.locator('.harness-file-heading')).toContainText('.gemini/settings.json');
  await typeSource('.harness-editor-main', revised);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page
    .getByRole('button', { name: '.gemini folder', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New file…', exact: true }).click();
  await page.getByLabel('File path', { exact: true }).fill('.gemini/references/checklist.md');
  await page
    .locator('.harness-path-form')
    .getByRole('button', { name: 'Create', exact: true })
    .click();
  await expect(page.locator('.harness-file-heading')).toContainText(
    '.gemini/references/checklist.md',
  );
  await typeSource('.harness-editor-main', '# Checklist\n\n- Review requirements.\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page
    .getByRole('button', { name: '.gemini/references/checklist.md', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  await page.getByLabel('New path', { exact: true }).fill('.gemini/references/review.md');
  await page
    .locator('.harness-path-form')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  await expect(page.locator('.harness-file-heading')).toContainText('.gemini/references/review.md');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page.goto(url);
  await page.getByRole('button', { name: '.gemini/references/review.md', exact: true }).click();
  await expect(page.locator('.harness-editor-main .view-lines')).toContainText(
    'Review requirements.',
  );
  const longSource =
    '# Checklist\n\n' +
    Array.from({ length: 240 }, (_, index) => '- Checklist step ' + (index + 1)).join('\n');
  await typeSource('.harness-editor-main', longSource);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page.keyboard.press('Control+Home');
  const editor = page.locator('.harness-source-editor .monaco-editor');
  const thumb = editor.locator('.scrollbar.vertical .slider');
  await expect(thumb).toBeVisible();
  await editor.hover();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => thumb.evaluate((element) => parseFloat((element as HTMLElement).style.top)))
    .toBeGreaterThan(0);
  await editor.click();
  await page.keyboard.press('Control+End');
  await expect(editor.locator('.view-lines')).toContainText('Checklist step 240');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight))
    .toBe(true);
  const regularWidth = (await editor.boundingBox())!.width;
  await page.getByRole('button', { name: 'Expand editor', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect.poll(async () => (await editor.boundingBox())!.width).toBeGreaterThan(regularWidth);
  await page.getByRole('button', { name: 'Restore layout', exact: true }).click();
  await expect(page.locator('.topbar')).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete .gemini/references/review.md', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '.gemini/references/review.md', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '.gemini/references/review.md', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  await page.setViewportSize({ width: 1440, height: 720 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight))
    .toBe(true);
  await expect.poll(async () => (await editor.boundingBox())!.height).toBeGreaterThan(300);
  await page.screenshot({
    path: '.local/screenshots/harness-editor-scroll-delete.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('one Harness edits Gemini MCP and pre/post hooks, publishes, downloads and opens publicly', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('demo@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/harnesses/new');
  await page
    .getByLabel('Harness name', { exact: true })
    .fill('Native Harness browser ' + Date.now());
  await page
    .getByLabel('What does this repository help people do?')
    .fill('Review native MCP and hooks in one repository.');
  await page.getByLabel('Release visibility').selectOption('public');
  await page.getByRole('button', { name: 'Create Harness', exact: true }).click();
  await expect(page).toHaveURL(/\/harnesses\/[^/]+\/edit/);
  const url = page.url();

  async function add(kind: string, phase?: string) {
    await page.getByRole('button', { name: 'Add native files', exact: true }).click();
    await page.getByLabel('Runtime profile', { exact: true }).selectOption('gemini-cli');
    await page.getByLabel('File template').selectOption(kind);
    if (phase) {
      await page.getByLabel('Template name', { exact: true }).fill('review');
      await page.getByLabel('When to run').selectOption(phase);
    }
    await expect(page.locator('.harness-template-preview .monaco-editor')).toBeVisible();
    await page.getByRole('tab', { name: 'Review changes', exact: true }).click();
    await expect(page.locator('.monaco-diff-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Apply reviewed files' }).click();
    await expect(page.locator('.harness-file-heading')).toContainText('.gemini/settings.json');
    await expect(page.locator('.harness-editor-header')).toContainText('Saved');
  }
  await add('mcp');
  await add('hook', 'pre');
  await add('hook', 'post');
  await expect(page.locator('.view-lines').first()).toContainText('mcpServers');
  await expect(page.locator('.view-lines').first()).toContainText('BeforeTool');
  await expect(page.locator('.view-lines').first()).toContainText('AfterTool');
  await page.getByRole('button', { name: 'Review & publish' }).click();
  await page.getByRole('button', { name: 'Publish Harness release', exact: true }).click();
  await expect(page.getByLabel('Repository version').locator('option')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download latest release' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  const versionValue = await page
    .getByLabel('Repository version')
    .locator('option')
    .last()
    .getAttribute('value');
  await page.getByLabel('Repository version').selectOption(versionValue!);
  await expect(page.getByRole('button', { name: 'Add native files', exact: true })).toHaveCount(0);
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
  await page.screenshot({
    path: '.local/screenshots/harness-mcp-hooks-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(page.locator('.harness-editor-header')).toContainText('Draft');
  await expect(
    page.locator('.harness-editor-header').getByRole('button', { name: 'New skill', exact: true }),
  ).toBeVisible();

  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  try {
    await publicPage.goto(url);
    await expect(publicPage.locator('.harness-editor-header')).toContainText('Read only');
    await expect(
      publicPage.getByRole('button', { name: 'Add native files', exact: true }),
    ).toHaveCount(0);
    await expect(publicPage.locator('.harness-explorer-delete')).toHaveCount(0);
    await expect(publicPage.locator('.view-lines').first()).toContainText('mcpServers');
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await expect(publicPage.getByRole('button', { name: 'Show files', exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        publicPage.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await expect(publicPage.locator('.harness-editor')).toHaveClass(/tree-collapsed/);
    expect(
      await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await publicPage.screenshot({
      path: '.local/screenshots/harness-mcp-hooks-mobile.png',
      fullPage: true,
    });
  } finally {
    await anonymous.close();
  }
  expect(errors).toEqual([]);
});
