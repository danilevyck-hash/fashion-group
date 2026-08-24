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
// 🔴 EL SCRIPT FALLA SI NO ENCUENTRA LOS CAMPOS. Desde el 24-ago-2026 los
// llevan LAS CUATRO MARCAS (Daniel: *"sí, pero no quiero botones de precios,
// solo escribirlo y ya"*), así que faltar en cualquiera es un fallo. Medir
// cero y dar verde sin haber mirado nada es el peor resultado posible.
//
// 🔴 Y FALLA SI APARECE UN BOTÓN DE PRECIO. La fila de botones (`$22`, `$17.50`,
// "Ver los 41 precios") se retiró entera. Un candado que solo mira anchos
// pasaría en verde con la fila de vuelta.
//
// ⚠️ PERO EL AVISO DE "ESE PRECIO NO EXISTE" TIENE QUE SEGUIR SALIENDO, y se
// comprueba escribiendo un precio que el catálogo no tiene: Tommy tiene $17.50
// y NO tiene $17. Sin ese aviso la pantalla parece rota. El script falla si el
// aviso no aparece en una marca que sí tiene precios cargados.
//
// 📏 SE MIDE EL ALTO DE LA ZONA DE FILTROS (`div.space-y-3.mb-6`) y se compara
// contra `origin/main`: sacar los botones tiene que REDUCIRLO.
//
// Y no se queda en el ancho: en cada pantalla ESCRIBE en «desde» y verifica que
// «hasta» se copió, después toca «hasta» y verifica que el espejo se apagó. Un
// candado de píxeles pasaría con el espejo roto.
//
// ── QUÉ ES FALLA Y QUÉ ES HERENCIA ───────────────────────────────────────────
// El arrastre de PÁGINA y todo lo que pase dentro de la ZONA DE FILTROS
// (`div.space-y-3.mb-6`, que es lo que cambió) tiene que dar cero: eso es lo
// que se está entregando, y su ALTO tiene que bajar contra main. Los táctiles y los textos chicos de la GRILLA de
// productos ("Bulto de 12" a 10px, "Agregar" a 38px) son heredados y se
// reportan aparte, con el número de `origin/main` al lado, para que se vea que
// no subieron. Con `BASELINE=1` el script mide `origin/main`: no exige los
// campos de precio ni prueba el espejo, no exige que falten los botones, y
// tolera que Reebok/Joybees no tengan el filtro (en main todavía no lo tienen):
// solo deja los números de referencia, alto de la zona incluido.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
/** BASELINE=1 mide `origin/main`: sin campos de precio y sin espejo. */
const BASELINE = process.env.BASELINE === "1";
const SALIDA = "/tmp/t213-precio-exacto";
const SUFIJO = BASELINE ? "main-" : "";
// Un precio con centavos que ningún catálogo tiene: sirve para las 4 marcas sin
// tener que saber de antemano sus precios reales.
const PRECIO_QUE_NO_EXISTE = "13.37";
const ANCHOS = [390, 834, 1024, 1440];
// Desde el 24-ago-2026 las CUATRO llevan el filtro de precio (Daniel). En
// `origin/main` solo lo llevan tommy y calvin, y por eso con BASELINE=1 no se
// exige: ahí se está midiendo el estado viejo a propósito.
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
// El desplegable de tramos que Daniel mandó retirar el 23-ago.
const PROHIBIDOS = ["Precio: todos", "Hasta $22", "$23 a $31", "$32 a $48", "$49 o más"];
// El encabezado de la fila de botones que Daniel mandó retirar el 24-ago.
const PROHIBIDO_BOTONES = "Precios de este catálogo";

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

  // 🔴 Botones cuyo TEXTO es un precio: la fila retirada el 24-ago-2026. Se
  // buscan en TODA la zona de filtros, no solo dentro del bloque de precio —
  // si alguien la devolviera un nivel más arriba, seguiría siendo la fila.
  const botonesPrecio = zona
    ? [...zona.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /^\$[\d.,]+$/.test(t))
    : [];
  const verLosNPrecios = botones.filter((t) => /^Ver (los \d+ precios|menos)$/.test(t));

  // El alto de la zona de filtros: es lo que la fila de botones inflaba.
  const altoZona = zona ? Math.round(zona.getBoundingClientRect().height) : 0;

  // El aviso de "ese precio no existe" (`role="status"` dentro de la zona).
  const aviso = zona ? zona.querySelector('[role="status"]') : null;
  const avisoTexto = aviso ? (aviso.textContent || "").trim() : "";

  return {
    arrastrePagina, recortados, recortesZona, chicos, textoChico,
    chicosPagina, textoChicoPagina, textoPagina, botones,
    botonesPrecio, verLosNPrecios, altoZona, avisoTexto,
    hayZona: !!zona,
  };
};

const browser = await chromium.launch();
const filaCsv = [];
let fallos = 0;
let medidos = 0;
const altoPorPantalla = {};

for (const marca of MARCAS) {
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/catalogo-publico/${marca}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1500);

    const problemas = [];
    const desde = page.locator('input[aria-label="Precio desde"]');
    const hasta = page.locator('input[aria-label="Precio hasta"]');

    // ── ¿Se midió algo de verdad? ────────────────────────────────────────────
    const nCampos = await desde.count();
    const nHasta = await hasta.count();
    const hayGrilla = (await page.locator("input").count()) > 0;
    if (!hayGrilla) problemas.push("NO encontré ni el buscador — la medición no probó nada");
    // 🔴 Desde el 24-ago-2026 los campos van en LAS CUATRO marcas.
    if (!BASELINE && (nCampos !== 1 || nHasta !== 1)) {
      problemas.push(`faltan los campos de precio (desde=${nCampos}, hasta=${nHasta})`);
    }
    const conCampos = nCampos === 1 && nHasta === 1;

    const r = await page.evaluate(MEDIR);
    medidos++;

    // ── Ni el desplegable de tramos ni la fila de botones vuelven ────────────
    if (!r.hayZona) problemas.push("NO encontré la zona de filtros — la medición no probó nada");
    const vueltos = PROHIBIDOS.filter((p) =>
      r.botones.some((b) => b === p) || r.textoPagina.includes(p),
    );
    if (!BASELINE && vueltos.length) problemas.push(`VOLVIÓ el desplegable: ${vueltos.join(", ")}`);
    if (!BASELINE) {
      if (r.botonesPrecio.length) {
        problemas.push(`VOLVIÓ la fila de botones: ${r.botonesPrecio.slice(0, 6).join(" ")}${r.botonesPrecio.length > 6 ? " …" : ""} (${r.botonesPrecio.length})`);
      }
      if (r.verLosNPrecios.length) problemas.push(`VOLVIÓ "${r.verLosNPrecios[0]}"`);
      if (r.textoPagina.includes(PROHIBIDO_BOTONES)) problemas.push(`VOLVIÓ "${PROHIBIDO_BOTONES}"`);
      if (r.avisoTexto) problemas.push(`el aviso está puesto SIN haber escrito nada: "${r.avisoTexto}"`);
    }

    // ── 🔴 CONDUCTA 1: el espejo, en el navegador ────────────────────────────
    let espejo = "n/a";
    if (!BASELINE && conCampos) {
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

    // ── 🔴 CONDUCTA 2: EL AVISO DE "ESE PRECIO NO EXISTE" SIGUE VIVO ─────────
    // Es lo que Daniel NO retiró, y lo que evita que la pantalla parezca rota.
    // Ida y vuelta, para que no valga un aviso pegado que siempre está:
    //   (a) se escribe un precio con centavos absurdos → tiene que AVISAR y
    //       ofrecer el precio real más cercano;
    //   (b) se escribe ESE precio ofrecido → el aviso tiene que APAGARSE y la
    //       grilla tiene que devolver productos.
    let avisoEstado = "n/a";
    if (!BASELINE && conCampos) {
      await desde.fill(PRECIO_QUE_NO_EXISTE);
      await page.waitForTimeout(250);
      const m1 = await page.evaluate(MEDIR);
      // 🩸 El precio NO se saca con `\$[\d.,]+`: el aviso TERMINA en punto
      // ("Lo más cercano: $16 o $17.50.") y esa clase golosa se come el punto
      // final — devolvía "$14." y "$15.", que el propio filtro rechaza como
      // "eso no es un precio". El chequeo daba 🔴 por culpa del MEDIDOR.
      const cercano = (m1.avisoTexto.match(/\$\d[\d,]*(?:\.\d+)?/g) || []).pop();
      if (!m1.avisoTexto) {
        problemas.push(`SIN AVISO con un precio inexistente (${PRECIO_QUE_NO_EXISTE}) — el aviso se perdió`);
        avisoEstado = "aviso 🔴";
      } else if (!cercano) {
        problemas.push(`el aviso no ofrece ningún precio cercano: "${m1.avisoTexto}"`);
        avisoEstado = "aviso 🔴";
      } else {
        await desde.fill(cercano.replace("$", "").replace(/,/g, ""));
        await page.waitForTimeout(250);
        const m2 = await page.evaluate(MEDIR);
        if (m2.avisoTexto) {
          problemas.push(`el aviso NO se apaga con un precio que sí existe (${cercano}): "${m2.avisoTexto}" · el aviso original decía "${m1.avisoTexto}"`);
          avisoEstado = "aviso 🔴";
        } else {
          avisoEstado = `aviso ✅ (ofreció ${cercano})`;
        }
      }
      await desde.fill("");
      await page.waitForTimeout(250);
    }

    if (r.arrastrePagina > 0) problemas.push(`arrastre de página ${r.arrastrePagina}px`);
    if (r.chicos.length) problemas.push(`${r.chicos.length} táctiles <44px EN LOS FILTROS`);
    if (r.textoChico.length) problemas.push(`${r.textoChico.length} textos <12px EN LOS FILTROS`);
    if (r.recortesZona) problemas.push(`${r.recortesZona} recortes EN LOS FILTROS`);

    altoPorPantalla[`${marca}@${ancho}`] = { alto: r.altoZona, campos: conCampos, botones: r.botonesPrecio.length };

    const estado = [
      `alto zona ${r.altoZona}px`,
      `arrastre ${r.arrastrePagina}px`,
      `filtros: recortes ${r.recortesZona} · <44px ${r.chicos.length} · texto<12px ${r.textoChico.length}`,
      `página (herencia): recortes ${r.recortados.length} · <44px ${r.chicosPagina.length} · texto<12px ${r.textoChicoPagina.length}`,
      `botones de precio ${r.botonesPrecio.length}`,
      espejo,
      avisoEstado,
    ].join(" · ");

    const mal = problemas.length > 0;
    if (mal) fallos++;
    console.log(`  ${mal ? "🔴" : "✅"} ${marca.padEnd(8)} @${String(ancho).padStart(4)}  ${estado}`);
    for (const x of problemas) console.log(`        ⚠️  ${x}`);
    for (const x of r.recortados.slice(0, 3)) console.log(`        recorte ${x.px}px  ${x.tag}.${x.cls}`);
    for (const x of r.chicos.slice(0, 3)) console.log(`        táctil ${x.alto}px  "${x.txt}"`);
    for (const x of r.textoChico.slice(0, 3)) console.log(`        texto ${x.px}px  "${x.txt}"`);
    filaCsv.push([marca, ancho, r.altoZona, r.arrastrePagina, r.recortesZona, r.chicos.length, r.textoChico.length, r.botonesPrecio.length, r.recortados.length, r.chicosPagina.length, r.textoChicoPagina.length].join(","));

    await page.screenshot({ path: `${SALIDA}/${SUFIJO}${marca}-${ancho}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();

console.log("");
console.log("  marca,ancho,altoZona,arrastre,recortesZona,tactiles<44 zona,texto<12 zona,botonesPrecio,recortesPagina,tactiles<44 pagina,texto<12 pagina");
for (const f of filaCsv) console.log(`  ${f}`);
console.log("");

// El alto de la zona de filtros, para poder restarlo contra la otra corrida.
writeFileSync(`${SALIDA}/alto-${BASELINE ? "main" : "rama"}.json`, JSON.stringify(altoPorPantalla, null, 2));
console.log(`  alto de la zona de filtros → ${SALIDA}/alto-${BASELINE ? "main" : "rama"}.json`);
const otro = `${SALIDA}/alto-${BASELINE ? "rama" : "main"}.json`;
if (existsSync(otro)) {
  const previo = JSON.parse(readFileSync(otro, "utf8"));
  const main = BASELINE ? altoPorPantalla : previo;
  const rama = BASELINE ? previo : altoPorPantalla;
  console.log("");
  console.log("  ── ALTO DE LA ZONA DE FILTROS: origin/main → esta rama ──");
  console.log("  (las marcas que YA tenían el filtro tienen que ENCOGER: se les fue la fila de botones)");
  let peorEncogen = 0;
  for (const k of Object.keys(rama)) {
    if (!(k in main)) continue;
    const a = main[k], b = rama[k];
    const d = b.alto - a.alto;
    // 🔴 DOS GRUPOS, y meterlos en la misma cuenta daría un veredicto FALSO:
    //   · main YA tenía los campos (tommy, calvin) → se le fue la fila de
    //     botones y nada más: el alto TIENE que bajar;
    //   · main NO los tenía (reebok, joybees) → estrenan el filtro entero, así
    //     que crecen a propósito. Exigirles encoger sería exigirles no tener
    //     la función que Daniel pidió.
    const estrena = !a.campos && b.campos;
    if (!estrena && d > peorEncogen) peorEncogen = d;
    const nota = estrena
      ? `ESTRENA el campo (main no lo tenía)`
      : `se le fueron ${a.botones} botones`;
    console.log(`  ${k.padEnd(16)} ${String(a.alto).padStart(4)}px → ${String(b.alto).padStart(4)}px   ${d > 0 ? "+" : ""}${d}px   ${nota}`);
  }
  if (!BASELINE && peorEncogen > 0) {
    console.log(`🔴 en una marca que YA tenía el filtro la zona CRECIÓ hasta ${peorEncogen}px — sacar los botones tenía que reducirla.`);
    fallos++;
  }
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
