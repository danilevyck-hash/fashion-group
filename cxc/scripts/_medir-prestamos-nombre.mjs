// ¿SE CORTA EL NOMBRE DEL EMPLEADO en Préstamos › Lista? Uno por uno, con los
// nombres REALES de la base, a los 4 anchos que importan.
//
// 🩸 POR QUÉ EXISTE. El PR #373 midió que a 834 px el nombre perdía hasta 79 px
// ("MARIA BETHANCOURTH"). La causa NO es el `truncate` — es que las columnas de
// progreso y de chip-quincena se encienden en `sm` (640) mientras la barra
// lateral entra en `md` (768) y se lleva 224 px. Entre 768 y ~1024 pasan las
// DOS cosas a la vez: columnas extra encendidas Y 224 px menos de ancho. El
// nombre es lo único elástico de la fila, así que paga la cuenta él.
//
// ⚠️ CON NOMBRES REALES, NO DE PRUEBA. Un nombre corto no se corta y daría un
// falso verde. Este script mide TODAS las filas que hay en pantalla y reporta
// el nombre MÁS LARGO de la base y el PEOR corte, no un promedio.
//
// QUÉ MIDE, por fila:
//   * `pideP x` — ancho natural del texto del nombre (el `scrollWidth` del span).
//   * `cabePx`  — ancho que la fila le deja (`clientWidth`).
//   * `cortePx` — la diferencia, cuando es positiva. Es EL número.
//
// GOTCHAS heredados: cookie de sesión firmada, sessionStorage (`cxc_role`) y
// `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: no se hace click en nada.
//
//   ETAPA=antes node scripts/_medir-prestamos-nombre.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3173";
const SALIDA = process.env.SALIDA ?? "/tmp/t73-medicion";
const ETAPA = process.env.ETAPA ?? "antes";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Se busca el nombre por su `data-` estable, NUNCA por la clase de breakpoint:
// si el corte se mueve, un selector `.sm\:hidden` devuelve vacío y el chequeo
// pasaría sin haber medido nada.
const SONDA = `(() => {
  const filas = [...document.querySelectorAll("[data-empleado-fila]")];
  const nombres = filas.map((f) => {
    const n = f.querySelector("[data-empleado-campo=nombre]");
    if (!n) return null;
    const r = n.getBoundingClientRect();
    // ancho natural del texto, sin el recorte
    const sombra = document.createElement("span");
    sombra.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
    sombra.style.font = getComputedStyle(n).font;
    sombra.style.letterSpacing = getComputedStyle(n).letterSpacing;
    sombra.textContent = n.textContent;
    document.body.appendChild(sombra);
    const pide = Math.ceil(sombra.getBoundingClientRect().width);
    sombra.remove();
    const cabe = Math.floor(r.width);
    // Umbral de 2 px: la medida de sombra redondea hacia arriba y la caja real
    // hacia abajo, así que un nombre que entra JUSTO da 1 px de "corte" que no
    // existe. Con 1 px salían 12/12 cortados a 1440, donde no se corta ninguno.
    const bruto = pide - cabe;
    return { txt: n.textContent.trim(), pidePx: pide, cabePx: cabe, cortePx: bruto >= 2 ? bruto : 0 };
  }).filter(Boolean);
  return {
    filas: nombres.length,
    // el nombre MÁS LARGO que existe en la base, se corte o no
    masLargo: nombres.slice().sort((a, b) => b.pidePx - a.pidePx)[0] ?? null,
    cortados: nombres.filter((n) => n.cortePx > 0).length,
    peorCorte: nombres.slice().sort((a, b) => b.cortePx - a.cortePx)[0] ?? null,
    todos: nombres.slice().sort((a, b) => b.cortePx - a.cortePx || b.pidePx - a.pidePx),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const ANCHO of ANCHOS) {
  const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
  const ctx = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    hasTouch: ANCHO < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["prestamos", "caja", "cheques", "cxc", "admin"]));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/prestamos", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const r = await page.evaluate(SONDA);
  await page.screenshot({ path: path.join(SALIDA, `prestamos-nombre-${ETAPA}-${ANCHO}.png`), fullPage: true });
  await ctx.close();

  // CONTROL DE VACÍO: sin filas, un "0 cortados" no prueba nada.
  if (r.filas === 0) {
    console.error(`[${ETAPA}@${ANCHO}] ❌ SIN FILAS — no se midió nada`);
    resultados.push({ etapa: ETAPA, ancho: ANCHO, error: "sin filas" });
    continue;
  }
  resultados.push({ etapa: ETAPA, ancho: ANCHO, ...r });
  console.error(
    `[${ETAPA}@${ANCHO}] ${String(r.filas).padStart(3)} filas · cortados=${String(r.cortados).padStart(2)} · ` +
    `peor=${String(r.peorCorte?.cortePx ?? 0).padStart(3)}px "${r.peorCorte?.txt ?? "-"}" · ` +
    `el más largo pide ${r.masLargo.pidePx}px y le caben ${r.masLargo.cabePx} ("${r.masLargo.txt}")`,
  );
}

await navegador.close();
const dest = path.join(SALIDA, `prestamos-nombre-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
console.error(`\nJSON → ${dest}`);
