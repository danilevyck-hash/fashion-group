// Medición REAL en navegador de CUÁNTAS FOTOS DEL CATÁLOGO SE BAJAN DE LA RED,
// en la PRIMERA visita y en la SEGUNDA, con el service worker VIVO.
//
// 🩸 POR QUÉ EXISTE. Daniel, textual: *"pero catalogo me demora en cargar las
// imagenes"*. Una auditoría midió que las fotos están bien optimizadas (WebP,
// 6-9 KB, ninguna pasa de 26 KB) y concluyó que el problema es que el service
// worker NO las cachea porque su matcher de imágenes pide que la URL TERMINE en
// `.jpg`/`.webp` — y la URL del thumbnail termina en `quality=70`. La hipótesis
// dice: cada visita se re-descargan TODAS. Esto lo mide en vez de suponerlo.
//
// 🔑 EL NÚMERO. Por visita: cuántas fotos vinieron de RED y cuántas de CACHÉ
// (de disco o del service worker), y cuántos bytes se movieron de verdad.
//
// 🩸 EL RESOURCE TIMING NO SIRVE ACÁ, y costó una corrida entera descubrirlo
// (12-ago-2026): las fotos son CROSS-ORIGIN (Supabase) y Supabase NO manda
// `Timing-Allow-Origin`, así que `transferSize` y `decodedBodySize` llegan en 0
// para TODAS — de red y de caché por igual. La primera versión de este script
// reportó "0 de red y 0 de caché" sobre 202 fotos, que es la firma de esa
// ceguera, no un resultado. La medición se hace por CDP
// (`Network.responseReceived` → `fromDiskCache` / `fromServiceWorker` +
// `encodedDataLength`), que es la contabilidad del propio navegador.
//
// GOTCHAS (no tocar sin leer):
//   * ⚠️ El service worker NO se desactiva — es justo lo que se está midiendo.
//     (Los demás `_medir-*` hacen `delete Navigator.prototype.serviceWorker`;
//     acá sería medir con el aparato apagado.)
//   * Perfil PERSISTENTE en disco (`launchPersistentContext`): sin él la 2ª
//     visita arranca con caché HTTP y Cache Storage vacíos y el resultado sale
//     amañado — se "mide" que todo se re-descarga porque no había dónde guardar.
//   * Cookie firmada (`cxc_session`) + `sessionStorage.cxc_role`/`fg_modules`:
//     sin eso `CatalogoAuthGuard` redirige y se mide la pantalla de login.
//   * Hay que RECORRER el catálogo (scroll hasta el fondo): las fotos van con
//     `loading="lazy"` y sin scroll solo se piden las primeras filas.
//
// Solo lectura: no guarda, no borra, no envía nada.
//
//   ETAPA=antes   node scripts/_medir-fotos-catalogo.mjs
//   ETAPA=despues MARCA=tommy node scripts/_medir-fotos-catalogo.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3167";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const MARCA = process.env.MARCA ?? "tommy";
const VISITAS = Number(process.env.VISITAS ?? 3);
const PERFIL = process.env.PERFIL ?? `/tmp/t167-perfil-${ETAPA}-${MARCA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Las fotos del catálogo salen SIEMPRE de Supabase Storage: el thumbnail por
// /render/image/ y el original (fallback y lightbox) por /object/public/.
const ES_FOTO = `(u) => /\\/storage\\/v1\\/(render\\/image|object)\\/public\\//.test(u)`;

// Lo único que se lee de la página: cuántas fotos hay dibujadas y si el SW manda.
const MEDIR_DOM = `(() => {
  const esFoto = ${ES_FOTO};
  const imgs = [...document.querySelectorAll("img")].filter((i) =>
    esFoto(i.currentSrc || i.src || ""),
  );
  return {
    imgsEnDom: imgs.length,
    imgsPintadas: imgs.filter((i) => i.naturalWidth > 0).length,
    swControla: !!navigator.serviceWorker?.controller,
  };
})()`;

/** Contabilidad por CDP: la del navegador, que sí sabe de dónde salió cada byte.
 *
 *  🩸 Los bytes se toman de `Network.loadingFinished`, NO de
 *  `Network.responseReceived`: en el momento de la respuesta el
 *  `encodedDataLength` todavía trae solo las cabeceras (dio 0,26 MB para 449
 *  fotos = 580 bytes cada una, que es imposible). Al terminar la descarga sí
 *  viene el total real. */
function contador(cdp) {
  const esFoto = (u) => /\/storage\/v1\/(render\/image|object)\/public\//.test(u);
  const c = { deRed: 0, deDisco: 0, deSW: 0, deMemoria: 0, bytesRed: 0, urls: new Map() };
  const deRedPorId = new Set();
  cdp.on("Network.requestServedFromCache", () => {
    c.deMemoria++;
  });
  cdp.on("Network.responseReceived", (e) => {
    if (!esFoto(e.response.url)) return;
    c.urls.set(e.response.url, (c.urls.get(e.response.url) ?? 0) + 1);
    // fromServiceWorker gana: si el SW la sirvió de su Cache Storage, no hubo red.
    if (e.response.fromServiceWorker) c.deSW++;
    else if (e.response.fromDiskCache) c.deDisco++;
    else {
      c.deRed++;
      deRedPorId.add(e.requestId);
    }
  });
  cdp.on("Network.loadingFinished", (e) => {
    if (deRedPorId.has(e.requestId)) c.bytesRed += e.encodedDataLength || 0;
  });
  return c;
}

// Recorre el catálogo entero para disparar el lazy-load de TODAS las fotos.
const RECORRER = async (page) => {
  await page.evaluate(async () => {
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
    let anterior = -1;
    for (let i = 0; i < 60; i++) {
      window.scrollBy(0, window.innerHeight * 0.9);
      await dormir(220);
      const y = window.scrollY;
      if (y === anterior) break;
      anterior = y;
    }
    window.scrollTo(0, 0);
    await dormir(400);
  });
  // Margen para que cierren las descargas en vuelo.
  await page.waitForTimeout(3000);
};

mkdirSync(SALIDA, { recursive: true });
// Perfil limpio: la 1ª visita tiene que ser de verdad la primera.
rmSync(PERFIL, { recursive: true, force: true });

const ctx = await chromium.launchPersistentContext(PERFIL, {
  viewport: { width: 1440, height: 900 },
});
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("cxc_user", "daniel");
  sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
});

const resultados = [];
for (let v = 1; v <= VISITAS; v++) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const c = contador(cdp);
  const t0 = Date.now();
  await page.goto(`${BASE}/catalogo/${MARCA}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('input[placeholder*="uscar"]', { timeout: 60000 }).catch(() => {});

  // 🔑 LO QUE EL OJO ESPERA: cuánto tarda en haber 1 y 10 fotos PINTADAS (las
  // 10 del primer viewport son las `priority`). Se sondea desde acá cada 100 ms
  // porque el Resource Timing de estas fotos es cross-origin y viene en blanco.
  const pintadas = async () =>
    page.evaluate(`(() => {
      const esFoto = ${ES_FOTO};
      return [...document.querySelectorAll("img")]
        .filter((i) => esFoto(i.currentSrc || i.src || "") && i.naturalWidth > 0).length;
    })()`);
  let msPrimera = null;
  let msDiez = null;
  for (let i = 0; i < 300 && msDiez === null; i++) {
    const n = await pintadas().catch(() => 0);
    const t = Date.now() - t0;
    if (msPrimera === null && n >= 1) msPrimera = t;
    if (n >= 10) msDiez = t;
    if (msDiez === null) await page.waitForTimeout(100);
  }

  // El SW se registra al cargar; en la 1ª visita puede no controlar todavía.
  await page.waitForTimeout(2500);
  await RECORRER(page);
  const dom = await page.evaluate(MEDIR_DOM);
  const repetidas = [...c.urls.values()].filter((n) => n > 1).length;
  const r = {
    visita: v,
    etapa: ETAPA,
    marca: MARCA,
    ...dom,
    deRed: c.deRed,
    deDisco: c.deDisco,
    deSW: c.deSW,
    bytesRed: c.bytesRed,
    urlsUnicas: c.urls.size,
    respuestas: [...c.urls.values()].reduce((s, n) => s + n, 0),
    urlsPedidasMasDeUnaVez: repetidas,
    msPrimeraFoto: msPrimera,
    msDiezFotos: msDiez,
    segundos: Math.round((Date.now() - t0) / 100) / 10,
  };
  resultados.push(r);
  console.error(
    `[${ETAPA}] ${MARCA} visita ${v}: ` +
      `RED ${String(r.deRed).padStart(3)} (${(r.bytesRed / 1024 / 1024).toFixed(2)} MB) · ` +
      `disco ${String(r.deDisco).padStart(3)} · SW ${String(r.deSW).padStart(3)} · ` +
      `1ª foto ${String(r.msPrimeraFoto).padStart(5)} ms · 10 fotos ${String(r.msDiezFotos).padStart(5)} ms · ` +
      `${r.urlsUnicas} URLs (repetidas ${r.urlsPedidasMasDeUnaVez}) · ` +
      `pintadas ${r.imgsPintadas}/${r.imgsEnDom} · SW ${r.swControla ? "controla" : "NO"}`,
  );
  await page.close();
}

await ctx.close();
writeFileSync(path.join(SALIDA, `fotos-catalogo-${MARCA}-${ETAPA}.json`), JSON.stringify(resultados, null, 2));
console.error(`\nJSON en ${SALIDA}/fotos-catalogo-${MARCA}-${ETAPA}.json`);
