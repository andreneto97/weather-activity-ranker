import { expect, test } from '@playwright/test';

test('switching activities updates the URL and re-selects the best day', async ({ page }) => {
  await page.goto('/city/Lisbon');
  await expect(page.getByRole('heading', { name: 'Lisbon' })).toBeVisible({ timeout: 15_000 });

  const skiTab = page.getByRole('tab', { name: /^Ski/i });
  await skiTab.click();

  await expect(skiTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/activity=SKIING/);
});
