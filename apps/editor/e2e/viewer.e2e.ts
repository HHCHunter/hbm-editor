import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const GAME = path.join(tmpdir(), 'hbm-e2e-4791', 'game');

test('choose the game, open a scene, pick the model and browse its data', async ({ page }) => {
  await page.goto('/');

  // First run shows the game picker; when an earlier test already chose the game, open it by hand.
  const picker = page.getByRole('dialog', { name: 'Choose Hitman: Blood Money' });
  const openDialog = page.getByRole('dialog', { name: 'Open Scene' });
  await expect(picker.or(openDialog).or(page.getByRole('treeitem').first())).toBeVisible();
  if (!(await picker.isVisible())) {
    if (await openDialog.isVisible()) await page.keyboard.press('Escape');
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Choose Game…' }).click();
  }
  await expect(picker).toBeVisible();
  await picker.getByRole('textbox', { name: 'Game folder' }).fill(GAME);
  await picker.getByRole('button', { name: 'Use Path' }).click();

  // Then the scene list.
  const open = page.getByRole('dialog', { name: 'Open Scene' });
  await open.locator('[data-scene="M01/M01_main"]').dblclick();
  await expect(open).toBeHidden();
  await expect(page).toHaveTitle(/M01_main/);

  // The outliner lists the scene's one node.
  const row = page.getByRole('treeitem', { name: /Table_01/ });
  await expect(row).toBeVisible();

  // Wait for the model, then click the middle of the viewport, where the camera frames it.
  const hud = page.locator('.hud');
  await expect(hud).toContainText('1 parts');
  const viewport = page.getByTestId('viewport');
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveAttribute('aria-selected', 'true');

  // The header and grid describe it.
  const header = page.getByRole('term').filter({ hasText: 'Name' }).locator('xpath=following-sibling::dd');
  await expect(header).toHaveText('Table_01');
  const properties = page.getByRole('table', { name: 'Properties' });
  await expect(properties.getByRole('row', { name: /Material 1/ }).getByRole('cell')).toHaveText('Furniture/Table');
  await expect(properties.getByRole('row', { name: /^Position/ }).first().getByRole('cell')).toHaveText('1, 2, 3');

  // A miss clears the selection.
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(row).toHaveAttribute('aria-selected', 'false');

  // Texture browser.
  await page.getByRole('tab', { name: 'Textures' }).click();
  const cell = page.getByRole('option', { name: /Table_Wood/ });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.locator('.tex-detail')).toContainText('RGBA');
  await expect(page.locator('.tex-detail')).toContainText('1: Furniture/Table');
  const loaded = await page.locator('.tex-detail img').evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth));
  expect(loaded).toBe(2);

  // Localisation browser: open folders with the keyboard as well as the mouse.
  await page.getByRole('tab', { name: 'Localisation' }).click();
  const table = page.getByRole('grid', { name: 'Text ids' });
  await table.getByRole('row', { name: /AllLevels/ }).dblclick();
  await table.getByRole('row', { name: /Actions/ }).click();
  await page.keyboard.press('Enter');
  await expect(table.getByRole('row', { name: /Pickup/ })).toContainText('Pick up');
  const lookup = page.getByRole('textbox', { name: /Look up a text id/ });
  await lookup.fill('AllLevels/Actions/Pickup');
  await lookup.press('Enter');
  await expect(page.locator('.loc-result')).toHaveText('Pick up');
});

test('the menus, outliner and dialogs work from the keyboard alone', async ({ page }) => {
  await page.goto('/?scene=M01/M01_main');
  const picker = page.getByRole('dialog', { name: 'Choose Hitman: Blood Money' });
  if (await picker.isVisible().catch(() => false)) {
    await picker.getByRole('textbox', { name: 'Game folder' }).fill(GAME);
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Open Scene' }).locator('[data-scene="M01/M01_main"]').dblclick();
  }
  await expect(page.getByRole('treeitem', { name: /Table_01/ })).toBeVisible();

  // F10, then arrows, open the View menu; Escape returns to the bar.
  await page.keyboard.press('F10');
  await expect(page.getByRole('menuitem', { name: 'File' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'View' })).toBeVisible();
  const grid = page.getByRole('menuitemcheckbox', { name: 'Grid' });
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // The outliner tree takes focus and selects with the arrow keys.
  const tree = page.getByRole('tree', { name: 'Scene objects' });
  await tree.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('treeitem', { name: /Table_01/ })).toHaveAttribute('aria-selected', 'true');

  // Ctrl+, opens Settings; the interface size follows the choice.
  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('combobox', { name: /Interface size/ }).click();
  await page.getByRole('option', { name: '150%' }).click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
  await settings.getByRole('button', { name: 'Reset to Defaults' }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
});
