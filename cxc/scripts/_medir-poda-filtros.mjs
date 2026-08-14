// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos (+ el iPad acostado) de la fila de filtros
// del catálogo, después de retirar los chips «Oferta / Nuevo / Próximamente».
//
// Se mide el catálogo PÚBLICO porque no pide sesión (`/catalogo-publico/[marca]`
// está en PUBLIC_PREFIXES del middleware) y usa EXACTAMENTE el mismo
// `CatalogoFilters` que el interno — que es el componente que cambió.
//
//   BASE=http://localhost:3111 node scripts/_medir-poda-filtros.mjs
//
// Gotchas de medición de la casa:
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar (bloquearlo
//     de otra forma mata la hidratación);
//   · un scroller DECLARADO (`overflow-x:auto`) no es un recorte: es el
//     mecanismo. Se excluye.
//
// El script FALLA si no encuentra los filtros o si aparece cualquiera de los
// tres chips retirados — medir cero y dar verde sin haber mirado nada es el
// peor resultado posible.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const SALIDA = "/tmp/t203-poda-filtros";
const ANCHOS = [390, 834, 1024, 1440];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const PROHIBIDOS = ["Oferta", "Nuevo", "Próximamente"];

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

  // Todo lo que se toca tiene que medir 44 px de alto.
  const chicos = [...document.querySelectorAll("button, a, input, select")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 44;
    })
    .map((e) => ({ txt: (e.textContent || "").trim().slice(0, 30), alto: Math.round(e.getBoundingClientRect().height) }));

  // Textos por debajo de 12 px.
  const textoChico = [...document.querySelectorAll("body *")]
    .filter((e) => {
      if (!e.textContent || !e.textContent.trim()) return false;
      if (e.children.length > 0) return false;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      return fs > 0 && fs < 12;
    })
    .map((e) => ({ txt: e.textContent.trim().slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize) }));

  const textoPagina = document.body.innerText || "";
  const botones = [...document.querySelectorAll("button, [role='option']")]
    .map((b) => (b.textContent || "").trim());

  return { arrastrePagina, recortados, chicos, textoChico, textoPagina, botones };
};

const browser = await chromium.launch();
let fallos = 0;
let medidos = 0;

for (const marca of MARCAS) {
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/catalogo-publico/${marca}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(MEDIR);

    // ¿Se midió algo de verdad? Tiene que haber filtros en pantalla.
    const hayFiltros = r.botones.some((b) => /Género|Ordenar|Buscar/i.test(b))
      || (await page.locator("input").count()) > 0;
    if (!hayFiltros) {
      console.log(`  🔴 ${marca} @${ancho}: NO encontré los filtros — la medición no probó nada`);
      fallos++;
      await ctx.close();
      continue;
    }
    medidos++;

    // Ninguno de los tres chips puede estar.
    const vueltos = PROHIBIDOS.filter((p) =>
      r.botones.some((b) => b === p) || new RegExp(`\\b${p}\\b`).test(r.textoPagina),
    );

    const estado = [
      `arrastre ${r.arrastrePagina}px`,
      `recortados ${r.recortados.length}`,
      `<44px ${r.chicos.length}`,
      `texto<12px ${r.textoChico.length}`,
    ].join(" · ");
    const mal = r.arrastrePagina > 0 || vueltos.length > 0;
    if (mal) fallos++;
    console.log(`  ${mal ? "🔴" : "✅"} ${marca.padEnd(8)} @${String(ancho).padStart(4)}  ${estado}${vueltos.length ? `  ← VOLVIERON: ${vueltos.join(", ")}` : ""}`);
    if (r.recortados.length) {
      for (const x of r.recortados.slice(0, 3)) console.log(`        recorte ${x.px}px  ${x.tag}.${x.cls}`);
    }
    if (r.chicos.length) {
      for (const x of r.chicos.slice(0, 3)) console.log(`        táctil ${x.alto}px  "${x.txt}"`);
    }

    await page.screenshot({ path: `${SALIDA}/${marca}-${ancho}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();

console.log("");
console.log("════════════════════════════════════════════");
console.log(`  pantallas medidas: ${medidos}   ·   fallos: ${fallos}`);
console.log("════════════════════════════════════════════");
if (medidos === 0) {
  console.log("🔴 NO se midió NADA — el script no prueba nada. Falla.");
  process.exit(1);
}
process.exit(fallos === 0 ? 0 : 1);
