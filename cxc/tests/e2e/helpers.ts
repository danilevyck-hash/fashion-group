import { Page, expect } from "@playwright/test";

/**
 * Login with a role password via the login page.
 * Waits for redirect to dashboard (or reebok for cliente).
 */
export async function login(page: Page, password: string, expectPath = "/plantillas") {
  await page.goto("/");
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${expectPath}**`, { timeout: 15_000 });
}

/**
 * Navigate to a module from dashboard by clicking its card.
 * Returns when the new page URL matches the expected path.
 */
export async function navigateToModule(page: Page, href: string) {
  // Click the card that links to this module
  await page.click(`[href="${href}"], [onclick*="${href}"]`).catch(() => {
    // Cards use onClick with router.push, not href — click by text or data
  });
  await page.waitForURL(`**${href}**`, { timeout: 10_000 });
}

/**
 * Wait for a table to load (has at least one <tr> in tbody).
 */
export async function waitForTable(page: Page) {
  await page.waitForSelector("tbody tr", { timeout: 10_000 });
}

/**
 * Wait for a toast message to appear.
 */
export async function waitForToast(page: Page, text?: string) {
  const sel = text
    ? `text=${text}`
    : '[class*="fixed"][class*="bottom"]';
  await page.waitForSelector(sel, { timeout: 5_000 });
}

/**
 * Check that a new tab/popup opens with a URL matching the pattern.
 */
export async function expectPopup(page: Page, action: () => Promise<void>, urlPattern: RegExp) {
  const [popup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 5_000 }),
    action(),
  ]);
  expect(popup.url()).toMatch(urlPattern);
  await popup.close();
}
