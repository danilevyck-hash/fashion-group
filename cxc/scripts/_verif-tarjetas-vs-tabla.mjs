// ¿Las tarjetas dicen EXACTAMENTE lo mismo que la tabla?
//
// 🩸 POR QUÉ ASÍ Y NO POR CLASE DE BREAKPOINT. La trampa de este tipo de cambio
// es verificarlo buscando el elemento por su clase (`.md\\:hidden`): después de
// mover el corte esa clase ya no existe, `querySelector` devuelve vacío, el
// script compara CERO celdas y el chequeo pasa en verde sin haber mirado nada.
// Por eso cada layout lleva un `data-vista` FIJO ("tarjetas" / "tabla") que no
// cambia aunque el breakpoint se mueva, y el script **falla si encuentra cero**.
//
// Qué compara: para cada entidad (por nombre), TODOS los números que muestra la
// tarjeta tienen que aparecer también en su fila de la tabla. La tarjeta enseña
// un subconjunto —esa es la idea— pero no puede inventar ni alterar un número.
//
// La tolerancia sale de la PRECISIÓN QUE SE MUESTRA, no de un porcentaje al ojo:
// un valor compacto como $27K no distingue nada por debajo de medio millar, y
// compararlo contra el exacto con un 0,5 % fijo lo marcaría como "cambió" siendo
// solo el redondeo del formato.
//
// GOTCHAS heredados: sembrar la cookie + `sessionStorage.cxc_role` (si no, todo
// redirige al login) y `delete Navigator.prototype.serviceWorker` antes de
// navegar (bloquear el SW de otra forma mata la hidratación).
//
// Solo lectura: no toca ningún botón que ejecute nada.
//
//   node scripts/_verif-tarjetas-vs-tabla.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3175";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// `anchoTarjetas` = donde se ven las tarjetas; `anchoTabla` = donde la tabla.
// El selector de ítem va EXPLÍCITO por pantalla: no todas las "tablas" son un
// `<table>` — la de Multifashion › Clientes está hecha de `div` con
// `role="button"`, que es justamente por lo que ningún barrido genérico la había
// cazado. Adivinar el selector es cómo un chequeo termina comparando cero.
const PANTALLAS = [
  { id: "multifashion-clientes", url: "/multifashion?subtab=clientes", espera: 12000,
    anchoTarjetas: 390, anchoTabla: 1440, selTarjeta: "article", selFila: '[role="button"]' },
  { id: "multifashion-vendedoras", url: "/multifashion?subtab=vendedoras", espera: 12000,
    anchoTarjetas: 834, anchoTabla: 1440, selTarjeta: ":scope > div", selFila: "tbody tr" },
  { id: "proveedores", url: "/proveedores", espera: 10000,
    anchoTarjetas: 834, anchoTabla: 1440, selTarjeta: "li", selFila: "tbody tr" },
  { id: "clientes", url: "/clientes", espera: 10000,
    anchoTarjetas: 834, anchoTabla: 1440, selTarjeta: "li", selFila: "tbody tr" },
];

/** Extrae el texto de cada entidad del layout que esté visible. */
function extraer(selTarjeta, selFila) {
  return `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const cont = [...document.querySelectorAll("[data-vista]")].filter(visible);
  const filas = [];
  for (const c of cont) {
    const vista = c.getAttribute("data-vista");
    const sel = vista === "tabla" ? ${JSON.stringify(selFila)} : ${JSON.stringify(selTarjeta)};
    for (const it of c.querySelectorAll(sel)) {
      if (!visible(it)) continue;
      const txt = (it.innerText || "").replace(/\\s+/g, " ").trim();
      if (!txt) continue;
      filas.push({ vista, txt });
    }
  }
  return { filas, vistas: cont.map((c) => c.getAttribute("data-vista")) };
})()`;
}

/**
 * Solo MONTOS, y solo los que llevan `$`.
 *
 * 🩸 Un extractor de "todo lo que parezca número" no sirve acá: las etiquetas de
 * tramo del CxP dicen "91-120 días" y "121+ días", así que 91, 120 y 121 se
 * leían como cifras y salían 31 falsos positivos. La plata siempre lleva `$` en
 * este sistema, y es lo que de verdad no puede cambiar.
 *
 * La tolerancia sale de la PRECISIÓN QUE SE MUESTRA: "$27K" no distingue nada
 * por debajo de medio millar, y compararlo contra el exacto con un porcentaje
 * fijo lo marcaría como "cambió" siendo solo el redondeo del formato.
 */
function montos(txt) {
  const out = [];
  const re = /([+-]?)\$\s?(\d[\d,]*(?:\.(\d+))?)\s*([KM])?/g;
  let m;
  while ((m = re.exec(txt))) {
    const n = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const escala = m[4] === "M" ? 1e6 : m[4] === "K" ? 1e3 : 1;
    const decimales = (m[3] ?? "").length;
    const granularidad = escala / 10 ** decimales;
    // El signo se conserva: "+$26.75" (a favor) y "$26.75" (por pagar) son
    // cosas distintas y confundirlas sería justo el error que se busca.
    out.push({
      n: (m[1] === "-" ? -1 : 1) * n * escala,
      // Media unidad del último dígito que se MUESTRA, sin casos especiales:
      // "$1,234.56" → 0,005 · "$11,406" → 0,50 · "$27K" → 500. La tarjeta de
      // Vendedoras muestra los montos sin centavos, así que exigirle 0,005 la
      // marcaba como "cambió el número" cuando la diferencia era el redondeo que
      // ella misma declara.
      tol: granularidad / 2,
      txt: m[0].trim(),
    });
  }
  return out;
}

async function abrir(navegador, url, ancho, espera) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(espera);
  return { ctx, page };
}

const navegador = await chromium.launch();
let fallo = false;

for (const p of PANTALLAS) {
  const a = await abrir(navegador, p.url, p.anchoTarjetas, p.espera);
  const tarjetas = await a.page.evaluate(extraer(p.selTarjeta, p.selFila));
  await a.ctx.close();

  const b = await abrir(navegador, p.url, p.anchoTabla, p.espera);
  const tabla = await b.page.evaluate(extraer(p.selTarjeta, p.selFila));
  await b.ctx.close();

  const filasT = tarjetas.filas.filter((f) => f.vista === "tarjetas");
  const filasB = tabla.filas.filter((f) => f.vista === "tabla");

  console.error(`\n=== ${p.id} ===`);
  console.error(`  @${p.anchoTarjetas} tarjetas: ${filasT.length}   @${p.anchoTabla} tabla: ${filasB.length}`);

  // Encontrar CERO es el modo de fallo que este script existe para evitar.
  if (filasT.length === 0 || filasB.length === 0) {
    console.error("  ✗ NO MEDIDO — un layout no apareció. El chequeo no probó nada.");
    fallo = true;
    continue;
  }

  // 🩸 El pareo va por POSICIÓN, no por nombre. Los dos layouts se dibujan
  // recorriendo EL MISMO arreglo ya ordenado, así que el elemento i de las
  // tarjetas es el elemento i de la tabla — sin parsear nombres, que es de donde
  // salían los falsos "sin par" (un nombre partido en dos líneas, un renglón de
  // "Ver N sin saldo" que no es una entidad). Se descartan de las dos listas los
  // renglones sin plata, que son justamente esos controles.
  const conPlata = (arr) => arr.filter((f) => montos(f.txt).length > 0);
  const T = conPlata(filasT);
  const B = conPlata(filasB);

  if (T.length !== B.length) {
    console.error(`  ✗ distinta CANTIDAD de elementos: ${T.length} tarjetas vs ${B.length} filas — no son comparables`);
    fallo = true;
    continue;
  }

  let comparadas = 0, distintas = 0;
  for (let i = 0; i < T.length; i++) {
    const enTabla = montos(B[i].txt);
    for (const x of montos(T[i].txt)) {
      comparadas++;
      const hay = enTabla.some((y) => Math.abs(x.n - y.n) <= Math.max(x.tol, y.tol));
      if (!hay) {
        distintas++;
        console.error(`  ✗ [${i}] ${T[i].txt.slice(0, 40)}`);
        console.error(`      la tarjeta muestra ${x.txt} y su fila (${B[i].txt.slice(0, 40)}) no lo tiene`);
      }
    }
  }
  console.error(`  ${comparadas} montos comparados · ${distintas} distintos · ${T.length} elementos pareados`);
  if (distintas > 0 || comparadas === 0) fallo = true;
}

// ── Blancos táctiles en las pantallas tocadas ────────────────────────────────
console.error(`\n=== blancos táctiles < 44 px (390 y 834) ===`);
const TAP = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  // Solo lo que vive DENTRO del layout que se tocó: la barra lateral y el
  // encabezado son de otro dueño y de otra tarea.
  const raiz = document.querySelector('[data-vista="tarjetas"]');
  if (!raiz) return null;
  const out = [];
  for (const el of raiz.querySelectorAll("button, a[href], [role=button], input, select")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    out.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return { total: out.length, ejemplos: out.slice(0, 5) };
})()`;

for (const p of PANTALLAS) {
  for (const ancho of [390, 834]) {
    const { ctx, page } = await abrir(navegador, p.url, ancho, p.espera);
    const r = await page.evaluate(TAP);
    await ctx.close();
    if (r == null) { console.error(`  ${p.id} @${ancho}: (sin layout de tarjetas)`); continue; }
    console.error(`  ${p.id.padEnd(24)} @${ancho}: ${r.total} chicos ${r.total ? JSON.stringify(r.ejemplos) : ""}`);
    if (r.total > 0) fallo = true;
  }
}

await navegador.close();
console.error(fallo ? "\n⚠️ REVISAR" : "\n✅ ningún número cambió y ningún blanco táctil quedó bajo 44 px");
process.exit(fallo ? 1 : 0);
