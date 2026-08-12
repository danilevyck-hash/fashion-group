// Click-through REAL de los tres niveles de Marketing (12-ago-2026). SOLO
// LECTURA: navega, busca y abre modales — nunca toca Cerrar, ZIP ni Guardar.
// Verifica: drill-down con push (Atrás deshace UN nivel), el salto de las
// marcas de un solo período, el redirect legacy ?bloque=, la resolución por
// código y el detalle de Multifashion.
//   PORT=3141 node scripts/_verif-marketing-niveles-click.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";
const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? "3141"}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
await ctx.addInitScript(() => { try { sessionStorage.setItem("cxc_role", "admin"); } catch {}; try { delete Navigator.prototype.serviceWorker; } catch {} });
const page = await ctx.newPage();
const u = () => page.url().replace(BASE, "");
const check = (cond, msg) => console.log(`${cond ? "✅" : "❌"} ${msg}`);

// 1. Nivel 1 → tocar Calvin Klein → nivel 2
await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Abrir Calvin Klein/ }).click();
await page.waitForTimeout(1200);
check(u() === "/marketing/calvin-klein", `nivel1 → nivel2: ${u()}`);

// 2. Tocar el período abierto → nivel 3
await page.getByRole("button", { name: "Abrir Período 2026" }).click();
await page.waitForTimeout(1200);
check(u() === "/marketing/calvin-klein/periodo-2026", `nivel2 → nivel3: ${u()}`);

// 3. Abrir el detalle de General (modal)
await page.getByRole("button", { name: /gastos sin cliente/ }).click();
await page.waitForTimeout(500);
const modal = await page.textContent("body");
check(modal.includes("Impulsadoras y gastos sin cliente de Período 2026"), "modal General abierto con su período");
check((modal.match(/Impulsadora/g) || []).length >= 3, "items de impulsadora listados");
await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();
await page.waitForTimeout(300);

// 4. Buscador: filtra dentro del período sin tocar el total
await page.fill('input[type="search"]', "nova");
await page.waitForTimeout(1200);
let txt = await page.textContent("main");
check(txt.includes("Nova Lux") && !txt.includes("General"), "búsqueda filtra filas (General se esconde)");
check(txt.includes("$5,840.00"), "el total del período NO cambia con la búsqueda");
await page.fill('input[type="search"]', "zzzz-nada");
await page.waitForTimeout(1200);
txt = await page.textContent("main");
check(txt.includes("No hay proyectos que coincidan"), "búsqueda sin match lo dice");
check(txt.includes("$5,840.00"), "total intacto con 0 resultados");
await page.fill('input[type="search"]', "");
await page.waitForTimeout(1000);

// 5. Abrir un proyecto (push ?proyecto=) y cerrarlo
await page.getByRole("button", { name: /Abrir Nova Lux/ }).click();
await page.waitForTimeout(1300);
check(u().startsWith("/marketing/calvin-klein/periodo-2026?proyecto="), `overlay con URL propia: ${u()}`);
await page.goBack();
await page.waitForTimeout(800);
check(u() === "/marketing/calvin-klein/periodo-2026", "Atrás cierra el overlay (un nivel)");

// 6. Atrás deshace un nivel por vez
await page.goBack();
await page.waitForTimeout(800);
check(u() === "/marketing/calvin-klein", `Atrás → nivel 2: ${u()}`);
await page.goBack();
await page.waitForTimeout(800);
check(u() === "/marketing", `Atrás → nivel 1: ${u()}`);

// 7. Joybees (un período): entrar y que Atrás vuelva a /marketing en UN paso
await page.getByRole("button", { name: /Abrir Joybees/ }).click();
await page.waitForTimeout(1600);
check(/\/marketing\/joybees\/periodo-2026$/.test(u()), `Joybees salta al nivel 3: ${u()}`);
await page.goBack();
await page.waitForTimeout(800);
check(u() === "/marketing", `Atrás desde Joybees → nivel 1 en UN paso: ${u()}`);

// 8. El volver del nivel 3 de Joybees dice Marketing (no rebota al nivel 2)
await page.goto(`${BASE}/marketing/joybees/periodo-2026`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
txt = await page.textContent("main");
check(txt.includes("‹ Marketing"), "volver de Joybees dice ‹ Marketing");

// 9. Redirect legacy ?bloque=CK
await page.goto(`${BASE}/marketing?bloque=CK`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
check(u() === "/marketing/calvin-klein", `legacy ?bloque=CK redirige: ${u()}`);

// 10. Código como slug + slug desconocido
await page.goto(`${BASE}/marketing/ck`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
txt = await page.textContent("main");
check(txt.includes("Calvin Klein") && txt.includes("mid 2026"), "/marketing/ck resuelve por código");
await page.goto(`${BASE}/marketing/gucci`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
txt = await page.textContent("main");
check(txt.includes("Esa marca no existe"), "slug desconocido lo dice y ofrece volver");

// 11. Multifashion: su página es su detalle
await page.goto(`${BASE}/marketing/multifashion`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
txt = await page.textContent("main");
check(txt.includes("$8,061.63") && txt.includes("Bajar ZIP"), "Multifashion = detalle con su total y su ZIP");

await browser.close();
