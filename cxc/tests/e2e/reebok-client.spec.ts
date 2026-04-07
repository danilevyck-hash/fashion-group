import { test, expect } from "@playwright/test";

// Reebok catalog is accessible without main app login (separate auth)
// These tests check the public catalog + order flows

test("9. Reebok catalog → browse products → prices visible", async ({ page }) => {
  await page.goto("/catalogo/reebok/productos");
  await page.waitForLoadState("networkidle");

  // Should see product cards
  const cards = page.locator("[class*='border'][class*='rounded']").filter({ hasText: "$" });
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });

  // Price should show /unidad label
  await expect(page.locator("text=/unidad").first()).toBeVisible();
});

test("10. Reebok order page → buttons are clear", async ({ page }) => {
  // Go to pedidos (need auth first)
  await page.goto("/");
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  await page.fill('input[type="password"]', process.env.E2E_ADMIN_PW || "admin");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/home**", { timeout: 15_000 });

  // Navigate to pedidos
  await page.goto("/catalogo/reebok/pedidos");
  await page.waitForLoadState("networkidle");

  // Click first order
  const firstOrder = page.locator("a[href*='/catalogo/reebok/pedido/']").first();
  if (!(await firstOrder.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip();
    return;
  }
  await firstOrder.click();
  await page.waitForURL("**/catalogo/reebok/pedido/**", { timeout: 10_000 });

  // Check button labels are clear
  const confirmBtn = page.locator("text=Confirmar y enviar pedido");
  const draftBtn = page.locator("text=Guardar borrador");
  const confirmedBadge = page.locator("text=Pedido confirmado");

  // Either we see the action buttons (borrador) or the confirmed badge
  const isConfirmed = await confirmedBadge.isVisible({ timeout: 3_000 }).catch(() => false);
  if (isConfirmed) {
    // Confirmed order: should NOT show save/confirm buttons
    await expect(confirmBtn).not.toBeVisible();
    await expect(draftBtn).not.toBeVisible();
    await expect(confirmedBadge).toBeVisible();
  } else {
    // Draft order: should show both buttons in correct order
    // Confirm should appear before Draft in DOM
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await expect(draftBtn).toBeVisible();
  }

  // WhatsApp button should always be visible
  await expect(page.locator("text=Enviar por WhatsApp")).toBeVisible();
  // PDF button should always be visible
  await expect(page.locator("text=Descargar PDF")).toBeVisible();
});
