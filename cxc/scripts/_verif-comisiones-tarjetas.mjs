// Verificación: las TARJETAS del celular muestran EXACTAMENTE los mismos
// números que la TABLA del escritorio. "Esto es presentación, no cálculo."
//
// Lee la misma pantalla dos veces con el MISMO período (390px → tarjetas,
// 1440px → tabla), extrae los pares (vendedor, monto) de cada layout y los
// compara uno a uno. Cualquier diferencia se imprime y el script sale con 1.
//
// GOTCHAS: cookie de sesión firmada + sessionStorage.cxc_role + borrar
// Navigator.prototype.serviceWorker antes de navegar.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".
//
//   node scripts/_verif-comisiones-tarjetas.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3164";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const norm = (s) => s.replace(/\s+/g, " ").trim();

/** Tarjetas (celular): nombre + monto de la primera línea de cada <article>. */
const LEER_TARJETAS = `(() => {
  const out = [];
  for (const a of document.querySelectorAll("main [data-comision-card]")) {
    const spans = a.querySelectorAll("button span");
    if (spans.length < 2) continue;
    out.push([spans[0].textContent.trim(), spans[1].textContent.trim()]);
  }
  const total = [...document.querySelectorAll("main .md\\\\:hidden li div")]
    .find((d) => d.textContent.includes("Total"));
  return {
    filas: out,
    total: total ? total.textContent.replace("Total", "").trim() : null,
    detalles: [...document.querySelectorAll("main [data-comision-card] ul li")].length,
  };
})()`;

/** Tabla (escritorio): primera celda + última celda de cada fila del tbody. */
const LEER_TABLA = `(() => {
  const filas = [];
  for (const tr of document.querySelectorAll("main table tbody tr")) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 2) continue;                       // fila del toggle
    filas.push([tds[0].textContent.trim(), tds[tds.length - 1].textContent.trim()]);
  }
  const pie = document.querySelectorAll("main table tfoot td");
  return {
    filas,
    total: pie.length ? pie[pie.length - 1].textContent.trim() : null,
  };
})()`;

async function leer(navegador, { width, height, movil }, modo, script) {
  const ctx = await navegador.newContext({
    viewport: { width, height },
    ...(movil ? { hasTouch: true } : {}),
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript((m) => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    localStorage.setItem("fg_comisiones_mode", m);
  }, modo);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/comisiones`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  // Abrir TODAS las tarjetas: así se leen también los montos por empresa.
  if (movil) {
    for (const b of await page.locator("main [data-comision-card] > button").all()) {
      await b.click().catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  const r = await page.evaluate(script);
  await ctx.close();
  return r;
}

const navegador = await chromium.launch();
let fallas = 0;

for (const modo of ["todas", "empresa"]) {
  const movil = await leer(navegador, { width: 390, height: 844, movil: true }, modo, LEER_TARJETAS);
  const escritorio = await leer(navegador, { width: 1440, height: 900, movil: false }, modo, LEER_TABLA);

  console.log(`\n── modo "${modo}" ──`);
  console.log(`  tarjetas: ${movil.filas.length} (con ${movil.detalles} líneas de detalle)   tabla: ${escritorio.filas.length}`);

  if (movil.filas.length !== escritorio.filas.length) {
    console.log(`  ❌ distinta cantidad de filas`);
    fallas++;
  }
  const n = Math.min(movil.filas.length, escritorio.filas.length);
  for (let i = 0; i < n; i++) {
    const [nm, vm] = movil.filas[i];
    const [nt, vt] = escritorio.filas[i];
    const ok = norm(nm) === norm(nt) && norm(vm) === norm(vt);
    console.log(`  ${ok ? "✓" : "❌"} ${norm(nt).padEnd(26)} ${vt.padStart(12)}  |  tarjeta ${norm(nm).padEnd(26)} ${vm.padStart(12)}`);
    if (!ok) fallas++;
  }
  const totalOk = norm(movil.total ?? "") === norm(escritorio.total ?? "");
  console.log(`  ${totalOk ? "✓" : "❌"} TOTAL ${escritorio.total}  |  tarjeta ${movil.total}`);
  if (!totalOk) fallas++;
}

await navegador.close();
console.log(fallas === 0 ? "\n✅ Los números son idénticos en tarjetas y tabla." : `\n❌ ${fallas} diferencias.`);
process.exit(fallas === 0 ? 0 : 1);
