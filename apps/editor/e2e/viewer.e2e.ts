import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const GAME = path.join(tmpdir(), 'hbm-e2e-4791', 'game');

test('choose the game, open a scene, pick the model and browse its data', async ({ page }) => {
  await page.goto('/');

  // First run: the game picker.
  const picker = page.getByRole('dialog', { name: 'Choose Hitman: Blood Money' });
  await expect(picker).toBeVisible();
  await picker.locator('input').first().fill(GAME);
  await picker.getByRole('button', { name: 'Use Path' }).click();

  // Then the scene list.
  const open = page.getByRole('dialog', { name: 'Open Scene' });
  await open.locator('[data-scene="M01/M01_main"]').dblclick();
  await expect(open).toBeHidden();
  await expect(page).toHaveTitle(/M01_main/);

  // The outliner lists the scene's one node.
  const row = page.locator('.tree-row[data-index="0"]');
  await expect(row).toContainText('Table_01');

  // Wait for the model, then click the middle of the viewport, where the camera frames it.
  const hud = page.locator('.hud');
  await expect(hud).toContainText('1 parts');
  const viewport = page.getByTestId('viewport');
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveClass(/selected/);

  // The header and grid describe it.
  await expect(page.locator('.head-input').first()).toHaveValue('Table_01');
  await expect(page.locator('.prop-row', { hasText: 'Material 1' }).locator('input')).toHaveValue('Furniture/Table');
  await expect(page.locator('.prop-row', { hasText: 'Position' }).locator('input')).toHaveValue('1, 2, 3');

  // A miss clears the selection.
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(row).not.toHaveClass(/selected/);

  // Texture browser.
  await page.getByRole('tab', { name: 'Textures' }).click();
  const cell = page.locator('[data-texture="128"]');
  await expect(cell).toContainText('Table_Wood');
  await cell.click();
  await expect(page.locator('.tex-detail')).toContainText('RGBA');
  await expect(page.locator('.tex-detail')).toContainText('1: Furniture/Table');
  const loaded = await page.locator('.tex-detail img').evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth));
  expect(loaded).toBe(2);

  // Localisation browser.
  await page.getByRole('tab', { name: 'Localisation' }).click();
  await page.locator('tr', { hasText: 'AllLevels' }).dblclick();
  await page.locator('tr', { hasText: 'Actions' }).dblclick();
  await expect(page.locator('tr', { hasText: 'Pickup' })).toContainText('Pick up');
  await page.locator('.loc-lookup input').fill('AllLevels/Actions/Pickup');
  await page.locator('.loc-lookup input').press('Enter');
  await expect(page.locator('.loc-result')).toHaveText('Pick up');
});
