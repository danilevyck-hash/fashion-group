// Verifica en la app REAL que los modales cierran con clic FUERA del cuadro.
//
// Cómo correrlo (local, contra `next start`):
//   E2E_BASE_URL=http://localhost:3311 \
//   E2E_SESSION_COOKIE='<cookie cxc_session firmada>' \
//   npx playwright test tests/e2e/modales-clic-fuera.spec.ts
//
// La cookie se firma con SESSION_SECRET reusando un session_token VIVO de
// user_sessions (solo lectura). Ver src/lib/session-cookie.ts.
// Sin E2E_SESSION_COOKIE solo corren las pruebas del catálogo público.

import { test, expect, Page, BrowserContext } from "@playwright/test";

const COOKIE = process.env.E2E_SESSION_COOKIE || "";
const BASE = process.env.E2E_BASE_URL || "https://fashiongr.com";
const conSesion = COOKIE ? test : test.skip;

async function autenticar(context: BrowserContext, page: Page) {
  const { hostname } = new URL(BASE);
  await context.addCookies([
    { name: "cxc_session", value: COOKIE, domain: hostname, path: "/", httpOnly: true, secure: BASE.startsWith("https") },
  ]);
  // El cliente lee sessionStorage.cxc_role; sin esto redirige al login.
  await page.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
  });
}

/**
 * Hace clic en la esquina superior izquierda del backdrop — bien lejos del
 * cuadro del modal, que siempre está centrado o abajo.
 */
async function clicEnBackdrop(page: Page, backdrop: ReturnType<Page["locator"]>) {
  const caja = await backdrop.boundingBox();
  if (!caja) throw new Error("El backdrop no tiene caja — ¿el modal no está abierto?");
  await page.mouse.move(caja.x + 12, caja.y + 12);
  await page.mouse.down();
  await page.mouse.up();
}

// ── 1. Catálogo público (sin sesión): modal "Cantidad de bultos" ──
test("catálogo: el modal de cantidad cierra con clic fuera", async ({ page }) => {
  await page.goto(`${BASE}/catalogo-publico/reebok`);
  const agregar = page.getByRole("button", { name: /agregar/i }).first();
  await agregar.waitFor({ timeout: 20_000 });
  await agregar.click();

  const modal = page.locator("div.fixed.inset-0").filter({ hasText: /bultos|cantidad/i }).last();
  await expect(modal).toBeVisible();
  await clicEnBackdrop(page, modal);
  await expect(modal).toBeHidden();
});

// ── 2. Cheques: modal de detalle (Modal genérico, antes NO cerraba) ──
conSesion("cheques: el detalle cierra con clic fuera", async ({ context, page }) => {
  await autenticar(context, page);
  await page.goto(`${BASE}/cheques`);
  await page.waitForSelector("tbody tr", { timeout: 25_000 });
  await page.locator("tbody tr").first().click();

  const modal = page.locator("div.fixed.inset-0.z-50").first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await clicEnBackdrop(page, modal);
  await expect(modal).toBeHidden();
});

// ── 3. Destructivo: el clic fuera CANCELA, nunca ejecuta ──
conSesion("destructivo: el clic fuera cancela y no elimina", async ({ context, page }) => {
  await autenticar(context, page);
  await page.goto(`${BASE}/cheques`);
  await page.waitForSelector("tbody tr", { timeout: 25_000 });
  const filasAntes = await page.locator("tbody tr").count();

  // Abre el confirm de eliminar desde el menú de acciones de la fila.
  await page.locator("tbody tr").first().click({ button: "right" });
  const eliminar = page.getByText(/eliminar/i).first();
  await eliminar.click();

  const modal = page.locator("div.fixed.inset-0").filter({ hasText: /eliminar/i }).last();
  await expect(modal).toBeVisible();
  await clicEnBackdrop(page, modal);
  await expect(modal).toBeHidden();
  // Nada se borró: mismo número de filas.
  await expect(page.locator("tbody tr")).toHaveCount(filasAntes);
});

// ── 4. BottomSheet móvil (390px) ──
test.describe("móvil 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  conSesion("préstamos: el BottomSheet cierra con clic fuera", async ({ context, page }) => {
    await autenticar(context, page);
    await page.goto(`${BASE}/prestamos`);
    await page.waitForSelector("li", { timeout: 25_000 });
    await page.locator("li").first().click();

    const sheet = page.locator("div.fixed.inset-0.z-50").first();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    // El backdrop del BottomSheet es el primer hijo absoluto.
    const backdrop = sheet.locator("div.absolute.inset-0").first();
    await clicEnBackdrop(page, backdrop);
    await expect(sheet).toBeHidden();
  });
});

// ── 5. Admin usuarios: formulario intacto cierra, formulario tocado NO ──
conSesion("usuarios: el formulario a medio llenar no se pierde por un clic", async ({ context, page }) => {
  await autenticar(context, page);
  await page.goto(`${BASE}/admin/usuarios`);
  const nuevo = page.getByRole("button", { name: /nuevo usuario|\+ usuario/i }).first();
  await nuevo.waitFor({ timeout: 25_000 });

  // (a) intacto → cierra
  await nuevo.click();
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  const backdrop = page.locator("div.fixed.inset-0.z-50").first();
  await clicEnBackdrop(page, backdrop);
  await expect(modal).toBeHidden();

  // (b) con datos escritos → NO cierra
  await nuevo.click();
  await expect(modal).toBeVisible();
  await modal.locator("input").first().fill("Prueba clic fuera");
  await clicEnBackdrop(page, page.locator("div.fixed.inset-0.z-50").first());
  await expect(modal).toBeVisible();
  // Y Escape tampoco lo cierra mientras haya datos sin guardar.
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
});

// ── 6. Data health: detalle del check cierra con clic fuera y con Escape ──
conSesion("data-health: el detalle cierra con clic fuera y con Escape", async ({ context, page }) => {
  await autenticar(context, page);
  await page.goto(`${BASE}/admin/data-health`);
  const fila = page.locator("tbody tr").first();
  await fila.waitFor({ timeout: 25_000 });
  await fila.click();

  const modal = page.locator("div.fixed.inset-0.z-50").first();
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await clicEnBackdrop(page, modal);
  await expect(modal).toBeHidden();

  await fila.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});
