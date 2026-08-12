// SOLO LECTURA de la pantalla. Abre /ventas?tab=referencia, busca un código y
// mide los 3 anchos de la casa: cuánto ARRASTRA la página, cuánto se RECORTA,
// si algún blanco táctil baja de 44 px y si algún texto baja de 12 px.
//
// 🔴 La ficha del 12-ago-2026: los TRES GRANDES (Compré · Vendí · Me quedan),
// la línea del 90%, las barras (ancladas a la llegada o últimos 12 con ▲) y la
// fila de plata AGRUPADA — Precio prom · lista | Costo CIF · FOB | margen — que
// es la que puede envolver mal a 390 px: el script la lee y la imprime.
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
// Los 3 anchos de la casa; ANCHOS=390,834,1024,1440 agrega el iPad acostado,
// donde la barra lateral deja ~766 px útiles.
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);

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

  {
    const estado = "único";

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
        return dt ? `${rot}: ${dd?.textContent?.trim()} — ${(dd?.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90)}` : null;
      };
      // La línea del 90% (la p entre los tres grandes y las barras).
      const linea90 = [...document.querySelectorAll("p")]
        .map((x) => (x.textContent ?? "").replace(/\s+/g, " ").trim())
        .find((t) => /^(El 90% se vendió|En .*va |En .*no se ha vendido|Desde .* llegaron|vendo .* por mes)/.test(t)) ?? null;
      // 🔴 LA FILA DE PLATA, tal como se lee. Es UNA sola y es la más larga de
      // la tarjeta: a 390 px tiene que envolver sin empujar nada de lado.
      const marca = [...document.querySelectorAll("span")].find(
        (s) => (s.textContent || "").trim().startsWith("Precio prom "),
      );
      const filaPlata = marca?.closest("div.flex");
      const plata = filaPlata
        ? (filaPlata.textContent || "").replace(/De dónde salen estos números.*$/s, "").replace(/\s+/g, " ").trim()
        : ([...document.querySelectorAll("p")]
            .map((p) => p.textContent?.trim() ?? "")
            .find((t) => /^No se puede calcular el margen/.test(t)) ?? null);

      return {
        arrastre,
        tarjetas: tarjetas.length,
        chicos,
        textos,
        recortados,
        tres: [leer("Compré"), leer("Vendí"), leer("Me quedan")].filter(Boolean),
        linea90,
        plata,
        // Las líneas de la fila de plata: si envuelve, crece hacia ABAJO. Más de
        // una línea a 390 px es normal; lo que no puede es arrastrar.
        plataAlto: filaPlata ? Math.round(filaPlata.getBoundingClientRect().height) : 0,
        // 🔴 Nada de esto puede aparecer: la atribución que se eliminó y los
        // rótulos que repetían el mismo número.
        atribucion: [
          "Mi última compra",
          "todavía no se acaba",
          "van 0",
          "Esta:",
          // 🔴 Podados el 12-ago: las cajas grandes del ritmo y "(calculado)".
          "Vendo por mes",
          "Me queda para",
          "(calculado)",
          // 🔴 Y los textos podados el 11-ago (noche): el número repetido y los
          // dos pies de página.
          "CIF de hoy",
          "CIF de la compra anterior",
          "Vendí a",
          "me costó",
          "Lo que queda en bodega es de Switch",
          "compras más viejas de 3 años",
          "más de hace años",
        ].filter((t) =>
          (document.body.textContent ?? "").includes(t),
        ),
        temporada: [...document.querySelectorAll("p")].map((p) => p.textContent?.trim() ?? "").find((t) => /^(Oct · nov · dic|Todavía no ha pasado|No vendió nada)/.test(t)) ?? null,
      };
    });

    if (m.sinTarjeta) {
      console.log(`❌ ${ancho} · ${estado}: no se dibujó ninguna tarjeta`);
      malas += 1;
      continue;
    }

    const ok =
      m.arrastre === 0 &&
      m.chicos.length === 0 &&
      m.textos.length === 0 &&
      m.recortados.length === 0 &&
      m.atribucion.length === 0;
    if (!ok) malas += 1;
    console.log(
      `${ok ? "🟢" : "🔴"} ${ancho} px · ${estado} · arrastre ${m.arrastre} px · ${m.tarjetas} tarjeta(s) · ` +
        `blancos <44 px: ${m.chicos.length} · textos <12 px: ${m.textos.length} · recortados: ${m.recortados.length}`,
    );
    if (m.chicos.length) console.log("   chicos:", JSON.stringify(m.chicos));
    if (m.textos.length) console.log("   textos:", JSON.stringify(m.textos));
    if (m.recortados.length) console.log("   recortados:", JSON.stringify(m.recortados));
    if (m.atribucion.length) console.log("   🔴 ATRIBUCIÓN DE VUELTA:", JSON.stringify(m.atribucion));
    for (const t of m.tres) console.log(`   ${t}`);
    if (m.linea90) console.log(`   ${m.linea90}`);
    if (m.temporada) console.log(`   ${m.temporada}`);
    if (m.plata) console.log(`   ${m.plata}   [${m.plataAlto} px de alto]`);

    await page.screenshot({ path: `${SALIDA}/${CODIGO}-${ancho}-${estado}.png`, fullPage: true });
  }

  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO en los 3 anchos" : `\n🔴 ${malas} estado(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
