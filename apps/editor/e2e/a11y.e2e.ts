import { tmpdir } from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const GAME = path.join(tmpdir(), 'hbm-e2e-4791', 'game');

/** Serious and critical axe violations, as readable lines. The 3D canvas is left out. */
async function violations(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas');
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n  ')}`);
}

async function openScene(page: Page) {
  await page.goto('/?scene=M01/M01_main');
  const picker = page.getByRole('dialog', { name: 'Choose Hitman: Blood Money' });
  const tree = page.getByRole('treeitem', { name: /Table_01/ });
  await expect(picker.or(tree)).toBeVisible();
  if (await picker.isVisible()) {
    await picker.getByRole('textbox', { name: 'Game folder' }).fill(GAME);
    await picker.getByRole('button', { name: 'Use Path' }).click();
    await page.getByRole('dialog', { name: 'Open Scene' }).locator('[data-scene="M01/M01_main"]').dblclick();
  }
  await expect(tree).toBeVisible();
}

test('the ui gallery has no serious accessibility problems', async ({ page }) => {
  await page.goto('/?gallery');
  await expect(page.getByTestId('gallery')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('the gallery dialog and open menus have no serious accessibility problems', async ({ page }) => {
  await page.goto('/?gallery');
  await page.getByRole('button', { name: 'Open Dialog…' }).click();
  await expect(page.getByRole('dialog', { name: 'Open Scene' })).toBeVisible();
  expect(await violations(page, '[role=dialog]')).toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByRole('menuitem', { name: 'File' }).click();
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  expect(await violations(page, '[role=menu]')).toEqual([]);
});

test('the editor with a scene open has no serious accessibility problems', async ({ page }) => {
  await openScene(page);
  await page.getByRole('treeitem', { name: /Table_01/ }).click();
  await expect(page.getByRole('table', { name: 'Properties' })).toContainText('Furniture/Table');
  expect(await violations(page)).toEqual([]);

  for (const tab of ['Textures', 'Localisation', 'Scripts', 'Animations']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tabpanel', { name: tab })).toBeVisible();
    await expect(page.locator('.ui-panel-state--loading')).toHaveCount(0);
    expect(await violations(page, '[role=tabpanel]:not([hidden])'), tab).toEqual([]);
  }
});

test('the game picker, settings, palette and shortcut dialogs have no serious accessibility problems', async ({ page }) => {
  await openScene(page);
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  expect(await violations(page, '[role=dialog]')).toEqual([]);
  await page.keyboard.press('Escape');

  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  expect(await violations(page, '[role=dialog]')).toEqual([]);
  await page.keyboard.press('Escape');

  await page.keyboard.press('Shift+/');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  expect(await violations(page, '[role=dialog]')).toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Choose Game…' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose Hitman: Blood Money' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await violations(page, '[role=dialog]')).toEqual([]);
});
