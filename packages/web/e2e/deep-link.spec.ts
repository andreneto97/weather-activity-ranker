import { expect, test } from '@playwright/test';

test('deep link `/city/Lisbon?activity=SURFING` pre-selects Surfing', async ({ page }) => {
  await page.goto('/city/Lisbon?activity=SURFING');
  const surfTab = page.getByRole('tab', { name: /^Surf/i });
  await expect(surfTab).toBeVisible({ timeout: 15_000 });
  await expect(surfTab).toHaveAttribute('aria-selected', 'true');
});
