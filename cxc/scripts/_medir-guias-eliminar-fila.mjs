// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los CUATRO anchos de «el «···» sube a la fila» (27-ago-2026).
//
// Mide `/guias` en 390 · 834 · 1024 · 1440, con la lista CERRADA (nadie abrió
// ninguna guía), en dos roles:
//   · SECRETARIA — la que Daniel nombró: tiene que ver el «···» en cada fila,
//     abrirlo de un toque y llegar a la ventana que exige escribir ELIMINAR;
//   · BODEGA — no puede borrar: no se le dibuja ni el «···».
//
// 🔴 NO SE TOCA NINGUNA GUÍA REAL. El navegador **aborta cualquier pedido que
// no sea GET**, así que el DELETE es imposible aunque alguien lo dispare; y el
// script nunca escribe la palabra ELIMINAR ni aprieta el botón rojo.
//
//   BASE=http://localhost:3479 ETAPA=antes|despues node scripts/_medir-guias-eliminar-fila.mjs
//
// ⚠️ En `ETAPA=antes` (o sea `origin/main`) el «···» vive DENTRO de la guía
// expandida: el script lo dice y cuenta los toques de ese camino, en vez de
// fallar — ésa es justamente la diferencia que se está midiendo.
//
// Gotchas de la casa: la cookie hay que MINTEARLA reusando un `session_token`
// vivo (`scripts/_cookie-medicion-rol.ts`), sembrar `sessionStorage.cxc_role` y
// borrar `Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3479";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-eliminar-fila-${ETAPA}`;
const ANCHOS = [390, 834, 1024, 1440];
const ROLES = [
  { rol: "secretaria", cookie: readFileSync("/tmp/fg-cookie-secretaria.txt", "utf8").trim() },
  { rol: "bodega", cookie: readFileSync("/tmp/fg-cookie-bodega.txt", "utf8").trim() },
];

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  // 🩸 GOTCHA: el acordeón NO desmonta las filas cerradas — las aplasta con
  // `grid-rows-[0fr]` + `overflow-hidden`. Sus botones conservan caja propia,
  // así que contar el DOM entero devuelve los de TODAS las filas.
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.clientHeight === 0 && (s.overflowY === "hidden" || s.overflow === "hidden")) return false;
    }
    return true;
  };
  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || e.getAttribute("aria-label") || e.id || e.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
    });
  const recortados = [...document.querySelectorAll("body div *")].filter((e) => {
    const s = getComputedStyle(e);
    if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
    return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
  }).length;
  const menus = [...document.querySelectorAll('[aria-haspopup="menu"]')].filter(visible);
  const cajaMenu = menus[0]?.getBoundingClientRect();
  return {
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    chicos,
    recortados,
    textoChico: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length,
    filas: [...document.querySelectorAll("button")].filter(visible)
      .filter((b) => /GT-\d+/.test(b.textContent || "")).length,
    menusEnFila: menus.length,
    menuCaja: cajaMenu ? { w: Math.round(cajaMenu.width), h: Math.round(cajaMenu.height) } : null,
    rotuloMenu: menus[0]?.getAttribute("aria-label") ?? null,
  };
};

/** Ítems del menú abierto — salen por un PORTAL a `<body>`. */
const ITEMS_ABIERTOS = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((e) => (e.textContent || "").trim());

const HAY_CONFIRMACION = () => {
  const txt = document.body.innerText;
  return {
    titulo: /Eliminar guía GT-\d+/.test(txt),
    noSePuedeDeshacer: /no se puede deshacer/i.test(txt),
    campo: !!document.querySelector('input[placeholder="Escribe ELIMINAR para confirmar"]'),
    botonApagado: (() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Eliminar");
      return b ? b.disabled : null;
    })(),
  };
};

const informe = {};
const problemas = [];
const nav = await chromium.launch();

for (const { rol, cookie } of ROLES) {
  informe[rol] = {};
  for (const ancho of ANCHOS) {
    const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
    await ctx.addCookies([{ name: "cxc_session", value: cookie, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript((r) => {
      sessionStorage.setItem("cxc_role", r);
      sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
      // El acordeón recuerda la fila abierta: se limpia para medir la lista CERRADA.
      sessionStorage.removeItem("guias:expanded");
      sessionStorage.removeItem("fg_guias_readonly");
    }, rol);
    const page = await ctx.newPage();

    const escrituras = [];
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      // 🔴 NADA que no sea GET sale de acá.
      if (req.method() !== "GET") {
        if (req.url().startsWith(BASE)) escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`);
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);

    const cerrada = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${SALIDA}/${rol}-lista-${ancho}.png`, fullPage: true });

    // ── Toques hasta la confirmación, TOCANDO de verdad ──────────────────────
    let toques = null;
    let items = [];
    let confirmacion = null;
    let conMenu = null;

    if (cerrada.menusEnFila > 0) {
      // Camino NUEVO: el «···» está en la fila cerrada.
      await page.locator('[aria-haspopup="menu"]').first().click();
      await page.waitForTimeout(400);
      items = await page.evaluate(ITEMS_ABIERTOS);
      conMenu = await page.evaluate(MEDIR);
      await page.screenshot({ path: `${SALIDA}/${rol}-menu-${ancho}.png`, fullPage: true });
      const eliminar = page.locator('[role="menuitem"]', { hasText: "Eliminar guía" }).first();
      if (await eliminar.count()) {
        await eliminar.click();
        await page.waitForTimeout(400);
        confirmacion = await page.evaluate(HAY_CONFIRMACION);
        toques = 2;
        await page.screenshot({ path: `${SALIDA}/${rol}-confirmar-${ancho}.png`, fullPage: true });
      }
    } else if (rol !== "bodega") {
      // Camino VIEJO (main): hay que ABRIR la guía primero.
      const fila = page.locator("button", { hasText: /GT-\d+/ }).first();
      await fila.click();
      await page.waitForTimeout(3500);
      const menus = await page.locator('[aria-haspopup="menu"]').count();
      if (menus > 0) {
        await page.locator('[aria-haspopup="menu"]').first().click();
        await page.waitForTimeout(400);
        items = await page.evaluate(ITEMS_ABIERTOS);
        const eliminar = page.locator('[role="menuitem"]', { hasText: "Eliminar guía" }).first();
        if (await eliminar.count()) {
          await eliminar.click();
          await page.waitForTimeout(400);
          confirmacion = await page.evaluate(HAY_CONFIRMACION);
          toques = 3;
        }
      }
      await page.screenshot({ path: `${SALIDA}/${rol}-menu-adentro-${ancho}.png`, fullPage: true });
    }

    informe[rol][ancho] = { cerrada, conMenu, items, confirmacion, toques, escrituras };

    // ── Veredictos ───────────────────────────────────────────────────────────
    for (const [etapa, m] of Object.entries({ cerrada, conMenu })) {
      if (!m) continue;
      if (m.arrastrePagina > 0) problemas.push(`🔴 ${rol} ${ancho} ${etapa}: ${m.arrastrePagina} px de arrastre de página`);
      if (m.textoChico) problemas.push(`🔴 ${rol} ${ancho} ${etapa}: ${m.textoChico} textos <12 px`);
      const botones = m.chicos.filter((c) => c.t !== "INPUT");
      if (botones.length) problemas.push(`🔴 ${rol} ${ancho} ${etapa}: ${botones.length} tocables <44 px — ${JSON.stringify(botones)}`);
    }
    // 🔴 Si no se encuentra la lista, "0 problemas" sería verde por nada.
    if (!cerrada.filas) problemas.push(`🔴 ${rol} ${ancho}: no se encontró ninguna guía en la lista`);

    if (rol === "bodega" && cerrada.menusEnFila > 0) {
      problemas.push(`🔴 ${ancho}: BODEGA ve el «···» (${cerrada.menusEnFila}) — no puede borrar`);
    }
    if (rol === "secretaria" && ETAPA === "despues") {
      if (cerrada.menusEnFila !== cerrada.filas) {
        problemas.push(`🔴 ${ancho}: la fila CERRADA no tiene su «···» (filas ${cerrada.filas} · menús ${cerrada.menusEnFila})`);
      }
      if (!/GT-\d+/.test(cerrada.rotuloMenu || "")) {
        problemas.push(`🔴 ${ancho}: el rótulo del «···» no dice de qué guía es — "${cerrada.rotuloMenu}"`);
      }
      if (JSON.stringify(items) !== JSON.stringify(["Eliminar guía"])) {
        problemas.push(`🔴 ${ancho}: el menú no ofrece «Eliminar guía» — ${JSON.stringify(items)}`);
      }
      if (toques !== 2) problemas.push(`🔴 ${ancho}: borrar cuesta ${toques} toques, no 2`);
      if (!confirmacion?.titulo || !confirmacion?.campo || confirmacion?.botonApagado !== true) {
        problemas.push(`🔴 ${ancho}: la confirmación no apareció como debe — ${JSON.stringify(confirmacion)}`);
      }
    }
    if (escrituras.length) problemas.push(`🔴 ${rol} ${ancho}: se intentó escribir — ${JSON.stringify(escrituras)}`);

    await ctx.close();
  }
}
await nav.close();

writeFileSync(`${SALIDA}/informe-eliminar-fila.json`, JSON.stringify(informe, null, 2));

console.log(`\n═══ LOS 4 ANCHOS — el «···» en la fila (ETAPA=${ETAPA}) ═══`);
for (const rol of Object.keys(informe)) {
  console.log(`\n· ${rol.toUpperCase()}`);
  for (const a of ANCHOS) {
    const v = informe[rol][a];
    const m = v.cerrada;
    console.log(`  ${String(a).padStart(4)} px  arrastre ${m.arrastrePagina} · tocables<44 ${m.chicos.length} · texto<12 ${m.textoChico} · recortados ${m.recortados} · alto ${m.altoPagina}`);
    console.log(`         filas ${m.filas} · «···» en fila ${m.menusEnFila} · caja ${m.menuCaja ? `${m.menuCaja.w}×${m.menuCaja.h}` : "—"} · toques ${v.toques ?? "—"}`);
    console.log(`         menú ${JSON.stringify(v.items)} · confirmación ${v.confirmacion ? `título ${v.confirmacion.titulo} · campo ${v.confirmacion.campo} · botón apagado ${v.confirmacion.botonApagado}` : "—"}`);
  }
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
