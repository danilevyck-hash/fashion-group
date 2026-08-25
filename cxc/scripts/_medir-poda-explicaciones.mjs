// Medición REAL en navegador de la PODA DE EXPLICACIONES (23-ago-2026).
//
// Qué mide, en 390 / 834 / 1024 / 1440, contra el BUILD DE PRODUCCIÓN y con
// datos de producción (SOLO LECTURA — no se toca ningún botón que escriba):
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — contenido fuera de su caja SIN scroller (nadie lo alcanza).
//   C. BLANCOS TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
//   E. HUECOS — contenedores VACÍOS que siguen ocupando alto: el modo de fallo
//      propio de una poda (se saca el texto y queda el agujero).
//   F. ALTO de <main> — sacar texto ACORTA, y el antes→después es la prueba.
//
// 🩸 Y lo que de verdad hay que comprobar: que lo podado NO SE VEA y que lo que
// se conserva SIGA VIÉNDOSE. `prohibidos` / `seQuedan` por pantalla; el script
// FALLA (exit 1) si aparece un prohibido o falta uno de los que se quedan.
// Contra `origin/main` (BASE del build viejo) los `prohibidos` SÍ tienen que
// estar: por eso `ESPERADO=main` invierte esa mitad de la exigencia.
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   * Los ids (período de caja, cliente, proyecto) se DESCUBREN navegando: si
//     se hardcodean, el script muere el día que ese registro se borre.
//
//   PORT=3178 SALIDA=/tmp/poda-expl node scripts/_medir-poda-explicaciones.mjs
//   PORT=3179 ESPERADO=main SALIDA=/tmp/poda-expl-main node scripts/…

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3178";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/poda-explicaciones";
const ESPERADO = process.env.ESPERADO ?? "podado"; // "podado" | "main"
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1024", width: 1024, height: 768, movil: false },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

// 🩸 `raiz` es un PARÁMETRO, no `main` a secas: los modales se pintan con
// createPortal FUERA de <main>, y medirlos contra `main` daba "el texto ya no
// está" para pantallas donde el modal ni siquiera se había abierto.
const MEDIR = `((RAIZ) => {
  // 🩸 innerText SÍ incluye lo \`sr-only\`. Acá se arma el texto QUE SE VE.
  function textoVisible(raiz) {
    const partes = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (cs.clip !== "auto" && cs.clip !== "") continue;
      partes.push(t);
    }
    return partes.join(" ").replace(/\\s+/g, " ");
  }
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const raiz = (RAIZ === "body" ? document.body : document.querySelector("main")) || document.body;
  const recortados = [];
  const chicos = [];
  const textosChicos = [];
  const huecos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if ((el.className || "").toString().includes("sr-only")) continue;
    if (r.width === 0 && r.height === 0) continue;
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden") {
      recortados.push({ tag: el.tagName.toLowerCase(), clase: (el.className || "").toString().slice(0, 60), px: desborde, texto: (el.textContent || "").trim().slice(0, 40) });
    }
    if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
      if (r.height > 0 && r.height < 44) {
        chicos.push({ tag: el.tagName.toLowerCase(), alto: Math.round(r.height * 10) / 10, texto: (el.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 40) });
      }
    }
    const propio = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (propio) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
    }
    if (el.namespaceURI === "http://www.w3.org/1999/xhtml"
        && !el.children.length && !(el.textContent || "").trim()
        && !["IMG","INPUT","BR","HR","TEXTAREA","CANVAS","IFRAME"].includes(el.tagName)) {
      const alto = r.height;
      const mt = parseFloat(cs.marginTop) || 0;
      const mb = parseFloat(cs.marginBottom) || 0;
      if (alto > 4 || mt + mb > 8) {
        huecos.push({ tag: el.tagName.toLowerCase(), clase: (el.className || "").toString().slice(0, 50), alto: Math.round(alto), mt, mb });
      }
    }
  }
  const rm = raiz.getBoundingClientRect();
  // 🩸 main tiene min-height de pantalla: en una página corta mide siempre lo
  // mismo y el antes→después daría 0 aunque el texto se haya ido. El alto que
  // NO miente es el del CONTENIDO: del borde de arriba del primer elemento al
  // borde de abajo del último que ocupa lugar.
  let arriba = Infinity, abajo = -Infinity;
  for (const el of raiz.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if ((el.className || "").toString().includes("sr-only")) continue;
    if (cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) continue;
    if (r.top < arriba) arriba = r.top;
    if (r.bottom > abajo) abajo = r.bottom;
  }
  const altoContenido = (abajo > arriba) ? Math.round(abajo - arriba) : 0;
  return {
    altoContenido,
    arrastrePagina, recortados, chicos, textosChicos, huecos,
    // F. el alto de la pantalla, que es lo que la poda tiene que ACORTAR.
    altoMain: Math.round(rm.height),
    altoDoc: Math.round(doc.scrollHeight),
    texto: textoVisible(raiz),
  };
})`;

async function primerHref(page, re) {
  return page.evaluate((fuente) => {
    const rx = new RegExp(fuente);
    for (const a of document.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href");
      if (h && rx.test(h)) return h;
    }
    return null;
  }, re.source);
}

const PANTALLAS = [];

async function resolverPantallas(page) {
  // 🩸 `fetch` relativo necesita ORIGEN: sin este goto la página es about:blank
  // y las llamadas devuelven null en silencio.
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  const api = async (ruta) => {
    try {
      return await page.evaluate(async (r) => {
        const res = await fetch(r, { credentials: "include" });
        return res.ok ? await res.json() : null;
      }, ruta);
    } catch { return null; }
  };

  const periodos = await api("/api/caja/periodos");
  const periodoId = Array.isArray(periodos) && periodos[0] ? periodos[0].id : null;

  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const clienteHref = (await primerHref(page, /^\/clientes\/[^/]+$/)) || "/clientes/D-1";

  PANTALLAS.push(
    // ── #197 Caja Menuda: la lista de períodos ──────────────────────────────
    { id: "caja-periodos", url: "/caja",
      prohibidos: ["ciclo del fondo fijo"], seQuedan: ["Nº"] },
    // ── #302 Gastos · Egresos ───────────────────────────────────────────────
    { id: "gastos", url: "/gastos-contabilidad",
      prohibidos: ["Cada pago que salió de caja o del banco"], seQuedan: ["Gastos"] },
    // ── #303 Saldos de banco ────────────────────────────────────────────────
    { id: "saldos-banco", url: "/saldos-banco",
      prohibidos: ["muestra como"], seQuedan: ["Saldos"] },
    // ── #131 Ficha del cliente ──────────────────────────────────────────────
    { id: "cliente-ficha", url: clienteHref,
      prohibidos: ["editable en fashiongr"],
      seQuedan: ["CONTACTO", "Última sincronización"] },
    // ── #138 Marketing · Por cliente ────────────────────────────────────────
    { id: "marketing-por-cliente", url: "/marketing", clic: "text=Por cliente", raiz: "body",
      prohibidos: ["Cuánto te costó cada tienda en total"],
      seQuedan: ["no se le reporta a ninguna marca"] },
    // ── #163/#164/#165 Marketing · Registrar gasto (paso 1) ─────────────────
    { id: "marketing-registrar-gasto", url: "/marketing", clic: "text=+ Registrar gasto", raiz: "body",
      prohibidos: ["letreros, material, remodelación", "Descuenta el inventario en piezas", "para la marca en general, sin tienda"],
      seQuedan: ["¿Qué es el gasto?", "Factura", "Mueble", "Gasto de la marca"] },
    // ── #370 Data Health ────────────────────────────────────────────────────
    { id: "data-health", url: "/admin/data-health",
      prohibidos: ["peor severity del día"], seQuedan: ["Historial 30 días"] },
    // ── #316/#322/#325/#331/#347/#349 Mi Excel con fotos ────────────────────
    { id: "mi-excel-fotos", url: "/productos/cargar?tab=misfotos",
      prohibidos: ["La fila 1 es el encabezado", "ahí se pegan las fotos", "salen tal cual"],
      seQuedan: ["Cómo tiene que estar tu archivo", "Cada foto tiene que llamarse igual que el código"] },
    // ── #345/#346 Depurador · Reglas ────────────────────────────────────────
    { id: "depurador-reglas", url: "/productos/cargar?tab=reglas",
      prohibidos: ["manda captura a Daniel", "antes de buscar en el catálogo"],
      seQuedan: ["Principios de limpieza"] },
    // ── #358 Depurador · puerta ─────────────────────────────────────────────
    { id: "depurador", url: "/productos/cargar",
      prohibidos: ["La marca se detecta sola"],
      seQuedan: ["Suelta el archivo aquí"] },
    // ── #185 Reclamos (el modal se abre desde el detalle; acá la lista) ─────
    { id: "reclamos", url: "/reclamos", prohibidos: [], seQuedan: [] },
    ...(periodoId ? [{ id: "caja-detalle", url: `/caja?view=detail&id=${periodoId}`, prohibidos: ["ciclo del fondo fijo"], seQuedan: ["Fondo"] }] : []),
  );
}

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};
  let fallas = 0;

  const sembrar = async (ctx) => {
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
  };

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await sembrar(ctx);
    const page = await ctx.newPage();
    await resolverPantallas(page);
    await ctx.close();
    console.log(`Pantallas resueltas: ${PANTALLAS.map((p) => p.id).join(", ")}\n`);
  }

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      isMobile: t.movil, hasTouch: t.movil, deviceScaleFactor: 1,
    });
    await sembrar(ctx);
    const page = await ctx.newPage();
    informe[t.nombre] = {};
    console.log(`\n=== ${t.nombre} px ===`);

    for (const p of PANTALLAS) {
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(900);
        if (p.clic) {
          try { await page.click(p.clic, { timeout: 5000 }); await page.waitForTimeout(900); } catch {}
        }
        const m = await page.evaluate(`${MEDIR}(${JSON.stringify(p.raiz ?? "main")})`);
        const T = m.texto.toLocaleLowerCase();
        const presentes = p.prohibidos.filter((x) => T.includes(x.toLocaleLowerCase()));
        const faltan = p.seQuedan.filter((x) => !T.includes(x.toLocaleLowerCase()));
        // Contra main lo podado TIENE que estar: si no, la pantalla no cargó y
        // el "antes" sería un cero que se leería como "acortó muchísimo".
        const malos = ESPERADO === "main"
          ? p.prohibidos.filter((x) => !T.includes(x.toLocaleLowerCase()))
          : presentes;
        informe[t.nombre][p.id] = { ...m, texto: undefined, malos, faltan };
        const ok = !malos.length && !faltan.length
          && m.arrastrePagina === 0 && !m.recortados.length
          && !m.chicos.length && !m.textosChicos.length && !m.huecos.length;
        if (!ok) fallas++;
        console.log(
          `  ${ok ? "🟢" : "🔴"} ${p.id.padEnd(24)} alto ${String(m.altoContenido).padStart(5)} · arrastre ${String(m.arrastrePagina).padStart(4)} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length} · huecos ${m.huecos.length}`,
        );
        if (malos.length) console.log(`     🔴 ${ESPERADO === "main" ? "NO ESTABA EN MAIN" : "SIGUE EN PANTALLA"}: ${JSON.stringify(malos)}`);
        if (faltan.length) console.log(`     🔴 SE PERDIÓ lo que debía quedarse: ${JSON.stringify(faltan)}`);
        if (m.recortados.length) console.log(`     recortados: ${JSON.stringify(m.recortados.slice(0, 3))}`);
        if (m.chicos.length) console.log(`     táctiles: ${JSON.stringify(m.chicos.slice(0, 3))}`);
        if (m.textosChicos.length) console.log(`     textos: ${JSON.stringify(m.textosChicos.slice(0, 3))}`);
        if (m.huecos.length) console.log(`     huecos: ${JSON.stringify(m.huecos.slice(0, 3))}`);
        await page.screenshot({ path: path.join(SALIDA, `${p.id}-${t.nombre}.png`), fullPage: true });
      } catch (e) {
        fallas++;
        console.log(`  🔴 ${p.id.padEnd(24)} ERROR: ${String(e).slice(0, 120)}`);
        informe[t.nombre][p.id] = { error: String(e).slice(0, 300) };
      }
    }
    await ctx.close();
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\n${fallas === 0 ? "🟢 TODO VERDE" : `🔴 ${fallas} hallazgo(s)`} — capturas e informe en ${SALIDA}`);
  process.exit(fallas === 0 ? 0 : 1);
})();
