import { test, expect } from '@playwright/test';

test('copy email button copies address to clipboard and shows feedback', async ({ page, context, browserName }) => {
  // Clipboard read/write needs explicit permission in Chromium.
  // (firefox/webkit are already excluded project-wide — see playwright.config.ts)
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/contact');

  const copyBtn = page.locator('#copy-email-btn');
  await expect(copyBtn).toBeVisible();

  await copyBtn.click();

  // Visible feedback: button label changes to confirm the copy happened.
  await expect(copyBtn).toHaveText('Copied!');

  // The actual clipboard content should be the real email address.
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe('urrahmanmohammadashfaq@gmail.com');

  // Feedback reverts after a couple seconds so the button is reusable.
  await expect(copyBtn).toHaveText('Copy Email', { timeout: 4000 });
});