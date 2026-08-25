// ---------------------------------------------------------------------------
// VERIFICADOR (SOLO LECTURA) — «sacar el aviso no movió ni un centavo».
//
// Se retiró el aviso ámbar de «código mal clasificado» de Ventas > Productos.
// Lo único que no puede pasar es que un número se mueva: quitar un cartel es
// dejar de dibujar, no recalcular.
//
// QUÉ HACE
//   Levanta las DOS pantallas de PRODUCCIÓN —la rama y `origin/main`, las dos
//   compiladas con `next build`— y le pide a cada una la MISMA respuesta de
//   `/api/ventas/productos` para las 6 empresas de Fashion Group x los 4
//   períodos, mas la ventana comparativa (`previo=1`) de cada uno. Compara
//   POSICIÓN POR POSICIÓN y celda por celda.
//
// ⚠️ POSICIÓN POR POSICIÓN, NO COMO CONJUNTO. Dos filas intercambiadas se
//    verían idénticas comparando conjuntos, y el orden de esta tabla es
//    visible: es el Top 20 que se ve sin tocar nada.
//
// 🔑 LA ÚNICA DIFERENCIA PERMITIDA es que `main` traiga `aviso` en una fila y
//    la rama no. Se cuenta aparte y se informa; cualquier otra celda distinta
//    es un FALLO. Que ese conteo sea > 0 es lo que le da sentido al resto: con
//    0 avisos en main, la medición no probaría que se sacó nada.
//
// ⛔ Multifashion (american_classic) NO ENTRA: es otro módulo.
//
//   RAMA=http://localhost:3350 MAIN=http://localhost:3351 \
//     node scripts/_verif-productos-sin-aviso.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from "fs";

const RAMA = process.env.RAMA ?? "http://localhost:3350";
const MAIN = process.env.MAIN ?? "http://localhost:3351";
const COOKIE = `cxc_session=${readFileSync("/tmp/fg-cookie.txt", "utf8").trim()}`;

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"];
const PERIODOS = ["ytd", "6m", "12m", "anio_pasado"];
const YEAR = new Date().getFullYear();

// Todo lo que la pantalla dibuja como número o como nombre de fila.
const CELDAS = ["descripcion", "num_codigos", "cantidad", "venta", "costo", "margen"];
const TOTALES = ["venta", "costo", "margen"];

async function pedir(base, qs) {
  const res = await fetch(`${base}/api/ventas/productos?${qs}`, {
    headers: { cookie: COOKIE },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${base} ${qs} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const igual = (a, b) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b;

let celdas = 0;
let difs = 0;
let avisosEnMain = 0;
let avisosEnRama = 0;
let filasComparadas = 0;
const fallos = [];

function comparar(donde, ramaB, mainB) {
  // Los totales de la cabecera.
  for (const k of TOTALES) {
    celdas += 1;
    if (!igual(ramaB.totales[k], mainB.totales[k])) {
      difs += 1;
      fallos.push(`${donde} totales.${k}: ${ramaB.totales[k]} vs ${mainB.totales[k]}`);
    }
  }
  // El rango impreso arriba, que también sale de la respuesta.
  for (const k of ["desde", "hasta"]) {
    celdas += 1;
    if (!igual(ramaB[k], mainB[k])) {
      difs += 1;
      fallos.push(`${donde} ${k}: ${ramaB[k]} vs ${mainB[k]}`);
    }
  }
  celdas += 1;
  if (ramaB.productos.length !== mainB.productos.length) {
    difs += 1;
    fallos.push(`${donde} CANTIDAD DE FILAS: ${ramaB.productos.length} vs ${mainB.productos.length}`);
  }
  const n = Math.max(ramaB.productos.length, mainB.productos.length);
  for (let i = 0; i < n; i += 1) {
    const x = ramaB.productos[i];
    const y = mainB.productos[i];
    filasComparadas += 1;
    if (!x || !y) {
      celdas += CELDAS.length; difs += CELDAS.length;
      fallos.push(`${donde} fila ${i}: una de las dos no existe`);
      continue;
    }
    if (Array.isArray(y.aviso) && y.aviso.length > 0) avisosEnMain += 1;
    if (Array.isArray(x.aviso) && x.aviso.length > 0) avisosEnRama += 1;
    for (const c of CELDAS) {
      celdas += 1;
      if (!igual(x[c], y[c])) {
        difs += 1;
        if (fallos.length < 20) fallos.push(`${donde} fila ${i} ${c}: ${JSON.stringify(x[c])} vs ${JSON.stringify(y[c])}`);
      }
    }
  }
}

const t0 = Date.now();
for (const empresa of EMPRESAS) {
  for (const periodo of PERIODOS) {
    for (const previo of ["", "&previo=1"]) {
      const qs = `empresa=${empresa}&year=${YEAR}&periodo=${periodo}${previo}`;
      const [r, m] = await Promise.all([pedir(RAMA, qs), pedir(MAIN, qs)]);
      comparar(`${empresa}/${periodo}${previo ? "/previo" : ""}`, r, m);
    }
  }
  process.stderr.write(`  ${empresa} ok\n`);
}

console.log("=".repeat(78));
console.log("RESULTADO");
console.log("=".repeat(78));
console.log(`  Combinaciones:                ${EMPRESAS.length} empresas x ${PERIODOS.length} periodos x 2 ventanas = ${EMPRESAS.length * PERIODOS.length * 2}`);
console.log(`  Filas comparadas:             ${filasComparadas.toLocaleString("en-US")}`);
console.log(`  Celdas comparadas:            ${celdas.toLocaleString("en-US")}`);
console.log(`  Diferencias:                  ${difs}`);
console.log(`  Renglones con aviso en MAIN:  ${avisosEnMain}`);
console.log(`  Renglones con aviso en RAMA:  ${avisosEnRama}   <- tiene que ser 0`);
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const f of fallos) console.log(`  ✗ ${f}`);

// 🔑 Con 0 avisos en main la medición no probaría NADA: hay que ver que el
// cartel estaba puesto para poder afirmar que se sacó.
const ok = difs === 0 && avisosEnRama === 0 && avisosEnMain > 0;
console.log(`\n  ${ok ? "✅ Ningún número se movió, y el aviso ya no sale." : "❌ REVISAR arriba."}`);
process.exit(ok ? 0 : 1);
