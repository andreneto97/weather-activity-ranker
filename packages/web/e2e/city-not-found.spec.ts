import { expect, test } from '@playwright/test';

test('unknown city renders a friendly empty state', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: /city/i });
  await search.fill('asdlkjhqwoieuh');
  await search.press('Enter');

  await expect(page.getByRole('heading', { name: /couldn.t find/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});
