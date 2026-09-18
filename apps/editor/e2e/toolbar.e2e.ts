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
  await expect(page.locator('.hud')).toContainText('1 parts');
}

test('the main toolbar hides, picks, sets the view mode, and greys out away from the scene', async ({ page }) => {
  await openScene(page);
  const toolbar = page.getByRole('toolbar', { name: 'Main toolbar' });
  const row = page.getByRole('treeitem', { name: /Table_01/ });

  // Hide is a toggle showing the selection's state; Unhide All sits behind its arrow.
  await row.click();
  const hide = toolbar.getByRole('button', { name: 'Hide Selection' });
  await expect(hide).toHaveAttribute('aria-pressed', 'false');
  await hide.click();
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await toolbar.getByRole('button', { name: 'More visibility options' }).click();
  await page.getByRole('menuitem', { name: 'Unhide All' }).click();
  await expect(hide).toHaveAttribute('aria-pressed', 'false');

  // Object | Group is one choice, shared with the Edit menu.
  await toolbar.getByRole('radio', { name: 'Group' }).click();
  await expect(toolbar.getByRole('radio', { name: 'Group' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Clicks Select Groups' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await toolbar.getByRole('radio', { name: 'Object' }).click();

  // The view mode menu shows the current mode.
  await toolbar.getByRole('button', { name: /^View mode/ }).click();
  await page.getByRole('menuitemradio', { name: 'Unlit' }).click();
  await expect(toolbar.getByRole('button', { name: /^View mode/ })).toContainText('Unlit');

  // With the browsers maximised over the viewport, scene-only buttons stay in place but can't be used.
  await page.getByRole('button', { name: 'Maximise Browser Panel' }).click();
  await expect(toolbar.getByRole('button', { name: 'Frame All' })).toHaveAttribute('aria-disabled', 'true');
  await expect(toolbar.getByRole('radio', { name: 'Object' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Maximise Browser Panel' }).click();
  await expect(toolbar.getByRole('button', { name: 'Frame All' })).not.toHaveAttribute('aria-disabled', 'true');

  // The search box opens the command palette.
  await toolbar.getByRole('button', { name: /Search commands/ }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Open's arrow lists recent scenes, with the open one checked.
  await toolbar.getByRole('button', { name: 'Recent scenes' }).click();
  await expect(page.getByRole('menuitemradio', { name: /M01_main/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
});

test('outliner rows have a right-click menu, also from the keyboard', async ({ page }) => {
  await openScene(page);
  const row = page.getByRole('treeitem', { name: /Table_01/ });

  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Object' });
  await expect(menu).toBeVisible();
  for (const item of ['Frame Selected', 'Isolate Selection', 'Select Parent', 'Select All of This Class', 'Copy Path']) {
    await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
  }
  await menu.getByRole('menuitem', { name: 'Show Material' }).click();
  await page.getByRole('menuitem', { name: 'Furniture/Table' }).click();
  await expect(page.getByRole('tab', { name: 'Materials', selected: true })).toBeVisible();

  // Shift+F10 on the focused row opens the same menu; Escape returns to the tree.
  const tree = page.getByRole('tree', { name: 'Scene objects' });
  await tree.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tree).toBeFocused();
});

test('on a narrow window the toolbar keeps its buttons named, then moves the view group into More', async ({ page }) => {
  await openScene(page);
  const toolbar = page.getByRole('toolbar', { name: 'Main toolbar' });
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect(toolbar.getByRole('button', { name: 'Frame All' })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(toolbar.getByRole('button', { name: 'Frame All' })).toBeHidden();
  await toolbar.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Frame All' })).toBeVisible();
  await page.keyboard.press('Escape');
});
