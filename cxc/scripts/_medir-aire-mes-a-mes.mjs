// ¿Cuánto aire hay REALMENTE entre la cifra de 2026 y la de 2025?
//
// 🩸 POR QUÉ. Daniel, mirando Multifashion › Resumen en el iPhone: *"mira en
// multifashion, en resumen, lo pegado que estan los numeros, arreglalo"*. La
// tabla "Mes a mes vs 2025" pone `$33,272.39` y `$21,996.81` casi tocándose y se
// leen como un solo número largo.
//
// Arreglarlo a ojo es cómo se rompe otra cosa. Esto mide la causa:
//
//   * `aire`  — px entre el borde DERECHO de la cifra del año actual y el
//               IZQUIERDO de la del año anterior. Es EL número. Puede dar
//               negativo: significa que se superponen.
//   * `pista` vs `texto` — cuánto mide la columna (el track del grid) y cuánto
//               pide el texto adentro. Si el texto pide más que la pista, las dos
//               columnas están COMPITIENDO por el ancho y el aire nominal del
//               `gap` se lo come el desborde. Eso distingue "falta relleno" de
//               "las columnas no entran", que se arreglan distinto.
//   * `arrastre` — la pantalla está hoy en 0 px y tiene que seguir en 0: separar
//               las columnas empujando la tabla hacia afuera sería peor el
//               remedio que la enfermedad.
//   * `targetsChicos` — blancos táctiles por debajo de 44 px.
//
// Se mide sobre la fila del PEOR CASO (la de cifras más largas), no sobre la
// primera: un mes de 4 dígitos no prueba nada sobre uno de 5 con centavos.
//
// GOTCHAS heredados (no tocar sin leer):
//   * Sembrar la cookie de sesión Y `sessionStorage.cxc_role`, o todo redirige
//     al login.
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar (bloquear el
//     SW de otra forma mata la hidratación).
//
// Solo lectura: no toca ningún botón que ejecute nada.
//
//   ETAPA=antes node scripts/_medir-aire-mes-a-mes.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3184";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  // Ancho real del texto adentro de un elemento, sin el relleno de la caja.
  const anchoTexto = (el) => {
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const r = rango.getBoundingClientRect();
    return Math.round(r.width * 10) / 10;
  };

  const tabla = document.querySelector('[data-tabla="mes-a-mes"]');
  if (!tabla) return { error: "no encontré la tabla (falta data-tabla=mes-a-mes)" };

  const filas = [...tabla.querySelectorAll('[data-fila="mes"]')].filter(visible);
  if (!filas.length) return { error: "la tabla no tiene filas visibles" };

  const medidas = filas.map((fila) => {
    const act = fila.querySelector('[data-col="actual"]');
    const prev = fila.querySelector('[data-col="previo"]');
    if (!act || !prev) return null;
    const ra = act.getBoundingClientRect();
    const rp = prev.getBoundingClientRect();
    const ta = anchoTexto(act);
    const tp = anchoTexto(prev);
    return {
      mes: (fila.querySelector('[data-col="mes"]')?.textContent ?? "").trim().slice(0, 10),
      textoActual: (act.textContent ?? "").trim(),
      textoPrevio: (prev.textContent ?? "").trim(),
      // El aire de VERDAD: entre donde termina de dibujarse un número y donde
      // empieza el otro. No entre las cajas, que es lo que engaña.
      aire: Math.round((rp.right - tp - (ra.right)) * 10) / 10,
      pistaActual: Math.round(ra.width * 10) / 10,
      pistaPrevio: Math.round(rp.width * 10) / 10,
      anchoTextoActual: ta,
      anchoTextoPrevio: tp,
      // Si el texto pide más que su pista, las columnas están compitiendo.
      desbordaActual: Math.round((ta - ra.width) * 10) / 10,
      desbordaPrevio: Math.round((tp - rp.width) * 10) / 10,
      largo: (act.textContent ?? "").trim().length + (prev.textContent ?? "").trim().length,
    };
  }).filter(Boolean);

  // El peor caso: la fila con más dígitos entre las dos cifras.
  medidas.sort((a, b) => b.largo - a.largo || a.aire - b.aire);

  // Arrastre horizontal de toda la pantalla.
  let arrastre = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = el.scrollWidth - el.clientWidth;
    if (s <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "auto" && cs.overflowX !== "scroll") continue;
    if (s > arrastre) arrastre = Math.round(s);
  }

  // Blancos táctiles de la pantalla (sin la barra lateral ni el encabezado, que
  // son de otro dueño).
  const main = document.querySelector("main") ?? document.body;
  const chicos = [];
  for (const el of main.querySelectorAll("button, a[href], [role=button], input, select")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 26),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }

  return {
    anchoUtil: main.clientWidth,
    anchoTabla: Math.round(tabla.getBoundingClientRect().width),
    peor: medidas[0] ?? null,
    todas: medidas.slice(0, 4),
    minAire: medidas.length ? Math.min(...medidas.map((m) => m.aire)) : null,
    arrastre,
    targetsChicos: chicos.length,
    ejemplosTarget: chicos.slice(0, 6),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();

for (const ancho of ANCHOS) {
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
  await page.goto(`${BASE}/multifashion?subtab=resumen`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);

  const r = await page.evaluate(SONDA);
  console.error(`\n@${ancho}  útil=${r.anchoUtil ?? "?"}  tabla=${r.anchoTabla ?? "?"}`);
  if (r.error) {
    console.error(`   ⚠️ ${r.error}`);
  } else {
    const p = r.peor;
    console.error(`   PEOR FILA: ${p.mes}  "${p.textoActual}" | "${p.textoPrevio}"`);
    console.error(`   AIRE entre las dos cifras: ${p.aire} px      (mínimo de la tabla: ${r.minAire} px)`);
    console.error(`   pista actual ${p.pistaActual} / texto ${p.anchoTextoActual}  → desborda ${p.desbordaActual}`);
    console.error(`   pista previo ${p.pistaPrevio} / texto ${p.anchoTextoPrevio}  → desborda ${p.desbordaPrevio}`);
    console.error(`   arrastre=${r.arrastre} px · targets<44=${r.targetsChicos}`);
    if (r.targetsChicos) console.error(`   ${JSON.stringify(r.ejemplosTarget)}`);
  }

  // Captura del terreno donde Daniel lo vio.
  const tabla = page.locator('[data-tabla="mes-a-mes"]');
  if (await tabla.count()) {
    await tabla.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await tabla.screenshot({ path: path.join(SALIDA, `mesames-${ETAPA}-${ancho}.png`) }).catch(() => {});
  }
  await ctx.close();
}
await navegador.close();
