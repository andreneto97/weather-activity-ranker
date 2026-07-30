import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Zero critical/serious accessibility violations on the two main pages.
 * We do NOT gate on "moderate" or "minor" — those are often stylistic and
 * we'd chase our tail; the spec is deliberate about picking a real bar.
 */
test.describe('a11y: no critical or serious violations', () => {
  test('landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /where should you go\?/i })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const impactful = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(impactful, JSON.stringify(impactful, null, 2)).toEqual([]);
  });

  test('ranking page', async ({ page }) => {
    await page.goto('/city/Lisbon');
    await expect(page.getByRole('heading', { name: 'Lisbon' })).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const impactful = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(impactful, JSON.stringify(impactful, null, 2)).toEqual([]);
  });
});
