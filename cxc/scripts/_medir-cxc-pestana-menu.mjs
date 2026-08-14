// MEDICIÓN REAL en el navegador (build de producción + datos de producción) del
// #t198: la pestaña de Boston solo para quien la puede leer, y el menú "···" de
// 4 opciones. Solo lectura: no toca ni un dato.
//
// Los 3 anchos de la casa + el iPad acostado: 390 · 834 · 1024 · 1440.
//
// GOTCHAS que ya costaron una vuelta en este repo:
//   (1) sin sembrar `sessionStorage.cxc_role` + `fg_modules`, useAuth redirige
//       TODO al login y se mediría una pantalla vacía en verde;
//   (2) hay que borrar `Navigator.prototype.serviceWorker` ANTES de navegar o se
//       mide una página sin hidratar;
//   (3) el script FALLA si no encuentra la pestaña del grupo o el menú: medir
//       cero y dar verde sin haber mirado nada es el peor resultado posible.
//
// Uso: node scripts/_medir-cxc-pestana-menu.mjs   (BASE=http://localhost:3198)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3198";
const OUT = "/tmp/fg-t198-shots";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [390, 834, 1024, 1440];
const ROLES = ["admin", "secretaria", "vendedor"];

const MENU_ESPERADO = ["Estado de cuenta", "WhatsApp", "Enviar email", "Copiar mensaje"];

/** Textos que YA NO pueden aparecer en el menú. */
const RETIRADOS = ["Ya contacté", "Ver en directorio"];

const MODULOS = JSON.stringify(["cxc", "clientes", "catalogos", "guias"]);

async function abrir(ctx, role, ancho, url) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.addInitScript(
    ([rol, mods]) => {
      delete Navigator.prototype.serviceWorker;
      sessionStorage.setItem("cxc_role", rol);
      sessionStorage.setItem("cxc_user", "medicion-t198");
      sessionStorage.setItem("fg_modules", mods);
    },
    [role, MODULOS],
  );
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  return page;
}

/** Arrastre horizontal, recortes, blancos táctiles y textos chicos. */
const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);
  let chicos = 0, tactiles = 0;
  for (const el of document.querySelectorAll('button, a, [role="menuitem"], select, input')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44) tactiles++;
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    const texto = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!texto) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.fontSize) < 12 && !el.className.includes('sr-only')) chicos++;
  }
  return { arrastre, tactiles, chicos };
})()`;

// El asidero es `data-pestanas`, no una clase de Tailwind: buscar por clase
// devuelve media pantalla y el script pasaría en verde sin mirar la barra.
const PESTANAS = `(() => {
  const barra = document.querySelector('[data-pestanas="cxc"]');
  if (!barra) return [];
  return [...barra.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
})()`;

let fallos = 0;
const fallar = (msg) => { console.log(`   ❌ ${msg}`); fallos++; };

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();

  // ── 1. Las pestañas, rol por rol y ancho por ancho ────────────────────────
  console.log("### 1. PESTAÑAS DEL CXC (build de producción, datos de producción)\n");
  for (const role of ROLES) {
    const cookie = readFileSync(`/tmp/fg-t198-cookie-${role}.txt`, "utf8").trim();
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/" }]);

    for (const ancho of ANCHOS) {
      const page = await abrir(ctx, role, ancho, `${BASE}/admin`);
      const pestanas = await page.evaluate(PESTANAS);
      const m = await page.evaluate(MEDIR);
      const tieneBoston = pestanas.some((p) => p.includes("Boston"));
      const esperaBoston = role !== "vendedor";

      console.log(
        `  ${role.padEnd(11)} ${String(ancho).padStart(4)}px  pestañas: [${pestanas.join(" | ")}]` +
        `  · arrastre ${m.arrastre}px · <44px ${m.tactiles} · <12px ${m.chicos}`,
      );
      if (pestanas.length === 0) fallar(`${role}@${ancho}: NO se encontró ninguna pestaña (¿login?)`);
      if (!pestanas.some((p) => p.includes("Grupo"))) fallar(`${role}@${ancho}: falta la pestaña del grupo`);
      if (tieneBoston !== esperaBoston) fallar(`${role}@${ancho}: pestaña de Boston ${tieneBoston ? "PRESENTE" : "ausente"} y se esperaba lo contrario`);
      if (m.arrastre > 0) fallar(`${role}@${ancho}: ${m.arrastre}px de arrastre horizontal`);
      await page.screenshot({ path: `${OUT}/pestanas-${role}-${ancho}.png` });
      await page.close();
    }
  }

  // ── 2. ?tab=boston con un vendedor: NO se queda en Boston ─────────────────
  console.log("\n### 2. ?tab=boston con cookie de VENDEDOR\n");
  {
    const cookie = readFileSync("/tmp/fg-t198-cookie-vendedor.txt", "utf8").trim();
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/" }]);
    const page = await abrir(ctx, "vendedor", 1440, `${BASE}/admin?tab=boston`);
    const texto = await page.evaluate("document.body.innerText");
    const pestanas = await page.evaluate(PESTANAS);
    const cayoAlGrupo = !texto.includes("No se pudo cargar la cartera") && !texto.includes("se lleva aparte");
    console.log(`  pestañas: [${pestanas.join(" | ")}]`);
    console.log(`  ¿ve el error de Boston?  ${texto.includes("No se pudo cargar la cartera") ? "SÍ 🔴" : "NO ✅"}`);
    if (!cayoAlGrupo) fallar("el vendedor se quedó en la pestaña de Boston con ?tab=boston");
    if (pestanas.some((p) => p.includes("Boston"))) fallar("?tab=boston le dibujó la pestaña al vendedor");
    await page.screenshot({ path: `${OUT}/vendedor-tab-boston.png` });
    await page.close();
  }

  // ── 3. El menú "···", en los 4 anchos (escritorio y celular) ──────────────
  console.log("\n### 3. MENÚ ··· DE UNA FILA (4 opciones)\n");
  {
    const cookie = readFileSync("/tmp/fg-t198-cookie-admin.txt", "utf8").trim();
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "localhost", path: "/" }]);

    for (const ancho of ANCHOS) {
      const page = await abrir(ctx, "admin", ancho, `${BASE}/admin`);
      const trigger = page.locator('button[aria-label^="Acciones de"]:visible').first();
      await trigger.waitFor({ timeout: 30000 });
      await trigger.click();
      await page.waitForTimeout(400);
      const items = await page.evaluate(
        `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.textContent.trim())`,
      );
      const m = await page.evaluate(MEDIR);
      const fuera = await page.evaluate(`(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return null;
        const r = menu.getBoundingClientRect();
        return { izq: Math.round(r.left), der: Math.round(innerWidth - r.right), alto: Math.round(r.height) };
      })()`);
      const bajos = await page.evaluate(
        `[...document.querySelectorAll('[role="menuitem"]')].filter(b => b.getBoundingClientRect().height < 44).length`,
      );

      console.log(
        `  ${String(ancho).padStart(4)}px  ${items.length} opciones: [${items.join(" | ")}]` +
        `  · menú dentro de pantalla izq ${fuera?.izq} / der ${fuera?.der} · opciones <44px ${bajos}`,
      );
      if (items.length === 0) fallar(`${ancho}: el menú no abrió (no se midió nada)`);
      if (JSON.stringify(items) !== JSON.stringify(MENU_ESPERADO)) fallar(`${ancho}: el menú no es exactamente las 4 esperadas`);
      for (const r of RETIRADOS) if (items.some((i) => i.includes(r))) fallar(`${ancho}: volvió "${r}"`);
      if (bajos > 0) fallar(`${ancho}: ${bajos} opción(es) por debajo de 44px`);
      if (fuera && (fuera.izq < 0 || fuera.der < 0)) fallar(`${ancho}: el menú se sale de la pantalla`);
      if (m.arrastre > 0) fallar(`${ancho}: ${m.arrastre}px de arrastre con el menú abierto`);
      await page.screenshot({ path: `${OUT}/menu-${ancho}.png` });
      await page.close();
    }
  }

  await browser.close();
  console.log(fallos === 0 ? `\n✅ Todo verde. Capturas en ${OUT}` : `\n❌ ${fallos} problema(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
