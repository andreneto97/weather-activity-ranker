import { expect, test } from '@playwright/test';

test('Chamonix: Surfing renders as Not Applicable, other activities still score', async ({
  page,
}) => {
  await page.goto('/city/Chamonix');
  await expect(page.getByRole('heading', { name: /Chamonix/i })).toBeVisible({ timeout: 15_000 });

  // Force-select surf tab, then the strip should render N/A cards for all 7 days
  await page.getByRole('tab', { name: /^Surf/i }).click();
  const naLabels = page.getByText(/^N\/A$/);
  await expect(naLabels.first()).toBeVisible();
  expect(await naLabels.count()).toBe(7);

  // Meanwhile Outdoor still renders normal cards
  await page.getByRole('tab', { name: /^Outdoor/i }).click();
  await expect(page.getByText(/^Best$/)).toBeVisible();
});
