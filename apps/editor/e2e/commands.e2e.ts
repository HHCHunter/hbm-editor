import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const GAME = path.join(tmpdir(), 'hbm-e2e-4791', 'game');

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

test('the command palette finds and runs commands, and says why one cannot run', async ({ page }) => {
  await openScene(page);
  const wireframe = page.getByRole('menuitemcheckbox', { name: 'Wireframe' });

  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('wirefr');
  await expect(palette.getByRole('option').first()).toContainText('Wireframe');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();

  // The menu shows the new state.
  await page.getByRole('menuitem', { name: 'View' }).click();
  await expect(wireframe).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // F1 opens it too; a command that can't run explains itself and the palette stays open.
  await page.keyboard.press('F1');
  await page.keyboard.type('frame selected');
  await page.keyboard.press('Enter');
  await expect(palette.getByRole('alert')).toContainText('Select one or more objects first');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('@ in the palette finds a scene object, selects it and frames it', async ({ page }) => {
  await openScene(page);
  await page.keyboard.press('Control+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette.getByRole('combobox')).toHaveValue('@');
  await page.keyboard.type('tabl');
  await expect(palette.getByRole('option', { name: /Table_01/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Table_01/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status').first()).toContainText('Frame selected');
});

test('shortcuts can be changed, are remembered, and only act on the view that is showing', async ({ page }) => {
  await openScene(page);
  await page.getByRole('treeitem', { name: /Table_01/ }).click();

  // Frame Selected moves from F to K.
  await page.keyboard.press('Shift+/');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('frame selected');
  const row = dialog.getByRole('row', { name: /Frame Selected/ });
  await row.getByRole('button', { name: 'Remove F from Frame Selected' }).click();
  await row.getByRole('button', { name: 'Add Key for Frame Selected' }).click();
  await page.keyboard.press('Control+W');
  await expect(row).toContainText('belongs to the browser');
  await page.keyboard.press('k');
  await expect(row.locator('kbd')).toHaveText('K');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The menu lists the new key, and it survives a reload.
  await page.reload();
  await expect(page.getByRole('treeitem', { name: /Table_01/ })).toBeVisible();
  await page.getByRole('menuitem', { name: 'View' }).click();
  await expect(page.getByRole('menuitem', { name: /Frame Selected/ })).toHaveAttribute('aria-keyshortcuts', 'K');
  await page.keyboard.press('Escape');

  // K frames the selection in the scene view, and does nothing while another tab is showing.
  await page.getByRole('treeitem', { name: /Table_01/ }).click();
  const status = page.getByRole('status').first();
  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('tab', { name: 'Textures', selected: true })).toBeVisible();
  await page.keyboard.press('k');
  await expect(status).not.toContainText('Frame selected');
  await page.keyboard.press('Alt+1');
  await page.getByRole('treeitem', { name: /Table_01/ }).click();
  await page.keyboard.press('k');
  await expect(status).toContainText('Frame selected');

  // Reset everything for the other tests.
  await page.keyboard.press('Shift+/');
  await dialog.getByRole('button', { name: 'Reset All to Defaults' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
});
