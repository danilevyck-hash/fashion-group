// SOLO LECTURA de la pantalla. Mide el selector de cliente NUEVO en los 3
// anchos: el rótulo de la salida a mano en la lista desplegable, y la red de
// seguridad ("¿Es …?") dibujada dentro de una fila del formulario de guía.
//
// 🔴 NO GUARDA NADA: se trabaja sobre /guias/nueva (una guía que nunca se
// guarda) y nunca se toca "Guardar Guía".
//
//   BASE=http://localhost:3209 node scripts/_medir-selector-cliente.mjs
//
// Gotchas de medición de la casa: sembrar `sessionStorage.cxc_role` (si no,
// `useAuth` redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar (bloquearlo de otra forma mata la hidratación).
// Y ojo: los rótulos con `uppercase` los devuelve `innerText` en MAYÚSCULAS.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3209";
const SALIDA = "/tmp/selector-cliente";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];
/** Un cliente REAL del directorio, escrito con un dedo torcido. */
const A_MANO = process.env.A_MANO ?? "City Mal Paso Canoas";

mkdirSync(SALIDA, { recursive: true });

const medir = () =>
  ({
    arrastrePagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    recortados: [...document.querySelectorAll("*")]
      .filter((e) => {
        const s = getComputedStyle(e);
        return (
          e.clientWidth > 1 &&
          e.scrollWidth - e.clientWidth > 2 &&
          s.overflowX !== "auto" &&
          s.overflowX !== "scroll"
        );
      })
      .map((e) => ({ tag: e.tagName, cls: e.className?.toString().slice(0, 40), extra: e.scrollWidth - e.clientWidth })),
    // ⚠️ Solo lo NUEVO: la caja de la sugerencia y la lista desplegable. En
    // escritorio con MOUSE el formulario usa a propósito campos de 34 px
    // (`pointer:fine`, ver CTRL_BASE en GuiaForm) — medirlos acá sería acusar
    // a este cambio de un diseño que ya estaba y que Daniel aprobó.
    tactilesChicos: [...document.querySelectorAll("[data-red-cliente] button, [data-desplegable=cliente] button")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
      })
      .map((e) => ({ t: (e.textContent || e.tagName).trim().slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })),
    textosChicos: [...document.querySelectorAll("[data-red-cliente] *, [data-desplegable=cliente] *")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim() && !/sr-only/.test(e.className?.toString() ?? ""))
      .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: (e.textContent || "").trim().slice(0, 26) }))
      .filter((x) => x.px && x.px < 12),
  });

let fallos = 0;
const nav = await chromium.launch();

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  // ⚠️ A 1440 el formulario dibuja LOS DOS layouts (tarjeta y tabla) y esconde
  // uno con CSS: el primer combobox del DOM es el INVISIBLE. Sin `:visible` el
  // clic se queda esperando para siempre.
  const campo = page.locator('input[role="combobox"]:visible').first();
  await campo.click();
  await campo.fill(A_MANO);
  await page.waitForTimeout(1200);

  // ── (a) la lista desplegable, con el rótulo NUEVO de la salida a mano ──
  const lista = await page.evaluate(() => {
    const l = document.querySelector('[data-desplegable="cliente"]');
    return l ? { texto: l.textContent ?? "", alto: Math.round(l.getBoundingClientRect().height) } : null;
  });
  const mLista = await page.evaluate(medir);
  const rotuloOk = !!lista && lista.texto.includes("No está en la lista — escribir a mano");
  const sinOtro = !!lista && !/(^|[^a-zA-ZáéíóúñÁÉÍÓÚÑ])Otro([^a-zA-ZáéíóúñÁÉÍÓÚÑ]|$)/.test(lista.texto);
  await page.screenshot({ path: `${SALIDA}/lista-${ancho}.png` });

  // ── (b) se elige la salida a mano → aparece la red de seguridad ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-desplegable="cliente"] button')].find((x) =>
      (x.textContent || "").includes("No está en la lista"),
    );
    b?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await page.waitForTimeout(2500);

  const red = await page.evaluate(() => {
    // ⚠️ El formulario dibuja los DOS layouts y esconde uno: hay que quedarse
    // con la caja VISIBLE (la escondida mide 0×0 y daría verde por nada).
    const p = [...document.querySelectorAll("p")]
      .filter((x) => /^¿Es /.test((x.textContent || "").trim()))
      .find((x) => x.getBoundingClientRect().height > 0);
    if (!p) return null;
    const caja = p.parentElement;
    caja.setAttribute("data-red-cliente", "1");
    const r = caja.getBoundingClientRect();
    return {
      pregunta: (p.textContent || "").trim(),
      botones: [...caja.querySelectorAll("button")].map((b) => ({
        t: (b.textContent || "").trim().slice(0, 40),
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
      })),
      alto: Math.round(r.height),
      ancho: Math.round(r.width),
    };
  });
  const mRed = await page.evaluate(medir);
  await page.screenshot({ path: `${SALIDA}/red-${ancho}.png` });

  const chip = await page.evaluate(() => {
    const c = document.querySelector('[title="Escrito a mano — no está en el directorio"]');
    return c ? (c.textContent || "").trim() : null;
  });

  console.log(`\n── ${ancho} px ──────────────────────────────`);
  console.log(`  lista: rótulo nuevo ${rotuloOk ? "✅" : "❌"} · sin "Otro" pelado ${sinOtro ? "✅" : "❌"} · alto ${lista?.alto ?? "—"} px`);
  console.log(`         arrastre ${mLista.arrastrePagina} · recortados ${mLista.recortados.length} · táctiles<44 ${mLista.tactilesChicos.length} · textos<12 ${mLista.textosChicos.length}`);
  console.log(`  chip del campo: ${chip ?? "—"}`);
  if (red) {
    console.log(`  red: "${red.pregunta}"`);
    for (const b of red.botones) console.log(`       [${b.t}] ${b.w}×${b.h}`);
    console.log(`       caja ${red.ancho}×${red.alto} px`);
  } else {
    console.log("  red: ❌ NO APARECIÓ");
  }
  console.log(`       arrastre ${mRed.arrastrePagina} · recortados ${mRed.recortados.length} · táctiles<44 ${mRed.tactilesChicos.length} · textos<12 ${mRed.textosChicos.length}`);
  if (mRed.tactilesChicos.length) console.log(`       ${JSON.stringify(mRed.tactilesChicos)}`);
  if (mRed.recortados.length) console.log(`       ${JSON.stringify(mRed.recortados)}`);
  if (mRed.textosChicos.length) console.log(`       ${JSON.stringify(mRed.textosChicos)}`);

  // El script FALLA si no encuentra lo que vino a medir: medir cero y dar verde
  // sin haber mirado nada es el peor resultado posible.
  if (!rotuloOk || !sinOtro || !red || chip !== "A mano") fallos++;
  if (mRed.arrastrePagina > 0 || mRed.tactilesChicos.length || mRed.textosChicos.length) fallos++;

  await ctx.close();
}

await nav.close();
console.log(`\n${fallos === 0 ? "🟢 OK" : `🔴 ${fallos} problemas`}`);
process.exit(fallos === 0 ? 0 : 1);
