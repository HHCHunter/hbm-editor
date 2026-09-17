import { expect, test } from '@playwright/test';

// Baselines are per platform and browser (Tahoma is a Windows font). Update them on purpose with
// `pnpm --filter @hbm/editor e2e --update-snapshots` and say why in the commit.
for (const scale of [1, 1.5, 2]) {
  test(`ui gallery at ${scale * 100}%`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/?gallery&scale=${scale}`);
    await expect(page.getByTestId('gallery')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`gallery-${scale * 100}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      // Spinners and indeterminate bars move; their shape is covered at rest elsewhere.
      mask: [page.locator('.is-spinning'), page.locator('.ui-progress-track.is-indeterminate')],
    });
  });
}

test('ui gallery in compact density', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?gallery&density=compact');
  await expect(page.getByTestId('gallery')).toBeVisible();
  await expect(page).toHaveScreenshot('gallery-compact.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('.is-spinning'), page.locator('.ui-progress-track.is-indeterminate')],
  });
});
