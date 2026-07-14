import { test, expect } from '@playwright/test';

test('contact form: fill, submit, see success', async ({ page }) => {
  await page.goto('/contact');

  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('Email (Gmail only)').fill('testuser@gmail.com');
  await page.getByLabel('Message').fill('This is a test message for Playwright.');

  // Wait for Turnstile to inject its token before submitting —
  // otherwise the client-side check blocks submission.
  await page.waitForFunction(() => {
    const input = document.querySelector('[name="cf-turnstile-response"]');
    return input && input.value.length > 0;
  }, { timeout: 15000 });

  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-success')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#form-success')).toContainText('Message sent!');
});