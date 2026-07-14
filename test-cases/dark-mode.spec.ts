import { test, expect } from '@playwright/test';

test('dark mode toggle persists after reload', async ({ page }) => {
  await page.goto('/');

  // Capture the theme before toggling, so the test works regardless of
  // system preference / whatever the default happens to be.
  const initialTheme = await page.locator('html').getAttribute('data-theme');

  await page.locator('#theme-toggle').click();

  const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
});