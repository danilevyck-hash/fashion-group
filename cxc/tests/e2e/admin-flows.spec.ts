import { test, expect } from "@playwright/test";
import { login, waitForTable, expectPopup } from "./helpers";

// Passwords — override via E2E_ADMIN_PW / E2E_SECRETARIA_PW env vars
const ADMIN_PW = process.env.E2E_ADMIN_PW || "admin";
const SECRETARIA_PW = process.env.E2E_SECRETARIA_PW || "secretaria";

// ── Test 1: Admin login + dashboard ──────────────────────────────────────────

test("1. Admin login → dashboard loads with KPIs", async ({ page }) => {
  await login(page, ADMIN_PW);
  // Dashboard should show greeting
  await expect(page.locator("text=Buenos")).toBeVisible({ timeout: 10_000 });
  // KPI cards should be visible (admin/director only)
  await expect(page.locator("text=Ventas del mes")).toBeVisible();
  await expect(page.locator("text=Cuentas por Cobrar")).toBeVisible();
  await expect(page.locator("text=Cheques")).toBeVisible();
  // Module cards should be visible
  await expect(page.locator("text=Guías")).toBeVisible();
  await expect(page.locator("text=Caja Menuda")).toBeVisible();
});

// ── Test 2: CXC panel loads with table ───────────────────────────────────────

test("2. Navigate to CXC → table loads", async ({ page }) => {
  await login(page, ADMIN_PW);
  await page.click("text=Cuentas por Cobrar");
  await page.waitForURL("**/admin**", { timeout: 10_000 });
  // Should see search input and client table
  await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible({ timeout: 10_000 });
  // Table should have rows (wait for data)
  await waitForTable(page);
  const rows = await page.locator("tbody tr").count();
  expect(rows).toBeGreaterThan(0);
});

// ── Test 3: CXC WhatsApp opens wa.me ─────────────────────────────────────────

test("3. CXC → click WhatsApp on client → opens wa.me", async ({ page }) => {
  await login(page, ADMIN_PW);
  await page.click("text=Cuentas por Cobrar");
  await page.waitForURL("**/admin**", { timeout: 10_000 });
  await waitForTable(page);

  // Find and click a WhatsApp button (green WA icon or text)
  const waButton = page.locator('button:has-text("WhatsApp"), button[title*="WhatsApp"]').first();
  if (await waButton.isVisible()) {
    await expectPopup(page, () => waButton.click(), /wa\.me/);
  } else {
    // If no WA button visible, client may not have phone — skip gracefully
    test.skip();
  }
});

// ── Test 4: Reebok pedido → WhatsApp ─────────────────────────────────────────

test("4. Reebok pedido → WhatsApp opens wa.me", async ({ page }) => {
  await login(page, ADMIN_PW);
  // Go to pedidos list
  await page.goto("/catalogo/reebok/pedidos");
  await page.waitForLoadState("networkidle");

  // Click first order if any
  const firstOrder = page.locator("a[href*='/catalogo/reebok/pedido/']").first();
  if (!(await firstOrder.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(); // No orders to test
    return;
  }
  await firstOrder.click();
  await page.waitForURL("**/catalogo/reebok/pedido/**", { timeout: 10_000 });

  // Click WhatsApp button
  const waBtn = page.locator('button:has-text("WhatsApp")').first();
  await expect(waBtn).toBeVisible({ timeout: 5_000 });
  await expectPopup(page, () => waBtn.click(), /wa\.me/);
});

// ── Test 5: Reclamos → send email → toast ────────────────────────────────────

test("5. Reclamos → open one → send email → toast appears", async ({ page }) => {
  await login(page, ADMIN_PW);
  await page.click("text=Reclamos");
  await page.waitForURL("**/reclamos**", { timeout: 10_000 });

  // Click first empresa card
  const empresaCard = page.locator("[class*='cursor-pointer']").first();
  await empresaCard.click();
  await page.waitForTimeout(1000);

  // Click first reclamo row
  const firstRow = page.locator("tr[class*='cursor-pointer']").first();
  if (!(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await firstRow.click();
  await page.waitForTimeout(1000);

  // Look for "Enviar por Email" button
  const emailBtn = page.locator('button:has-text("Enviar"), button:has-text("Email")').first();
  if (await emailBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await emailBtn.click();
    // Should see a toast (success or error)
    await page.waitForSelector('[class*="fixed"][class*="bottom"]', { timeout: 8_000 });
  } else {
    // Email button may not be visible if no contact configured
    test.skip();
  }
});

// ── Test 6: Cheques → depositar → toast ──────────────────────────────────────

test("6. Cheques → depositar one → toast confirms", async ({ page }) => {
  await login(page, ADMIN_PW);
  await page.click("text=Cheques");
  await page.waitForURL("**/cheques**", { timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  // Find a "Depositar" button (only on pending cheques)
  const depositBtn = page.locator('button:has-text("Depositar")').first();
  if (!(await depositBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(); // No pending cheques
    return;
  }

  await depositBtn.click();
  // Should see toast confirming deposit
  await expect(page.locator("text=depositado")).toBeVisible({ timeout: 5_000 });
});

// ── Test 7: Reclamos → export PDF → download starts ─────────────────────────

test("7. Reclamos → export PDF triggers download", async ({ page }) => {
  await login(page, ADMIN_PW);
  await page.click("text=Reclamos");
  await page.waitForURL("**/reclamos**", { timeout: 10_000 });

  // Click first empresa
  const empresaCard = page.locator("[class*='cursor-pointer']").first();
  await empresaCard.click();
  await page.waitForTimeout(1000);

  // Look for PDF export button
  const pdfBtn = page.locator('button:has-text("PDF"), a:has-text("PDF")').first();
  if (!(await pdfBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip();
    return;
  }

  // Listen for download
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    pdfBtn.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
});

// ── Test 8: Secretaria → access guias, caja, directorio ─────────────────────

test("8. Secretaria login → access guias, caja, directorio", async ({ page }) => {
  await login(page, SECRETARIA_PW);

  // Should see dashboard
  await expect(page.locator("text=Buenos")).toBeVisible({ timeout: 10_000 });

  // Navigate to Guias
  await page.click("text=Guías");
  await page.waitForURL("**/guias**", { timeout: 10_000 });
  await expect(page.locator("text=Guias de Transporte")).toBeVisible();

  // Back to dashboard
  await page.click("text=Inicio");
  await page.waitForURL("**/plantillas**", { timeout: 10_000 });

  // Navigate to Caja
  await page.click("text=Caja Menuda");
  await page.waitForURL("**/caja**", { timeout: 10_000 });

  // Back to dashboard
  await page.click("text=Inicio");
  await page.waitForURL("**/plantillas**", { timeout: 10_000 });

  // Navigate to Directorio
  await page.click("text=Directorio");
  await page.waitForURL("**/directorio**", { timeout: 10_000 });
  await expect(page.locator("text=Directorio")).toBeVisible();

  // Navigate to CXC (newly granted to secretaria)
  await page.click("text=Inicio");
  await page.waitForURL("**/plantillas**", { timeout: 10_000 });
  await page.click("text=Cuentas por Cobrar");
  await page.waitForURL("**/admin**", { timeout: 10_000 });
});
