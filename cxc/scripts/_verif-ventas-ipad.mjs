// ¿CAMBIÓ ALGÚN NÚMERO al pasar Ventas y Vista General a tarjetas en celular y
// iPad? Lee la MISMA pantalla en dos anchos y compara dato por dato.
//
// 🩸 LA TRAMPA QUE ESTE SCRIPT EVITA. La forma obvia de escribirlo es buscar la
// vista angosta por su clase de breakpoint (`.md\:hidden`, `.lg\:hidden`). Es una
// trampa: si el corte se mueve —que es EXACTAMENTE lo que hace este cambio, de
// `md` a `lg`— el selector no encuentra nada, la comparación recorre cero
// elementos y el chequeo **pasa en verde sin haber comparado un solo número**.
// Un verificador que aprueba el silencio es peor que no tener verificador.
//
// Por eso el ancla es un atributo `data-` ESTABLE que no depende de ningún
// breakpoint: `data-fila-cliente`, `data-fila-utilidad`, `data-fila-producto`,
// `data-fila-semaforo`, y dentro de cada fila `data-col="..."`. La fila de la
// tabla y la tarjeta llevan la MISMA clave, así que cruzarlas es un join.
//
// Y hay un CONTROL DE VACÍO explícito: si en cualquiera de los dos anchos no
// aparecen filas, el script FALLA. "0 diferencias sobre 0 filas" no es un
// aprobado.
//
// Solo lectura: no toca ningún botón que ejecute nada.
//
//   BASE=http://localhost:3172 node scripts/_verif-ventas-ipad.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3172";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

/** Ancho angosto (tarjetas) contra ancho ancho (tabla), pantalla por pantalla. */
const CASOS = [
  {
    id: "Ventas › Clientes",
    url: "/ventas?tab=clientes",
    ancla: "data-fila-cliente",
    // `ytd` (tabla) vs `ytd-compacto` (tarjeta) NO se comparan como texto: la
    // tarjeta usa formato compacto ($27K) desde MUCHO antes de este cambio.
    // Se comparan por VALOR con la tolerancia que impone esa precisión.
    columnas: ["nombre", "codigo", "delta", "ultima"],
    compacto: { tarjeta: "ytd-compacto", tabla: "ytd" },
    // Columna que a propósito NO se compara, dicho en voz alta para que la
    // exclusión no sea la misma trampa con otro disfraz: para un cliente que le
    // compra a varias empresas la TABLA muestra "6 empresas" (con el desglose en
    // un tooltip, que en pantalla táctil no existe) y la TARJETA muestra la
    // empresa principal. Es una divergencia que YA estaba en `origin/main`
    // —verificable ahí mismo, líneas 685 y 795— y no la tocó este cambio.
    noComparadas: { empresa: 'la tabla colapsa a "N empresas" y la tarjeta muestra la principal (ya era así en main)' },
    angosto: 390,
    ancho: 1440,
  },
  {
    id: "Ventas › Utilidad",
    url: "/ventas?tab=utilidad",
    ancla: "data-fila-utilidad",
    columnas: ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"],
    angosto: 390,
    ancho: 1440,
  },
  {
    id: "Ventas › Utilidad (iPad)",
    url: "/ventas?tab=utilidad",
    ancla: "data-fila-utilidad",
    columnas: ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"],
    angosto: 834,
    ancho: 1440,
  },
  {
    id: "Ventas › Productos",
    url: "/ventas?tab=productos",
    ancla: "data-fila-producto",
    // Códigos/Cant/Δ se ocultan bajo `sm`, igual que ANTES de este cambio: no
    // se comparan a 390 porque no están en ninguno de los dos lados.
    columnas: ["descripcion", "venta", "margen"],
    angosto: 390,
    ancho: 1440,
  },
  {
    id: "Vista General › Semáforo",
    url: "/vista-general",
    ancla: "data-fila-semaforo",
    columnas: ["empresa", "ventas", "rentabilidad", "pct", "estado"],
    angosto: 390,
    ancho: 1440,
  },
];

const leer = (ancla, columnas) => `(() => {
  const out = {};
  for (const fila of document.querySelectorAll("[${ancla}]")) {
    const r = fila.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;          // la forma escondida no cuenta
    const clave = fila.getAttribute("${ancla}");
    const celdas = {};
    for (const col of ${JSON.stringify(columnas)}) {
      const c = fila.querySelector('[data-col="' + col + '"]');
      celdas[col] = c ? (c.textContent ?? "").replace(/\\s+/g, " ").trim() : null;
    }
    out[clave] = celdas;
  }
  return out;
})()`;

const leerCompacto = (ancla, col) => `(() => {
  const out = {};
  for (const fila of document.querySelectorAll("[${ancla}]")) {
    const r = fila.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const c = fila.querySelector('[data-col="${col}"]');
    if (c) out[fila.getAttribute("${ancla}")] = (c.textContent ?? "").replace(/\\s+/g, " ").trim();
  }
  return out;
})()`;

// "$27K" / "-$1.2M" / "$1,234.56" → número. La TOLERANCIA sale de la precisión
// que el texto muestra, no de un porcentaje al ojo: "$27K" no distingue nada por
// debajo de medio millar, así que exigirle 0,5% lo marcaría como "cambió el
// número" siendo sólo el redondeo con el que se dibuja.
function parsePlata(txt) {
  if (txt == null) return null;
  const m = /(-?)\s*\$?\s*([\d.,]+)\s*([KkMm]?)/.exec(txt.replace(/−/g, "-"));
  if (!m) return null;
  const signo = m[1] === "-" || /^-/.test(txt.trim()) ? -1 : 1;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = m[3].toUpperCase() === "M" ? 1e6 : m[3].toUpperCase() === "K" ? 1e3 : 1;
  // Medio "último dígito mostrado": $27K → 500 ; $1.2M → 50.000 ; $1,234 → 0,5
  const dec = (m[2].split(".")[1] ?? "").length;
  const paso = mult / Math.pow(10, dec);
  return { valor: signo * n * mult, tol: paso / 2 };
}

async function abrir(nav, ancho, url) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  // Bloquear el SW de otra forma mata la hidratación.
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  // Sin esto, useAuth manda TODO al login y se mediría una pantalla vacía.
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "vista-general", "admin"]));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 90000 });
  return { ctx, page };
}

/** Abre, espera a que HAYA filas y las lee. Reintenta una vez: Productos pide
 *  DOS respuestas del servidor (año en curso + año anterior para la Δ) y con la
 *  base cargada llegó a pasarse del tiempo de espera. Un "0 filas" por lentitud
 *  no debe leerse como "0 diferencias" ni como una falla real — por eso se
 *  reintenta ANTES de dar el veredicto, y si igual no hay filas, FALLA. */
async function leerPantalla(nav, ancho, caso, colCompacto) {
  const sel = `[${caso.ancla}]`;
  for (let intento = 1; intento <= 2; intento++) {
    const { ctx, page } = await abrir(nav, ancho, caso.url);
    const hubo = await page.waitForSelector(sel, { timeout: 60000, state: "attached" }).then(() => true).catch(() => false);
    await page.waitForTimeout(2500);
    const filas = await page.evaluate(leer(caso.ancla, caso.columnas));
    const compacto = colCompacto ? await page.evaluate(leerCompacto(caso.ancla, colCompacto)) : {};
    await ctx.close();
    if (hubo && Object.keys(filas).length > 0) return { filas, compacto };
    if (intento === 1) console.log(`   … ${caso.id} @${ancho}px vino vacía, reintento`);
  }
  return { filas: {}, compacto: {} };
}

const nav = await chromium.launch();
let fallas = 0;
let celdasComparadas = 0;

for (const caso of CASOS) {
  const a = await leerPantalla(nav, caso.angosto, caso, caso.compacto?.tarjeta);
  const angosto = a.filas;
  const angostoCompacto = a.compacto;

  const b = await leerPantalla(nav, caso.ancho, caso, caso.compacto?.tabla);
  const ancho = b.filas;
  const anchoCompacto = b.compacto;

  const clavesA = Object.keys(angosto);
  const clavesB = Object.keys(ancho);

  // CONTROL DE VACÍO — sin esto, "0 diferencias" no probaría nada.
  if (clavesA.length === 0 || clavesB.length === 0) {
    console.log(`❌ ${caso.id}: SIN FILAS (${caso.angosto}px: ${clavesA.length} · ${caso.ancho}px: ${clavesB.length}). El 0 no vale.`);
    fallas++;
    continue;
  }

  const diffs = [];
  const soloA = clavesA.filter((k) => !(k in ancho));
  const soloB = clavesB.filter((k) => !(k in angosto));
  if (soloA.length) diffs.push(`${soloA.length} fila(s) sólo en ${caso.angosto}px: ${soloA.slice(0, 3).join(", ")}`);
  if (soloB.length) diffs.push(`${soloB.length} fila(s) sólo en ${caso.ancho}px: ${soloB.slice(0, 3).join(", ")}`);

  for (const k of clavesA) {
    if (!(k in ancho)) continue;
    for (const col of caso.columnas) {
      const x = angosto[k][col];
      const y = ancho[k][col];
      celdasComparadas++;
      if (x !== y) diffs.push(`${k} · ${col}: "${x}" ≠ "${y}"`);
    }
    if (caso.compacto) {
      const px = parsePlata(angostoCompacto[k]);
      const py = parsePlata(anchoCompacto[k]);
      celdasComparadas++;
      if (!px || !py) {
        diffs.push(`${k} · ${caso.compacto.tarjeta}: no se pudo leer ("${angostoCompacto[k]}" / "${anchoCompacto[k]}")`);
      } else if (Math.abs(px.valor - py.valor) > Math.max(px.tol, py.tol)) {
        diffs.push(`${k} · monto: ${angostoCompacto[k]} (${px.valor}) ≠ ${anchoCompacto[k]} (${py.valor})`);
      }
    }
  }

  if (diffs.length) {
    fallas++;
    console.log(`❌ ${caso.id}: ${diffs.length} diferencia(s) sobre ${clavesA.length} filas`);
    for (const d of diffs.slice(0, 10)) console.log(`     ${d}`);
  } else {
    console.log(`✅ ${caso.id}: ${clavesA.length} filas × ${caso.columnas.length + (caso.compacto ? 1 : 0)} datos · 0 diferencias  (${caso.angosto}px vs ${caso.ancho}px)`);
    for (const [col, motivo] of Object.entries(caso.noComparadas ?? {})) {
      console.log(`     ⚠️ "${col}" NO se compara — ${motivo}`);
    }
  }
}

await nav.close();
console.log(`\n${celdasComparadas} celdas comparadas · ${fallas} pantalla(s) con problemas`);
process.exit(fallas ? 1 : 0);
