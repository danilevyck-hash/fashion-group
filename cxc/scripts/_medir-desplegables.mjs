// Barrido REAL en navegador de TODO desplegable que flota sobre la app.
//
// 🩸 POR QUÉ EXISTE. En Guías, la lista del selector de cliente se dibujaba
// `absolute` DENTRO de la fila, y la fila vive en un `ScrollableTable`
// (`overflow-x-auto`). Un ancestro que recorta le gana SIEMPRE al z-index: de
// los 81 px de la lista se veían 5. Daniel: *"debe de pasar en otros modulos y
// otros campos across todo el sistema, hay q arreglar eso"*. Esto lo mide.
//
// Mide, control por control y en los 3 anchos que usa Daniel (390 iPhone,
// 834 iPad vertical, 1440 escritorio), los DOS defectos del bug:
//
//   A. RECORTE — se compara la caja del desplegable contra la de CADA ancestro
//      con `overflow` distinto de `visible` y se anotan los px perdidos por
//      lado. También se mide si se sale de la PANTALLA (el otro "no se ve").
//   B. EMPUJE — abrir el desplegable vuelve scrolleable a ese ancestro, así que
//      la fila se puede ir de la vista. Se mide `scrollHeight - clientHeight`
//      ANTES y DESPUÉS de abrir, más el desplazamiento de las columnas vecinas.
//
// El desplegable se detecta por DIFERENCIA DE DOM (lo que aparece al abrir y
// está posicionado `absolute`/`fixed`), NO por un selector a mano: así el MISMO
// script mide el "antes" y el "después" aunque el arreglo mueva el nodo a un
// portal en <body>.
//
// GOTCHAS heredados de auditorías anteriores (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   * Hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar
//     (bloquear el SW mata la hidratación).
//
// Solo lectura: ningún escenario guarda, borra ni envía nada.
//
//   ETAPA=antes node scripts/_medir-desplegables.mjs
//   ETAPA=despues SOLO=cheques-form node scripts/_medir-desplegables.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3131";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const SOLO = process.env.SOLO ?? "";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

// ── Sonda de navegador ───────────────────────────────────────────────────────

const SONDA = `
window.__fg = {
  visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  },
  caja(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  },
  /** Foto del DOM ANTES de abrir: qué existía y qué se veía. */
  marcar() {
    document.querySelectorAll("*").forEach((el) => {
      el.__fgExistia = true;
      el.__fgSeVeia = window.__fg.visible(el);
    });
  },
  /**
   * El desplegable = lo que apareció al abrir, posicionado fuera del flujo y
   * con tamaño de panel. Se queda con el de MAYOR área.
   */
  panelNuevo() {
    let mejor = null, mejorArea = 0;
    for (const el of document.querySelectorAll("*")) {
      if (el.__fgExistia && el.__fgSeVeia) continue;      // ya estaba a la vista
      if (!window.__fg.visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "absolute" && cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 24) continue;         // chips, iconitos
      if (r.width >= window.innerWidth && r.height >= window.innerHeight) continue; // backdrop
      // El panel de más afuera gana: si el hijo también califica, nos quedamos
      // con el padre (el hijo ya está adentro).
      const area = r.width * r.height;
      if (area > mejorArea) { mejor = el; mejorArea = area; }
    }
    return mejor;
  },
  recortadores(el) {
    const out = [];
    let n = el?.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        out.push({
          etiqueta: n.tagName + "." + String(n.className || "").slice(0, 46),
          overflow: cs.overflowX + "/" + cs.overflowY,
          puedeScrollear: n.scrollHeight - n.clientHeight,
          caja: window.__fg.caja(n),
        });
      }
      n = n.parentElement;
    }
    return out;
  },
  /** Px del panel que se COMEN los ancestros con overflow. */
  recorte(panel) {
    const r = panel.getBoundingClientRect();
    let peor = null;
    let p = panel.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        const abajo = Math.round(Math.max(0, r.bottom - pr.bottom));
        const arriba = Math.round(Math.max(0, pr.top - r.top));
        const der = Math.round(Math.max(0, r.right - pr.right));
        const izq = Math.round(Math.max(0, pr.left - r.left));
        const total = abajo + arriba + der + izq;
        if (total > 0 && (!peor || total > peor.total)) {
          peor = {
            por: p.tagName + "." + String(p.className || "").slice(0, 46),
            perdidoAbajo: abajo, perdidoArriba: arriba, perdidoDer: der, perdidoIzq: izq, total,
          };
        }
      }
      p = p.parentElement;
    }
    return peor;
  },
  /** ¿Está de verdad ARRIBA de todo en su propio centro? */
  flotaEncima(panel) {
    const r = panel.getBoundingClientRect();
    const cx = Math.min(innerWidth - 2, Math.max(2, r.x + r.width / 2));
    const cy = Math.min(innerHeight - 2, Math.max(2, r.y + Math.min(18, r.height / 2)));
    const a = document.elementFromPoint(cx, cy);
    return Boolean(a && (a === panel || panel.contains(a)));
  },
  fueraDePantalla(panel) {
    const r = panel.getBoundingClientRect();
    return {
      abajo: Math.round(Math.max(0, r.bottom - innerHeight)),
      der: Math.round(Math.max(0, r.right - innerWidth)),
      arriba: Math.round(Math.max(0, -r.top)),
      izq: Math.round(Math.max(0, -r.left)),
    };
  },
  /**
   * Cajas de referencia en coordenadas de DOCUMENTO. Ojo: tienen que ser de
   * documento y no de viewport — abrir el control puede hacer scroll (el propio
   * navegador acerca el campo enfocado) y eso movería TODAS las referencias sin
   * que el layout haya cambiado un píxel. Lo que se busca es lo contrario: que
   * el desplegable EMPUJE a los vecinos.
   */
  referencias(sel) {
    const out = {};
    document.querySelectorAll(sel).forEach((el, i) => {
      if (!window.__fg.visible(el)) return;
      const clave = i + "|" + (el.textContent || el.id || el.tagName)
        .replace(/\\s+/g, " ").trim().slice(0, 24);
      const r = el.getBoundingClientRect();
      out[clave] = { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY) };
    });
    return out;
  },
  arrastreCuerpo() {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  },
  /** Todo lo que hace falta saber del panel abierto. */
  medir(selRef) {
    const panel = window.__fg.panelNuevo();
    if (!panel) {
      return { presente: false, referencias: window.__fg.referencias(selRef), arrastreCuerpo: window.__fg.arrastreCuerpo() };
    }
    return {
      presente: true,
      etiqueta: panel.tagName + "." + String(panel.className || "").slice(0, 60),
      caja: window.__fg.caja(panel),
      posicion: getComputedStyle(panel).position,
      enBody: panel.parentElement === document.body,
      opciones: panel.querySelectorAll("button,li,[role=option],[role=menuitem],a").length,
      recorte: window.__fg.recorte(panel),
      recortadores: window.__fg.recortadores(panel),
      fueraDePantalla: window.__fg.fueraDePantalla(panel),
      flotaEncima: window.__fg.flotaEncima(panel),
      referencias: window.__fg.referencias(selRef),
      arrastreCuerpo: window.__fg.arrastreCuerpo(),
    };
  },
};
true`;

// ── Escenarios ───────────────────────────────────────────────────────────────

const ESCENARIOS = [];
const esc = (o) => ESCENARIOS.push(o);

/** Entra al período de caja abierto (la lista navega por click de fila). */
async function irACajaPeriodo(page) {
  await page.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // La lista tiene DOS layouts: tarjetas (móvil) y `.caja-row` (escritorio).
  // Los dos existen en el DOM; se toma el que de verdad se ve.
  const fila = page.locator(".caja-row, div.cursor-pointer").filter({ hasText: "Abierto" })
    .locator("visible=true").first();
  if (await fila.count()) await fila.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return /\/caja\/[^/]+$/.test(page.url());
}

esc({
  id: "caja-tabla-categoria",
  titulo: "Caja › tabla de gastos › editar fila › Categoría",
  refs: "thead th",
  ir: irACajaPeriodo,
  async preparar(page) {
    // "Editar" vive dentro del menú ⋯ de la fila del gasto (el último de la
    // página; el primero es el del encabezado del período).
    const menus = page.getByRole("button", { name: /más opciones/i }).locator("visible=true");
    const n = await menus.count();
    if (!n) return false;
    await menus.nth(n - 1).scrollIntoViewIfNeeded().catch(() => {});
    await menus.nth(n - 1).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const editar = page.getByRole("menuitem", { name: /^Editar$/ }).locator("visible=true").first();
    if (!(await editar.count())) return false;
    await editar.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    const inp = page.locator('input[placeholder="Categoría"]').locator("visible=true").first();
    if (!(await inp.count())) return false;
    await inp.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    return true;
  },
  async abrir(page) {
    const inp = page.locator('input[placeholder="Categoría"]').locator("visible=true").first();
    if (!(await inp.count())) return false;
    await inp.click({ timeout: 8000 }).catch(() => {});
    // Vaciarlo: con "Varios" escrito la lista filtra a 1 opción y no se mide el
    // desplegable de verdad. Vacío muestra las 8 categorías, que es lo que ve
    // quien va a cambiar la categoría de un gasto.
    await page.keyboard.press("Meta+a").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await page.waitForTimeout(900);
    return true;
  },
});

esc({
  id: "caja-form-responsable",
  titulo: "Caja › Nuevo gasto › Responsable / Categoría (select con búsqueda)",
  refs: "label",
  ir: irACajaPeriodo,
  async preparar(page) {
    const b = page.getByRole("button", { name: /nuevo gasto/i }).locator("visible=true").first();
    if (await b.count()) { await b.click({ timeout: 8000 }).catch(() => {}); }
    await page.waitForTimeout(1200);
    const inp = page.locator('input[role="combobox"]').locator("visible=true").last();
    if (!(await inp.count())) return false;
    await inp.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    return true;
  },
  async abrir(page) {
    const inp = page.locator('input[role="combobox"]').locator("visible=true").last();
    if (!(await inp.count())) return false;
    await inp.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    return true;
  },
});

esc({
  id: "cheques-form-vendedor",
  titulo: "Cheques › Nuevo cheque › Vendedor (select con búsqueda, modal con scroll)",
  refs: "label",
  async ir(page) {
    await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    return true;
  },
  async preparar(page) {
    const b = page.getByRole("button", { name: /nuevo cheque/i }).first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const inp = page.locator('input[role="combobox"]').locator("visible=true").last();
    if (!(await inp.count())) return false;
    await inp.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    return true;
  },
  async abrir(page) {
    const inp = page.locator('input[role="combobox"]').locator("visible=true").last();
    if (!(await inp.count())) return false;
    await inp.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    return true;
  },
});

esc({
  id: "cheques-menu-fila",
  titulo: "Cheques › menú ⋯ de una fila (tabla con overflow)",
  refs: "thead th",
  async ir(page) {
    await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    return true;
  },
  async preparar(page) {
    const b = page.getByRole("button", { name: "⋯" }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    return true;
  },
  async abrir(page) {
    const b = page.getByRole("button", { name: "⋯" }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    return true;
  },
});

esc({
  id: "cheques-calendario",
  titulo: "Cheques › Calendario › globo del cheque",
  refs: "thead th, h1",
  async ir(page) {
    await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const cal = page.getByRole("button", { name: /^Calendario$/ }).first();
    if (!(await cal.count())) return false;
    await cal.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    return true;
  },
  async abrir(page) {
    const pill = page.locator("button").filter({ hasText: /…\s*\$/ }).locator("visible=true").first();
    if (!(await pill.count())) return false;
    await pill.scrollIntoViewIfNeeded().catch(() => {});
    await pill.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  },
});

esc({
  id: "marketing-cliente",
  titulo: "Marketing › Nuevo proyecto › Cliente (typeahead en modal con scroll)",
  refs: "label",
  async ir(page) {
    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    return true;
  },
  async preparar(page) {
    const b = page.getByRole("button", { name: /nuevo proyecto/i }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
    return Boolean(await page.locator('input[placeholder*="liente"]').locator("visible=true").count());
  },
  async abrir(page) {
    const inp = page.locator('input[placeholder*="liente"]').locator("visible=true").first();
    await inp.click({ timeout: 8000 }).catch(() => {});
    await page.keyboard.type("CITY", { delay: 140 });
    await page.waitForTimeout(4000);
    return true;
  },
});

esc({
  id: "cxc-exportar",
  titulo: "CXC › menú Exportar",
  refs: "h1, thead th",
  async ir(page) {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(6000);
    return true;
  },
  async abrir(page) {
    const b = page.getByRole("button", { name: /^Exportar$/ }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  },
});

esc({
  id: "cxc-acciones-movil",
  titulo: "CXC › móvil › menú Acciones del cliente",
  refs: "h1",
  async ir(page) {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(6000);
    return true;
  },
  async abrir(page) {
    const b = page.getByRole("button", { name: /^Acciones$/i }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.scrollIntoViewIfNeeded().catch(() => {});
    await b.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  },
});

// ⚠️ El menú de `SyncNowButton` SÍ se dibuja, en UN solo lugar: /comisiones,
// que le pasa las 7 empresas de recibos y NO le pasa `secuencial`. Ese es el
// escenario `sync-now-comisiones` de abajo. Los demás llamadores le pasan una
// sola opción (botón directo) o `secuencial` (un clic dispara la secuencia
// entera contra Switch) — a esos NO se les toca el botón al medir.

/**
 * Comisiones es MÓDULO PROPIO (/comisiones), no una pestaña de /ventas.
 * Los tres desplegables de esta pantalla (ⓘ Criterios, período y el menú de
 * "Actualizar ahora") cuelgan de la MISMA barra de dos filas, así que comparten
 * el camino de entrada.
 */
async function irAComisiones(page) {
  await page.goto(`${BASE}/comisiones`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  return Boolean(await page.getByRole("button", { name: "Por empresa", exact: true }).count());
}

esc({
  id: "sync-now-comisiones",
  titulo: "Comisiones › Actualizar ahora › menú de empresas",
  refs: "thead th, table tbody tr td, article",
  ir: irAComisiones,
  async abrir(page) {
    // ⚠️ Con varias opciones y SIN `secuencial`, el botón ABRE UN MENÚ; no
    // dispara ningún sync. (Con `secuencial` sí dispararía — no se mide así.)
    // Tampoco se toca ningún ITEM del menú: eso sí sincronizaría de verdad.
    const b = page.getByRole("button", { name: /actualizar ahora/i }).locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.scrollIntoViewIfNeeded().catch(() => {});
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    return true;
  },
});

esc({
  id: "comisiones-criterios",
  titulo: "Comisiones › ⓘ Criterios (popover con la frescura del dato)",
  refs: "thead th, table tbody tr td, article",
  ir: irAComisiones,
  async abrir(page) {
    const b = page
      .getByRole("button", { name: "Cómo se calcula y cuándo se actualizó" })
      .locator("visible=true")
      .first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    return true;
  },
});

esc({
  id: "comisiones-periodo",
  titulo: "Comisiones › selector de período (mes + año en un control)",
  refs: "thead th, table tbody tr td, article",
  ir: irAComisiones,
  async abrir(page) {
    const b = page
      .locator('button[aria-haspopup="dialog"][aria-label^="Período"]')
      .locator("visible=true")
      .first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    return true;
  },
});

esc({
  id: "buscador-global",
  titulo: "Header › buscador global › resultados",
  refs: "h1",
  async ir(page) {
    await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    return true;
  },
  async abrir(page) {
    const inp = page.locator('input[placeholder*="uscar"]').locator("visible=true").first();
    if (await inp.count()) {
      await inp.click({ timeout: 5000 }).catch(() => {});
    } else {
      const lupa = page.getByRole("button", { name: /^Buscar$/i }).first();
      if (!(await lupa.count())) return false;
      await lupa.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.keyboard.type("ci", { delay: 110 });
    await page.waitForTimeout(3000);
    return true;
  },
});

esc({
  id: "notificaciones",
  titulo: "Header › campana › panel de notificaciones",
  refs: "h1",
  async ir(page) {
    // El AppHeader (campana + buscador) NO se monta en /home; sí en los módulos.
    await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    return true;
  },
  async abrir(page) {
    const b = page.locator('button[aria-label="Notificaciones"]').locator("visible=true").first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  },
});

esc({
  id: "guias-cliente",
  titulo: "Guías › nueva › Cliente (YA ARREGLADO — control de referencia)",
  refs: "thead th",
  async ir(page) {
    await page.goto(`${BASE}/guias/nueva`, { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    return true;
  },
  async abrir(page) {
    const inp = page.locator('[id^="cliente-"]').first();
    if (!(await inp.count())) return false;
    await inp.click({ timeout: 5000 }).catch(() => {});
    await page.keyboard.type("CI", { delay: 130 });
    await page.waitForTimeout(3000);
    return true;
  },
});

// ── Corrida ──────────────────────────────────────────────────────────────────

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const e of ESCENARIOS) {
  if (SOLO && !SOLO.split(",").some((s) => e.id.includes(s))) continue;
  for (const t of TAMANOS) {
    const ctx = await navegador.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 1,
      ...(t.movil ? { hasTouch: true, isMobile: false } : {}),
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
      sessionStorage.setItem("fg_is_owner", "1");
    });

    const page = await ctx.newPage();
    const erroresJs = [];
    page.on("pageerror", (x) => erroresJs.push(String(x.message)));

    const r = { etapa: ETAPA, escenario: e.id, titulo: e.titulo, tamano: t.nombre };
    try {
      if (!(await e.ir(page))) throw new Error("no pude llegar a la pantalla");
      // `preparar` deja la pantalla en el estado JUSTO ANTES de abrir el
      // desplegable (modal abierto, fila en modo edición…). La línea base se
      // toma DESPUÉS: si no, entrar en modo edición —que cambia el ancho de las
      // columnas— se leería como si lo hubiera movido el desplegable.
      if (e.preparar && !(await e.preparar(page))) throw new Error("no pude preparar el control");
      await page.evaluate(SONDA);

      // Línea base: qué existe y dónde está TODO antes de abrir.
      r.cerrado = await page.evaluate(`(() => ({
        referencias: window.__fg.referencias(${JSON.stringify(e.refs)}),
        arrastreCuerpo: window.__fg.arrastreCuerpo(),
      }))()`);
      await page.screenshot({
        path: path.join(SALIDA, `desplegable-${e.id}-${ETAPA}-${t.nombre}-cerrado.png`),
      });
      await page.evaluate("window.__fg.marcar()");

      r.abrio = await e.abrir(page);
      // Re-inyectar la sonda es inofensivo (solo redefine `window.__fg`); las
      // marcas `__fgExistia` viven en los ELEMENTOS y sobreviven.
      await page.evaluate(SONDA);
      r.abierto = await page.evaluate(`window.__fg.medir(${JSON.stringify(e.refs)})`);

      // ¿Se movió algo de lugar?
      r.desplazamiento = [];
      for (const k of Object.keys(r.cerrado.referencias ?? {})) {
        const a = r.cerrado.referencias[k], b = r.abierto.referencias?.[k];
        if (!b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx !== 0 || dy !== 0) r.desplazamiento.push({ ref: k, dx, dy });
      }
      r.maxDesplazamiento = r.desplazamiento.reduce(
        (m, d) => Math.max(m, Math.abs(d.dx), Math.abs(d.dy)), 0);
      r.arrastreLateral = r.abierto.arrastreCuerpo - r.cerrado.arrastreCuerpo;

      const fuera = Object.values(r.abierto.fueraDePantalla ?? {}).reduce((a, b) => a + b, 0);
      r.veredicto = !r.abierto.presente
        ? "NO-MEDIDO (no apareció el desplegable)"
        : (r.abierto.recorte || fuera > 0 || r.maxDesplazamiento > 0 ||
           r.arrastreLateral > 0 || r.abierto.flotaEncima === false)
          ? "ROTO"
          : "SANO";

      await page.screenshot({
        path: path.join(SALIDA, `desplegable-${e.id}-${ETAPA}-${t.nombre}.png`),
      });
    } catch (err) {
      r.error = String(err.message ?? err).slice(0, 200);
      r.veredicto = "NO-MEDIDO";
      await page.screenshot({
        path: path.join(SALIDA, `desplegable-${e.id}-${ETAPA}-${t.nombre}-ERROR.png`),
      }).catch(() => {});
    }
    r.erroresJs = erroresJs.slice(0, 3);
    resultados.push(r);
    const d = r.abierto?.recorte;
    console.error(
      `[${ETAPA}] ${e.id.padEnd(24)} @${t.nombre.padEnd(5)} → ${r.veredicto}` +
      (d ? `  recorte ${d.total}px (${d.por.slice(0, 34)})` : "") +
      (r.maxDesplazamiento ? `  mueve ${r.maxDesplazamiento}px` : ""),
    );
    await ctx.close();
  }
}

await navegador.close();
const dest = path.join(SALIDA, `desplegables-medicion-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
console.error(`\nJSON → ${dest}`);
