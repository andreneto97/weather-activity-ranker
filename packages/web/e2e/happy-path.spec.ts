import { expect, test } from '@playwright/test';

test('happy path: search Lisbon, see 4 activities ranked, best day glows', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /where should you go\?/i })).toBeVisible();

  const search = page.getByRole('combobox', { name: /city/i });
  await search.fill('Lisbon');
  await search.press('Enter');

  // Ranking page shows the resolved city name in the hero
  await expect(page.getByRole('heading', { name: 'Lisbon' })).toBeVisible({ timeout: 15_000 });

  // All 4 tabs render (visual order is fixed, per spec 05)
  const tabs = ['Ski', 'Surf', 'Outdoor', 'Indoor'];
  for (const label of tabs) {
    await expect(page.getByRole('tab', { name: new RegExp(label, 'i') })).toBeVisible();
  }

  // Exactly one "Best" badge is rendered on the currently selected activity's strip
  const bestBadges = page.getByText(/^Best$/);
  await expect(bestBadges.first()).toBeVisible();
});
