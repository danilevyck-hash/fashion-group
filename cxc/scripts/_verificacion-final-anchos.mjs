// VEREDICTO: ¿el sistema entero está en 0 px, en los 4 anchos?
//
// ── 🩸 QUÉ ES ESTO ───────────────────────────────────────────────────────────
//
// El 30-jul-2026 se publicaron 23 cambios de adaptación a iPhone/iPad (#365 a
// #383). Esto NO arregla nada: mide `origin/main` completo a 390 / 834 / 1024 /
// 1440 y responde una sola pregunta — ¿quedó algo que no se puede usar?
//
// ── CÓMO NO ENGAÑARSE (todo esto costó una corrida cada uno) ────────────────
//
//  1. **SIN UMBRALES.** El censo original clasificaba con un piso de 100px y
//     reportaba 0 donde recortaba 92. Acá se anota TODO desborde ≥1px y se
//     clasifica por CAUSA, no por tamaño.
//
//  2. **ARRASTRA ≠ RECORTA.** Un `overflow-x:auto` es molesto: el dato se
//     alcanza. Un `overflow:hidden` que desborda es un dato que NO se puede ver
//     de ninguna forma. Se cuentan aparte y RECORTA manda.
//
//  3. **El arrastre no es la señal donde el contenedor recorta.** Lección de la
//     guía impresa: la hoja se pintaba 16px fuera de la pantalla con la última
//     columna cortada y el arrastre daba 0, porque `overflow-hidden` recorta en
//     silencio. Por eso también se mide el BORDE DERECHO REAL de todo lo
//     pintado contra el ancho de la ventana.
//
//  4. **Un 0 no vale nada si la pantalla está vacía.** Packing Lists, Gastos de
//     Empresa y Depurador › Reglas están vacíos en producción. Se marcan
//     SIN-DATOS, nunca "sano".
//
//  5. **Cero elementos encontrados es FALLA.** Si una pantalla no rinde texto,
//     o cae al login, o no aparece su marca de contenido, se reporta ERROR — no
//     se cuenta como 0.
//
// GOTCHAS heredados: sembrar la cookie firmada + `sessionStorage.cxc_role` (si
// no, todo redirige al login DESPUÉS de hidratar y uno mide la pantalla de
// ingreso) y `delete Navigator.prototype.serviceWorker` ANTES de navegar
// (bloquear el SW por ruteo mata la hidratación).
//
// El servidor se levanta con `scripts/_srv-medicion.mjs`, que sobrevive a los
// `pkill -f "next start"` de otros agentes.
//
// Solo lectura: navega y abre pestañas. No guarda, no borra, no envía, no
// sincroniza. Ningún click sobre algo que ejecute.
//
//   node scripts/_verificacion-final-anchos.mjs
//   SOLO=cheques,guias node scripts/_verificacion-final-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3182";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/final82";
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const UN_ANCHO = process.env.ANCHO ?? null;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const ANCHOS = [
  { n: "390", w: 390, h: 844, touch: true },
  { n: "834", w: 834, h: 1112, touch: true },
  { n: "1024", w: 1024, h: 768, touch: true },
  { n: "1440", w: 1440, h: 900, touch: false },
];

// IDs verificados contra producción.
const GUIA = "4048a77f-c1b3-4cf8-853d-e27323f096cd";
const CAJA = "41661bd4-02e3-43c6-bb3d-e4709b1607a6";
const PREST = "e5a900f9-b05d-4ac3-914f-cd13448c5005";
const RECL = "empresa=Vistana+International&view=detail&id=0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7";
const PROY = "f66c2385-e69d-4d90-82d5-6f694379464e";

// `vacio: true` = SIN DATOS en producción, medido: un 0 acá no prueba nada.
// `abrir` = clicks SEGUROS (pestañas / desplegables). Ninguno ejecuta.
const P = [
  // ── Ventas y clientes ──
  { id: "vista-general",   t: "Vista General",          url: "/vista-general" },
  { id: "ventas-resumen",  t: "Ventas › Resumen",       url: "/ventas?tab=resumen" },
  { id: "ventas-clientes", t: "Ventas › Clientes",      url: "/ventas?tab=clientes" },
  { id: "ventas-productos",t: "Ventas › Productos",     url: "/ventas?tab=productos" },
  { id: "ventas-utilidad", t: "Ventas › Utilidad",      url: "/ventas?tab=utilidad" },
  { id: "cxc",             t: "Cuentas por Cobrar",     url: "/admin" },
  { id: "mf-resumen",      t: "Multifashion › Resumen", url: "/multifashion?subtab=resumen" },
  { id: "mf-clientes",     t: "Multifashion › Clientes",url: "/multifashion?subtab=clientes" },
  { id: "mf-vendedoras",   t: "Multifashion › Vendedoras", url: "/multifashion?subtab=vendedoras" },
  { id: "clientes",        t: "Clientes › Directorio",  url: "/clientes" },
  { id: "proveedores",     t: "Proveedores (CxP)",      url: "/proveedores" },

  // ── Catálogos: 3 marcas × interna/pública ──
  { id: "cat-marcas",      t: "Catálogos › Marcas",     url: "/catalogos/marcas" },
  { id: "cat-tommy",       t: "Catálogo Tommy (interno)",   url: "/catalogo/tommy" },
  { id: "cat-reebok",      t: "Catálogo Reebok (interno)",  url: "/catalogo/reebok" },
  { id: "cat-joybees",     t: "Catálogo Joybees (interno)", url: "/catalogo/joybees" },
  { id: "pub-tommy",       t: "Catálogo Tommy (público)",   url: "/catalogo-publico/tommy",   publico: true },
  { id: "pub-reebok",      t: "Catálogo Reebok (público)",  url: "/catalogo-publico/reebok",  publico: true },
  { id: "pub-joybees",     t: "Catálogo Joybees (público)", url: "/catalogo-publico/joybees", publico: true },

  // ── Operación ──
  { id: "guias",           t: "Guías › Lista",          url: "/guias" },
  { id: "guias-nueva",     t: "Guías › Crear",          url: "/guias/nueva" },
  { id: "guias-imprimir",  t: "Guías › Imprimir",       url: `/guias/${GUIA}/imprimir` },
  { id: "packing",         t: "Packing Lists",          url: "/packing-lists", vacio: true },
  { id: "reclamos",        t: "Reclamos › Lista",       url: "/reclamos" },
  { id: "reclamos-emp",    t: "Reclamos › Por empresa", url: "/reclamos?empresa=Vistana+International" },
  { id: "reclamos-det",    t: "Reclamos › Detalle",     url: `/reclamos?${RECL}` },
  { id: "depurador",       t: "Depurador › Depurador",  url: "/productos/cargar" },
  { id: "dep-facturas",    t: "Depurador › Facturas",   url: "/productos/cargar", abrir: "Facturas Tienda" },
  { id: "dep-tallas",      t: "Depurador › Tallas",     url: "/productos/cargar", abrir: "Tallas" },
  { id: "dep-formulas",    t: "Depurador › Fórmulas",   url: "/productos/cargar", abrir: "Fórmulas por marca" },
  { id: "dep-reglas",      t: "Depurador › Reglas",     url: "/productos/cargar", abrir: "Reglas", vacio: true },
  { id: "dep-historial",   t: "Depurador › Historial",  url: "/productos/cargar", abrir: "Historial" },
  { id: "comisiones",      t: "Comisiones",             url: "/comisiones" },
  { id: "marketing",       t: "Marketing › Lista",      url: "/marketing" },
  { id: "mk-proyecto",     t: "Marketing › Proyecto",   url: `/marketing?proyecto=${PROY}` },
  { id: "mk-anulados",     t: "Marketing › Anulados",   url: "/marketing?vista=anulados" },
  { id: "mk-reportes",     t: "Marketing › Reportes",   url: "/marketing?vista=reportes" },
  { id: "mk-mobiliario",   t: "Marketing › Mobiliario", url: "/marketing/mobiliario" },
  { id: "caja",            t: "Caja Menuda › Períodos", url: "/caja" },
  { id: "caja-detalle",    t: "Caja Menuda › Detalle",  url: `/caja/${CAJA}` },
  { id: "gastos-empresa",  t: "Gastos de Empresa",      url: "/gastos-empresa", vacio: true },
  { id: "prestamos",       t: "Préstamos › Lista",      url: "/prestamos" },
  { id: "prestamos-ficha", t: "Préstamos › Ficha",      url: `/prestamos/${PREST}` },
  { id: "cheques",         t: "Cheques › Lista",        url: "/cheques" },
  { id: "cheques-cal",     t: "Cheques › Calendario",   url: "/cheques", abrir: "Calendario" },

  // ── Administración e inicio ──
  { id: "usuarios",        t: "Usuarios",               url: "/admin/usuarios" },
  { id: "data-health",     t: "Data Health",            url: "/admin/data-health" },
  { id: "home",            t: "Home",                   url: "/home" },
  { id: "g-operacion",     t: "Grupo › Operación",      url: "/g/operacion" },
  { id: "g-admin",         t: "Grupo › Administración", url: "/g/administracion" },
  { id: "g-ventas",        t: "Grupo › Ventas y clientes", url: "/g/ventas-clientes" },
];

const SONDA = `(() => {
  const VW = document.documentElement.clientWidth;
  const VH = document.documentElement.clientHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const cls = (el) => { const c = el.className; return (c && c.baseVal !== undefined ? c.baseVal : String(c||"")).slice(0,64); };
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\\s+/g," ").slice(0,36);

  // ── 1+2. Desbordes, SIN UMBRAL, clasificados por CAUSA ────────────────────
  //
  // 🩸 scrollWidth es LAYOUT y no ve el transform: scale. La guía impresa
  // mide 532px de layout dentro de un marco de 358 —"recorta 174"— pero está
  // escalada a 0.673 y se pinta en 358 exactos: entra entera. Medir layout ahí
  // da un ROJO falso, igual que medir arrastre daba un VERDE falso cuando el
  // contenedor recortaba en silencio. La verdad está en la geometría PINTADA,
  // que es lo único que el ojo ve: para cada contenedor que recorta se busca el
  // borde derecho real de sus descendientes y se compara con el suyo.
  const bordeReal = (el) => {
    const cs = getComputedStyle(el);
    const limite = el.getBoundingClientRect().right - (parseFloat(cs.paddingRight) || 0);
    let max = -Infinity;
    for (const h of el.querySelectorAll("*")) {
      if (!visible(h)) continue;
      // Solo lo que LLEVA CONTENIDO puede esconder un dato. Un overlay
      // transparente (p.ej. el botón que amplia la guía, absolute inset-0 sobre
      // la caja de PADDING) sobresale del content-box sin tapar nada.
      const tieneTexto = (h.textContent || "").trim().length > 0;
      const esMedia = h.tagName === "IMG" || h.tagName === "SVG" || h.tagName === "CANVAS";
      if (!tieneTexto && !esMedia) continue;
      const rh = h.getBoundingClientRect();
      if (rh.right > max) max = rh.right;
    }
    return max === -Infinity ? 0 : Math.round(max - limite);
  };

  const arrastra = [], recorta = [];
  for (const el of document.querySelectorAll("body *")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    if (el.children.length === 0) continue;          // texto con puntos suspensivos
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if (ox === "visible") continue;
    const r = el.getBoundingClientRect();
    if (r.left > VW || r.right < 0) continue;
    const it = { px: Math.round(sobra), visible: el.clientWidth, pide: el.scrollWidth, clase: cls(el), muestra: txt(el) };
    if (ox === "auto" || ox === "scroll") { arrastra.push(it); continue; }
    if (/swipeable-row/.test(cls(el))) continue;     // el swipe es intencional
    // RECORTA de verdad solo si algo se PINTA más allá del borde.
    const pintado = bordeReal(el);
    if (pintado > 1) recorta.push({ ...it, pintadoFuera: pintado });
  }
  arrastra.sort((a,b)=>b.px-a.px); recorta.sort((a,b)=>b.px-a.px);

  // ── 3. BORDE DERECHO REAL: ¿algo se pinta fuera de la ventana? ────────────
  // Es lo que el arrastre NO ve cuando un ancestro recorta en silencio.
  let fueraMax = 0, fueraQuien = null;
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed") continue;            // barras propias del cromo
    const r = el.getBoundingClientRect();
    const fuera = Math.round(r.right - VW);
    if (fuera > fueraMax) { fueraMax = fuera; fueraQuien = { clase: cls(el), muestra: txt(el), der: Math.round(r.right) }; }
  }

  // ── 5. Blancos táctiles < 44 px, en reposo ────────────────────────────────
  const chicos = [], vistos = new Set();
  const SEL = "button, a[href], [role=button], [role=menuitem], [role=tab], input:not([type=hidden]), select, textarea, summary";
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el)) continue;
    if (el.type === "checkbox" || el.type === "radio") continue;
    if (el.closest("#print-document")) continue;      // es papel, no interfaz
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    // El patrón de la casa: se ve chico pero el área de toque llega a 44 con un
    // ::after transparente. Se juzga el área REAL.
    const ps = getComputedStyle(el, "::after");
    if (ps && ps.content !== "none" && ps.position === "absolute") {
      const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
      if (r.height - n(ps.top) - n(ps.bottom) >= 44 && r.width - n(ps.left) - n(ps.right) >= 44) continue;
    }
    const t = (el.getAttribute("aria-label") || el.innerText || el.tagName).replace(/\\s+/g," ").trim().slice(0,26);
    const k = t + "|" + Math.round(r.width) + "x" + Math.round(r.height);
    if (vistos.has(k)) continue;
    vistos.add(k);
    chicos.push({ t, w: Math.round(r.width), h: Math.round(r.height) });
  }
  chicos.sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h));

  // ── 4+6. ¿La pantalla trajo algo? Cero es FALLA, no 0px ───────────────────
  const cuerpo = document.body.innerText || "";
  return {
    VW,
    arrastreCuerpo: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    arrastraMax: arrastra.length ? arrastra[0].px : 0,
    recortaMax: recorta.length ? recorta[0].px : 0,
    arrastra: arrastra.slice(0,3),
    recorta: recorta.slice(0,3),
    fueraMax, fueraQuien,
    chicos: chicos.length, ejChicos: chicos.slice(0,5),
    largoTexto: cuerpo.length,
    nInteractivos: document.querySelectorAll(SEL).length,
    enLogin: !!document.querySelector('input[type=password]'),
    mensajeVacio: /no hay |sin datos|sin resultados|todav[ií]a no|no se encontr/i.test(cuerpo.slice(0,4000)),
    titulo: (document.querySelector("h1,h2")?.innerText || "").trim().slice(0,40),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
const res = [];

for (const a of (UN_ANCHO ? ANCHOS.filter(x => x.n === UN_ANCHO) : ANCHOS)) {
  const ctx = await nav.newContext({ viewport: { width: a.w, height: a.h }, hasTouch: a.touch });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  for (const p of P) {
    if (SOLO && !SOLO.includes(p.id)) continue;
    const page = await ctx.newPage();
    const r = { id: p.id, t: p.t, ancho: a.n, vacioEsperado: !!p.vacio };
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(3000);
      // esperar a que el texto deje de crecer (los datos llegan después de hidratar)
      let prev = -1, iguales = 0;
      for (let i = 0; i < 34 && iguales < 3; i++) {
        await page.waitForTimeout(400);
        const n = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
        if (n === prev && n > 0) iguales++; else { iguales = 0; prev = n; }
      }
      if (p.abrir) {
        // Las pestañas del Depurador son un desplegable en angosto: hay que
        // abrirlo antes, o el click falla y se mide la pestaña equivocada.
        const disp = page.locator('[aria-haspopup="listbox"][aria-label="Sección del Depurador"]');
        if (await disp.isVisible().catch(() => false)) {
          await disp.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
        const op = page.getByRole("option", { name: p.abrir, exact: true }).first();
        const bt = page.getByRole("button", { name: p.abrir, exact: true }).first();
        const destino = (await op.count().catch(() => 0)) ? op : bt;
        await destino.click({ timeout: 8000 }).catch(() => { r.noAbrio = p.abrir; });
        await page.waitForTimeout(2600);
      }
      Object.assign(r, await page.evaluate(SONDA));
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${a.n}.png`) });
    } catch (e) {
      r.error = String(e.message).slice(0, 120);
    }
    // Veredicto por fila
    if (r.error) r.estado = "ERROR";
    else if (r.enLogin) r.estado = "ERROR-LOGIN";
    else if (!r.largoTexto || !r.nInteractivos) r.estado = "ERROR-VACIO";   // cero = falla
    else if (p.vacio || (r.mensajeVacio && r.largoTexto < 1200)) r.estado = "SIN-DATOS";
    else if (r.recortaMax > 0 || r.fueraMax > 1) r.estado = "RECORTA";
    else if (r.arrastraMax > 0 || r.arrastreCuerpo > 0) r.estado = "ARRASTRA";
    else r.estado = "OK";
    res.push(r);
    console.error(
      `[${a.n.padStart(4)}] ${p.t.padEnd(30)} ${r.estado.padEnd(11)} arr=${String(r.arrastraMax ?? "-").padStart(4)} rec=${String(r.recortaMax ?? "-").padStart(4)} fuera=${String(r.fueraMax ?? "-").padStart(3)} tap<44=${String(r.chicos ?? "-").padStart(3)}${r.noAbrio ? " ✗noAbrió" : ""}${r.error ? " " + r.error : ""}`
    );
    await page.close();
    writeFileSync(path.join(SALIDA, UN_ANCHO ? `final-${UN_ANCHO}.json` : "final.json"), JSON.stringify(res, null, 2));
  }
  await ctx.close();
}
await nav.close();
writeFileSync(path.join(SALIDA, UN_ANCHO ? `final-${UN_ANCHO}.json` : "final.json"), JSON.stringify(res, null, 2));

// ── Veredicto ────────────────────────────────────────────────────────────────
const malos = res.filter(r => ["RECORTA", "ARRASTRA", "ERROR", "ERROR-LOGIN", "ERROR-VACIO"].includes(r.estado));
const tap = res.filter(r => r.chicos > 0 && r.ancho !== "1440");
console.error("\n" + "═".repeat(72));
if (!malos.length) console.error(`✅ VEREDICTO: 0 px de arrastre y 0 de recorte en las ${P.length} pantallas × 4 anchos.`);
else {
  console.error(`⛔ VEREDICTO: ${malos.length} medición(es) NO están en 0:`);
  for (const m of malos) console.error(`   ${m.estado.padEnd(11)} ${m.t} @${m.ancho}  arr=${m.arrastraMax} rec=${m.recortaMax} fuera=${m.fueraMax}`);
}
console.error(tap.length ? `⚠️  ${tap.length} medición(es) con controles < 44px (390/834/1024)` : "✅ 0 controles bajo 44 px en los anchos táctiles");
const sinDatos = [...new Set(res.filter(r => r.estado === "SIN-DATOS").map(r => r.t))];
if (sinDatos.length) console.error(`ℹ️  SIN DATOS en producción (su 0 no prueba nada): ${sinDatos.join(" · ")}`);
console.error(`\n${res.length} mediciones → ${SALIDA}/final.json`);
