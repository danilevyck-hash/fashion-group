// SOLO LECTURA de la pantalla. Abre /ventas?tab=referencia, busca un código y
// mide los 3 anchos de la casa: cuánto ARRASTRA la página, cuánto se RECORTA,
// si algún blanco táctil baja de 44 px y si algún texto baja de 12 px.
//
//   BASE=http://localhost:3000 CODIGO=NB2570001 node scripts/_medir-referencia-simple.mjs
//
// 🔴 NO ESCRIBE NADA. Solo teclea en el buscador y lee la pantalla.
//
// Gotchas de medición de la casa: sembrar la cookie de sesión Y
// `sessionStorage.cxc_role` (si no, `useAuth` redirige al login), y
// `delete Navigator.prototype.serviceWorker` antes de navegar (bloquearlo de
// otra forma mata la hidratación).

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CODIGO = process.env.CODIGO ?? "NB2570001";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const SALIDA = `/tmp/referencia-${ETIQUETA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];
/** Abrir también "Ver las N compras anteriores" para medir el estado desplegado. */
const ABRIR_VIEJAS = process.env.ABRIR_VIEJAS !== "0";

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
let malas = 0;

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
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  const input = page.locator('input[aria-label="Buscar referencia"]').first();
  await input.waitFor({ timeout: 20000 });
  await input.fill(CODIGO);
  await page.locator('button:has-text("Buscar")').first().click();
  await page.waitForTimeout(7000);

  for (const estado of ABRIR_VIEJAS ? ["cerrado", "abierto"] : ["cerrado"]) {
    if (estado === "abierto") {
      const abrio = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          /^Ver (la compra anterior|las \d+ compras anteriores)$/.test((x.textContent || "").trim()),
        );
        if (!b) return false;
        b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      });
      await page.waitForTimeout(1200);
      if (!abrio) {
        console.log(`  ${ancho} · abierto: no hay compras anteriores que desplegar — se omite`);
        continue;
      }
    }

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);

      const tarjetas = [...document.querySelectorAll("section.rounded-xl")];
      if (!tarjetas.length) return { sinTarjeta: true };

      const chicos = [];
      const textos = [];
      const recortados = [];
      for (const t of tarjetas) {
        for (const e of t.querySelectorAll("button, a, input")) {
          const r = e.getBoundingClientRect();
          // El disparador del ⓘ mide 44×44 por diseño; el sr-only mide 1 px a
          // propósito y contarlo sería ruido.
          if (r.width > 1 && r.height > 0 && (r.height < 44 || r.width < 44)) {
            chicos.push({ t: (e.textContent || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
        for (const e of t.querySelectorAll("*")) {
          if (!e.childNodes.length) continue;
          const propio = [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim());
          if (!propio) continue;
          const px = parseFloat(getComputedStyle(e).fontSize);
          if (px < 12) textos.push({ t: (e.textContent || "").trim().slice(0, 30), px: Math.round(px * 10) / 10 });
          const r = e.getBoundingClientRect();
          if (r.width > 0 && e.scrollWidth - e.clientWidth > 1) {
            recortados.push({ t: (e.textContent || "").trim().slice(0, 30), px: e.scrollWidth - e.clientWidth });
          }
        }
      }
      // Texto de los tres números y del margen, para el informe.
      const leer = (rot) => {
        const dt = [...document.querySelectorAll("dt")].find((d) => d.textContent?.trim() === rot);
        const dd = dt?.nextElementSibling;
        return dt ? `${rot}: ${dd?.textContent?.trim()} — ${dd?.nextElementSibling?.textContent?.trim() ?? ""}` : null;
      };
      const margen = [...document.querySelectorAll("div")]
        .map((d) => d.textContent?.trim() ?? "")
        .find((t) => /^Vendí a \$/.test(t) || /^No se puede calcular el margen/.test(t));

      return {
        arrastre,
        tarjetas: tarjetas.length,
        chicos,
        textos,
        recortados,
        tres: [leer("Mi última compra"), leer("Vendo por mes"), leer("Me queda para")].filter(Boolean),
        margen: margen ? margen.split("De dónde salen")[0].trim() : null,
        comparacion: [...document.querySelectorAll("p")].map((p) => p.textContent?.trim() ?? "").find((t) => t.startsWith("Esta:")) ?? null,
        temporada: [...document.querySelectorAll("p")].map((p) => p.textContent?.trim() ?? "").find((t) => /^(Oct · nov · dic|Todavía no ha pasado|No vendió nada)/.test(t)) ?? null,
      };
    });

    if (m.sinTarjeta) {
      console.log(`❌ ${ancho} · ${estado}: no se dibujó ninguna tarjeta`);
      malas += 1;
      continue;
    }

    const ok = m.arrastre === 0 && m.chicos.length === 0 && m.textos.length === 0 && m.recortados.length === 0;
    if (!ok) malas += 1;
    console.log(
      `${ok ? "🟢" : "🔴"} ${ancho} px · ${estado} · arrastre ${m.arrastre} px · ${m.tarjetas} tarjeta(s) · ` +
        `blancos <44 px: ${m.chicos.length} · textos <12 px: ${m.textos.length} · recortados: ${m.recortados.length}`,
    );
    if (m.chicos.length) console.log("   chicos:", JSON.stringify(m.chicos));
    if (m.textos.length) console.log("   textos:", JSON.stringify(m.textos));
    if (m.recortados.length) console.log("   recortados:", JSON.stringify(m.recortados));
    if (estado === "cerrado") {
      for (const t of m.tres) console.log(`   ${t}`);
      if (m.comparacion) console.log(`   ${m.comparacion}`);
      if (m.temporada) console.log(`   ${m.temporada}`);
      if (m.margen) console.log(`   ${m.margen}`);
    }

    await page.screenshot({ path: `${SALIDA}/${CODIGO}-${ancho}-${estado}.png`, fullPage: true });
  }

  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO en los 3 anchos" : `\n🔴 ${malas} estado(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
