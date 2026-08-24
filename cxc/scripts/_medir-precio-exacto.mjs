// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos (+ el iPad acostado) del filtro de precio
// EXACTO del catálogo, y COMPRUEBA SU CONDUCTA en el navegador de verdad.
//
// Se mide el catálogo PÚBLICO porque no pide sesión (`/catalogo-publico/[marca]`
// está en PUBLIC_PREFIXES del middleware) y usa EXACTAMENTE el mismo
// `CatalogoFilters` que el interno — que es el componente que cambió.
//
//   BASE=http://localhost:3111 node scripts/_medir-precio-exacto.mjs
//
// Gotchas de medición de la casa:
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar (bloquearlo
//     de otra forma mata la hidratación);
//   · un scroller DECLARADO (`overflow-x:auto`) no es un recorte: es el
//     mecanismo. Se excluye.
//
// 🔴 EL SCRIPT FALLA SI NO ENCUENTRA LOS CAMPOS en Tommy y Calvin, y también si
// los ENCUENTRA en Reebok o Joybees (que no llevan filtro de precio). Medir
// cero y dar verde sin haber mirado nada es el peor resultado posible.
//
// Y no se queda en el ancho: en cada pantalla ESCRIBE en «desde» y verifica que
// «hasta» se copió, después toca «hasta» y verifica que el espejo se apagó. Un
// candado de píxeles pasaría con el espejo roto.
//
// ── QUÉ ES FALLA Y QUÉ ES HERENCIA ───────────────────────────────────────────
// El arrastre de PÁGINA y todo lo que pase dentro de la ZONA DE FILTROS
// (`div.space-y-3.mb-6`, que es lo que cambió) tiene que dar cero: eso es lo
// que se está entregando. Los táctiles y los textos chicos de la GRILLA de
// productos ("Bulto de 12" a 10px, "Agregar" a 38px) son heredados y se
// reportan aparte, con el número de `origin/main` al lado, para que se vea que
// no subieron. Con `BASELINE=1` el script mide `origin/main`: no exige los
// campos de precio ni prueba el espejo, solo deja los números de referencia.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
/** BASELINE=1 mide `origin/main`: sin campos de precio y sin espejo. */
const BASELINE = process.env.BASELINE === "1";
const SALIDA = "/tmp/t213-precio-exacto";
const ANCHOS = [390, 834, 1024, 1440];
// `precio` = ¿esta marca lleva el filtro de precio? (MARCA_THEME.filtroPrecio)
const MARCAS = [
  { key: "reebok", precio: false },
  { key: "joybees", precio: false },
  { key: "tommy", precio: true },
  { key: "calvin", precio: true },
];
// El desplegable de tramos que Daniel mandó retirar.
const PROHIBIDOS = ["Precio: todos", "Hasta $22", "$23 a $31", "$32 a $48", "$49 o más"];

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

  const recortados = [...document.querySelectorAll("body div *")]
    .filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
    })
    .map((e) => ({
      tag: e.tagName,
      cls: (e.className || "").toString().slice(0, 60),
      px: e.scrollWidth - e.clientWidth,
    }));

  // La zona que cambió: el bloque de filtros del catálogo.
  const zona = document.querySelector("div.space-y-3.mb-6");

  // Todo lo que se toca tiene que medir 44 px de alto.
  const tactilesChicos = (raiz) => [...raiz.querySelectorAll("button, a, input, select")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 44;
    })
    .map((e) => ({
      txt: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30),
      alto: Math.round(e.getBoundingClientRect().height),
    }));

  // Textos por debajo de 12 px.
  const textosChicos = (raiz) => [...raiz.querySelectorAll("*")]
    .filter((e) => {
      if (!e.textContent || !e.textContent.trim()) return false;
      if (e.children.length > 0) return false;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      return fs > 0 && fs < 12;
    })
    .map((e) => ({ txt: e.textContent.trim().slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize) }));

  const chicos = zona ? tactilesChicos(zona) : [];
  const textoChico = zona ? textosChicos(zona) : [];
  const chicosPagina = tactilesChicos(document.body);
  const textoChicoPagina = textosChicos(document.body);
  const recortesZona = zona
    ? [...zona.querySelectorAll("*")].filter((e) => {
      const st = getComputedStyle(e);
      if (st.overflowX === "auto" || st.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
    }).length
    : 0;

  const textoPagina = document.body.innerText || "";
  const botones = [...document.querySelectorAll("button, [role='option']")]
    .map((b) => (b.textContent || "").trim());
  // Los precios que la pantalla dice que existen (los botones del bloque).
  const desde = document.querySelector('input[aria-label="Precio desde"]');
  const bloque = desde ? desde.closest('div[class*="space-y-1.5"]') : null;
  const preciosListados = bloque
    ? [...bloque.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /^\$[\d.,]+$/.test(t))
    : [];

  return {
    arrastrePagina, recortados, recortesZona, chicos, textoChico,
    chicosPagina, textoChicoPagina, textoPagina, botones, preciosListados,
    hayZona: !!zona,
  };
};

const browser = await chromium.launch();
const filaCsv = [];
let fallos = 0;
let medidos = 0;
const preciosPorMarca = {};

for (const marca of MARCAS) {
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/catalogo-publico/${marca.key}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1500);

    const problemas = [];

    // ── ¿Se midió algo de verdad? ────────────────────────────────────────────
    const nCampos = await page.locator('input[aria-label="Precio desde"]').count();
    const nHasta = await page.locator('input[aria-label="Precio hasta"]').count();
    const hayGrilla = (await page.locator("input").count()) > 0;
    if (!hayGrilla) problemas.push("NO encontré ni el buscador — la medición no probó nada");
    if (!BASELINE && marca.precio && (nCampos !== 1 || nHasta !== 1)) {
      problemas.push(`faltan los campos de precio (desde=${nCampos}, hasta=${nHasta})`);
    }
    if (!BASELINE && !marca.precio && (nCampos > 0 || nHasta > 0)) {
      problemas.push("esta marca NO lleva filtro de precio y aparecieron los campos");
    }

    const r = await page.evaluate(MEDIR);
    medidos++;

    // ── El desplegable de tramos no vuelve ───────────────────────────────────
    if (!r.hayZona) problemas.push("NO encontré la zona de filtros — la medición no probó nada");
    const vueltos = PROHIBIDOS.filter((p) =>
      r.botones.some((b) => b === p) || r.textoPagina.includes(p),
    );
    if (!BASELINE && vueltos.length) problemas.push(`VOLVIÓ el desplegable: ${vueltos.join(", ")}`);

    // ── 🔴 CONDUCTA: el espejo, en el navegador ──────────────────────────────
    let espejo = "n/a";
    if (!BASELINE && marca.precio && nCampos === 1 && nHasta === 1) {
      const desde = page.locator('input[aria-label="Precio desde"]');
      const hasta = page.locator('input[aria-label="Precio hasta"]');
      await desde.fill("22");
      await page.waitForTimeout(120);
      const copiado = await hasta.inputValue();
      // Tocar «hasta» apaga el espejo.
      await hasta.fill("52");
      await desde.fill("28");
      await page.waitForTimeout(120);
      const apagado = await hasta.inputValue();
      // Vaciar «hasta» lo vuelve a encender.
      await hasta.fill("");
      await desde.fill("38");
      await page.waitForTimeout(120);
      const reencendido = await hasta.inputValue();
      const ok = copiado === "22" && apagado === "52" && reencendido === "38";
      espejo = ok ? "espejo ✅" : `espejo 🔴 (copió="${copiado}" apagó="${apagado}" reencendió="${reencendido}")`;
      if (!ok) problemas.push(espejo);
      await desde.fill("");
      await page.waitForTimeout(200);
    }

    if (r.arrastrePagina > 0) problemas.push(`arrastre de página ${r.arrastrePagina}px`);
    if (r.chicos.length) problemas.push(`${r.chicos.length} táctiles <44px EN LOS FILTROS`);
    if (r.textoChico.length) problemas.push(`${r.textoChico.length} textos <12px EN LOS FILTROS`);
    if (r.recortesZona) problemas.push(`${r.recortesZona} recortes EN LOS FILTROS`);

    if (marca.precio) preciosPorMarca[marca.key] = r.preciosListados;

    const estado = [
      `arrastre ${r.arrastrePagina}px`,
      `filtros: recortes ${r.recortesZona} · <44px ${r.chicos.length} · texto<12px ${r.textoChico.length}`,
      `página (herencia): recortes ${r.recortados.length} · <44px ${r.chicosPagina.length} · texto<12px ${r.textoChicoPagina.length}`,
      `precios ${r.preciosListados.length}`,
      espejo,
    ].join(" · ");

    const mal = problemas.length > 0;
    if (mal) fallos++;
    console.log(`  ${mal ? "🔴" : "✅"} ${marca.key.padEnd(8)} @${String(ancho).padStart(4)}  ${estado}`);
    for (const x of problemas) console.log(`        ⚠️  ${x}`);
    for (const x of r.recortados.slice(0, 3)) console.log(`        recorte ${x.px}px  ${x.tag}.${x.cls}`);
    for (const x of r.chicos.slice(0, 3)) console.log(`        táctil ${x.alto}px  "${x.txt}"`);
    for (const x of r.textoChico.slice(0, 3)) console.log(`        texto ${x.px}px  "${x.txt}"`);
    filaCsv.push([marca.key, ancho, r.arrastrePagina, r.recortesZona, r.chicos.length, r.textoChico.length, r.recortados.length, r.chicosPagina.length, r.textoChicoPagina.length].join(","));

    await page.screenshot({ path: `${SALIDA}/${marca.key}-${ancho}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();

console.log("");
console.log("  marca,ancho,arrastre,recortesZona,tactiles<44 zona,texto<12 zona,recortesPagina,tactiles<44 pagina,texto<12 pagina");
for (const f of filaCsv) console.log(`  ${f}`);
console.log("");
for (const [m, precios] of Object.entries(preciosPorMarca)) {
  console.log(`  precios de ${m}: ${precios.length} → ${precios.join(" ")}`);
}
console.log("");
console.log("════════════════════════════════════════════");
console.log(`  pantallas medidas: ${medidos}   ·   fallos: ${fallos}`);
console.log("════════════════════════════════════════════");
if (medidos === 0) {
  console.log("🔴 NO se midió NADA — el script no prueba nada. Falla.");
  process.exit(1);
}
process.exit(fallos === 0 ? 0 : 1);
