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
    await page
      .getByRole('dialog', { name: 'Open Scene' })
      .locator('[data-scene="M01/M01_main"]')
      .dblclick();
  }
  await expect(tree).toBeVisible();
  await expect(page.locator('.hud')).toContainText('1 parts');
}

const size = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });

test('the viewport, browsers, outliner and details share the window, resized by their splitters', async ({
  page,
}) => {
  let meshRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/scene/meshes')) meshRequests++;
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await openScene(page);

  // Everything shows at once: the 3D view with the browsers under it.
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Textures', selected: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Table_Wood/ })).toBeVisible();

  // Drag the browser panel taller.
  const before = (await size(page, 'Browsers')).height;
  const bar = page.getByRole('separator', { name: 'Resize the browser panel' });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 118, { steps: 4 });
  await page.mouse.up();
  expect(Math.abs((await size(page, 'Browsers')).height - (before + 120))).toBeLessThan(4);

  // The side column resizes from the keyboard too: Left widens it.
  const side = (await size(page, 'Scene objects and properties')).width;
  await page.getByRole('separator', { name: 'Resize the side panels' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(
    Math.abs((await size(page, 'Scene objects and properties')).width - (side + 32)),
  ).toBeLessThan(2);

  // Double-click a tab to let the browsers fill the viewport's space; Shift+Space gives it back.
  await page.getByRole('tab', { name: 'Materials' }).dblclick();
  await expect(page.getByTestId('viewport')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Maximise Browser Panel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('treeitem', { name: /Table_01/ }).click();
  await page.keyboard.press('Shift+Space');
  await expect(page.getByTestId('viewport')).toBeVisible();

  // Reset Layout puts the sizes back.
  await page.getByRole('menuitem', { name: 'Window' }).click();
  await page.getByRole('menuitem', { name: 'Reset Layout' }).click();
  expect(Math.abs((await size(page, 'Browsers')).height - before)).toBeLessThan(2);
  expect(Math.abs((await size(page, 'Scene objects and properties')).width - side)).toBeLessThan(2);

  // Hiding and showing the viewport never reloads its models.
  expect(meshRequests).toBe(1);
});

test('the layout is not remembered: a reload starts from the default', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openScene(page);
  const before = (await size(page, 'Scene objects and properties')).width;
  await page.getByRole('separator', { name: 'Resize the side panels' }).focus();
  await page.keyboard.press('End');
  expect((await size(page, 'Scene objects and properties')).width).toBeGreaterThan(before + 100);
  await page.reload();
  await expect(page.getByRole('treeitem', { name: /Table_01/ })).toBeVisible();
  expect(Math.abs((await size(page, 'Scene objects and properties')).width - before)).toBeLessThan(
    2,
  );
});

test('Alt+1 moves the keyboard to the 3D view, Alt+3 to the Materials tab', async ({ page }) => {
  await openScene(page);
  await page.keyboard.press('Alt+3');
  await expect(page.getByRole('tab', { name: 'Materials' })).toBeFocused();
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('application', { name: '3D view' })).toBeFocused();
});
