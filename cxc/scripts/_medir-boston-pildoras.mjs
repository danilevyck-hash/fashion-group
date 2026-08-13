// SOLO LECTURA. Mide la fila de píldoras de la pestaña Boston del CXC
// (/admin?tab=boston) en 390 · 834 · 1440 y, en el mismo viaje, CAPTURA los
// números vivos (total pendiente, cuenta de clientes, los tres tramos y el
// largo de la lista) para poder comparar antes/después de quitar la tarjeta
// "Cobrado julio", que tenía el monto ESCRITO A MANO en el código.
//
//   BASE=http://localhost:3170 node scripts/_medir-boston-pildoras.mjs
//
// Qué mide, por ancho:
//   · arrastre de la PÁGINA y de la FILA de píldoras,
//   · blancos táctiles < 44 px y textos < 12 px dentro de la fila,
//   · filas de la cuadrícula y cuántas celdas quedan vacías en la última
//     (el "hueco raro" al perder un elemento),
//   · que NO haya rastro de "Cobrado julio" ni del monto 35,392.49.
//
// Y captura, para el diff antes/después:
//   · el texto de cada píldora,
//   · la cuenta de clientes de la línea "N clientes",
//   · el total de la primera fila de la tabla (prueba de que el orden por
//     defecto no se movió).
//
// 🔴 NO ESCRIBE NADA: solo navega y lee. Gotchas de la casa: sembrar la cookie
// de sesión Y `sessionStorage.cxc_role`/`fg_modules`, y
// `delete Navigator.prototype.serviceWorker` antes de navegar.

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);

const nav = await chromium.launch();
let malas = 0;
const captura = {};

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["*"]));
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin?tab=boston`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-pressed]', { timeout: 45000 });
  // Esperar a que SWR traiga la cartera: la píldora del total deja de ser 0.00.
  await page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button[aria-pressed]")].find((e) =>
          e.textContent.includes("Total pendiente")
        );
        return b && !/\$0\.00/.test(b.textContent);
      },
      { timeout: 45000 }
    )
    .catch(() => {});
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const pildoraTotal = [...document.querySelectorAll("button[aria-pressed]")].find((e) =>
      e.textContent.includes("Total pendiente")
    );
    const fila = pildoraTotal.parentElement;
    const celdas = [...fila.children];

    const chicos = [];
    const textos = [];
    for (const c of celdas) {
      for (const e of [c, ...c.querySelectorAll("span")]) {
        const px = parseFloat(getComputedStyle(e).fontSize);
        const t = (e.textContent ?? "").trim();
        if (px < 12 && t) textos.push({ t: t.slice(0, 30), px });
      }
      const r = c.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) {
        chicos.push({ t: c.textContent.trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }

    // Cuadrícula: cuántas columnas efectivas y cuántas celdas vacías en la
    // última fila (el hueco al perder un elemento).
    const cols = getComputedStyle(fila).gridTemplateColumns.split(" ").filter(Boolean).length;
    const sobran = celdas.length % cols === 0 ? 0 : cols - (celdas.length % cols);

    // Fila más ancha: si alguna celda se sale del contenedor, se ve.
    const rFila = fila.getBoundingClientRect();
    const desborde = celdas.some((c) => {
      const r = c.getBoundingClientRect();
      return r.right - rFila.right > 1 || rFila.left - r.left > 1;
    });

    const cuenta = [...document.querySelectorAll("p")]
      .map((p) => p.textContent.trim())
      .find((t) => /^\d+ clientes?$/.test(t));

    const primeraFila =
      document.querySelector("table tbody tr")?.textContent.trim().replace(/\s+/g, " ") ??
      document.querySelector(".sm\\:hidden > div")?.textContent.trim().replace(/\s+/g, " ") ??
      null;

    const cuerpo = document.body.textContent ?? "";

    return {
      arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
      arrastreFila: Math.max(0, fila.scrollWidth - fila.clientWidth),
      celdas: celdas.length,
      cols,
      sobran,
      desborde,
      pildoras: celdas.map((c) => c.textContent.trim().replace(/\s+/g, " ")),
      clicables: celdas.filter((c) => c.tagName === "BUTTON").length,
      cuenta: cuenta ?? null,
      primeraFila,
      rastroCobrado: cuerpo.includes("Cobrado julio") || cuerpo.includes("Cobrado "),
      rastroMonto: cuerpo.includes("35,392.49"),
      chicos,
      textos,
    };
  });

  // ⚠️ Los rótulos de la píldora son `text-[11px] uppercase` — el MISMO estilo
  // de casa que `admin/components/KpiCards.tsx` (las píldoras del CXC del
  // grupo). Es PRE-EXISTENTE y se mide idéntico en `origin/main`: quitar la
  // tarjeta no lo trajo ni lo empeoró, y tocarlo sería cambiarles el aspecto a
  // las cuatro píldoras que este cambio no debe tocar. Se IMPRIME siempre, pero
  // no cuenta como regresión de este cambio.
  const preexistentes = m.textos.filter((t) => t.px === 11);
  const textosNuevos = m.textos.filter((t) => t.px !== 11);

  const mal =
    m.arrastrePagina > 0 ||
    m.arrastreFila > 0 ||
    m.desborde ||
    m.chicos.length > 0 ||
    textosNuevos.length > 0 ||
    m.sobran > 0;
  if (mal) malas++;

  captura[ancho] = { pildoras: m.pildoras, cuenta: m.cuenta, primeraFila: m.primeraFila };

  console.log(`\n── ${ancho} px ${mal ? "🔴" : "🟢"}`);
  console.log(`   celdas ${m.celdas} (clicables ${m.clicables}) · columnas ${m.cols} · celdas vacías al final: ${m.sobran}`);
  console.log(`   arrastre página ${m.arrastrePagina} · fila ${m.arrastreFila} · celda fuera del contenedor: ${m.desborde ? "🔴 sí" : "no"}`);
  console.log(`   táctiles <44: ${m.chicos.length ? JSON.stringify(m.chicos) : 0} · textos <12 NUEVOS: ${textosNuevos.length ? JSON.stringify(textosNuevos) : 0}`);
  console.log(`   rótulos de 11 px (estilo de casa, pre-existente, idéntico en main): ${preexistentes.length}`);
  console.log(`   "Cobrado julio": ${m.rastroCobrado ? "SÍ (presente)" : "no"} · monto 35,392.49: ${m.rastroMonto ? "SÍ (presente)" : "no"}`);
  console.log(`   píldoras: ${m.pildoras.join(" | ")}`);
  console.log(`   lista: ${m.cuenta} · 1ª fila: ${m.primeraFila?.slice(0, 90)}`);

  await ctx.close();
}

await nav.close();
console.log(`\n=== NÚMEROS VIVOS (para el diff antes/después) ===`);
console.log(JSON.stringify(captura, null, 2));
console.log(malas ? `\n🔴 ${malas} ancho(s) con hallazgos` : `\n🟢 los ${ANCHOS.length} anchos limpios`);
process.exit(malas ? 1 : 0);
