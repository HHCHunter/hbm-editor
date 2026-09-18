import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const GAME = path.join(tmpdir(), 'hbm-e2e-4791', 'game');

test('a material shows as a graph of its textures and features, linked to textures and objects', async ({ page }) => {
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

  // Alt+3 opens Materials; the table lists the scene's one material with its users.
  await page.keyboard.press('Alt+3');
  const table = page.getByRole('grid', { name: 'Materials' });
  const row = table.getByRole('row', { name: /Table/ });
  await expect(row).toContainText('Standard');
  await row.click();

  // The graph: the diffuse texture feeds Base colour, which is on; the preview draws it.
  const graph = page.getByRole('group', { name: 'Material graph' });
  const texture = graph.getByRole('button', { name: /Texture mapDiffuse: Furniture\/Table_Wood, feeds Base colour/ });
  await expect(texture).toBeVisible();
  await expect(graph.getByRole('button', { name: 'Base colour On' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Preview of Furniture\/Table/ })).toBeVisible();

  // The texture node's inspector links to the texture; the Textures tab opens on it.
  await texture.click();
  await expect(page.getByText('Feeds')).toBeVisible();
  await page.getByRole('button', { name: 'Furniture/Table_Wood', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Textures', selected: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Table_Wood/ })).toHaveAttribute('aria-selected', 'true');

  // …and the texture's material list links back.
  await page.locator('.tex-detail').getByRole('button', { name: /Furniture\/Table/ }).click();
  await expect(page.getByRole('tab', { name: 'Materials', selected: true })).toBeVisible();

  // The objects using it select and frame in the scene, which is showing beside the browsers.
  await page.getByRole('button', { name: /Table_01/ }).click();
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect(tree).toHaveAttribute('aria-selected', 'true');
});
