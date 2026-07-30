import { expect, test } from '@playwright/test';

test('ambiguous city shows a picker; selecting a row loads that location', async ({ page }) => {
  // The typeahead in SearchForm auto-resolves ambiguity by picking the
  // highlighted geocode result on Enter. The AmbiguityPicker is the fallback
  // for the URL-first entry point (shared link, deep link, JS-disabled) —
  // navigate straight to /city/Springfield to force it.
  await page.goto('/city/Springfield');

  await expect(page.getByRole('heading', { name: /did you mean/i })).toBeVisible({
    timeout: 15_000,
  });

  // At least 2 candidates are rendered (stub returns 3 for "springfield")
  const rows = page.locator('ul li button');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(2);

  await rows.first().click();
  await expect(page.getByRole('tab', { name: /outdoor/i })).toBeVisible({ timeout: 15_000 });
});
