// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los CUATRO anchos de la barra «Instala Fashion Group»
// (25-ago-2026).
//
// Mide `/home` en 390 · 834 · 1024 · 1440 con DOS navegadores simulados:
//
//   iphone   Safari de iPhone. NO dispara `beforeinstallprompt` — es el caso
//            que Daniel pidió sacar. Acá la barra tiene que NO EXISTIR.
//   android  Chrome. El script dispara el evento REAL `beforeinstallprompt`
//            (headless no cumple los criterios de instalación por su cuenta),
//            que es exactamente lo que hace el navegador de Daniel en su
//            Android/escritorio. Acá la barra tiene que SEGUIR VIVA.
//
// 🔴 SE MIDE EL ALTO QUE LA BARRA TAPA, no solo si está. Es `position: fixed`
// pegada abajo: no achica el layout, TAPA los últimos N píxeles de la pantalla.
// Ése es el número que dice qué se recupera al sacarla.
//
// 🔴 EL NAVEGADOR ABORTA TODO PEDIDO QUE NO SEA GET. Nada de esto escribe.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion.ts > /tmp/fg-cookie.txt
//   BASE=http://localhost:3901 ETAPA=despues node scripts/_medir-install-prompt-anchos.mjs
//   BASE=http://localhost:3902 ETAPA=antes    node scripts/_medir-install-prompt-anchos.mjs
//
// Gotchas de la casa que este script respeta: sembrar `sessionStorage.cxc_role`
// y borrar `Navigator.prototype.serviceWorker` ANTES de navegar, y limpiar la
// key de descarte (`fg_modoviaje_install_dismissed`) — si quedó puesta, la
// barra no se dibuja NUNCA y la medición daría "0" sin haber mirado nada.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3901";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/install-prompt-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

mkdirSync(SALIDA, { recursive: true });

/** Lo que se lee del DOM ya cargado. */
const MEDIR = () => {
  const de = document.documentElement;

  // La barra: el único `div.fixed.inset-x-0.bottom-0` del layout raíz.
  const cajas = [...document.querySelectorAll("div")].filter((e) => {
    const s = getComputedStyle(e);
    return s.position === "fixed" && s.bottom === "0px" && e.textContent?.includes("Instala Fashion Group");
  });
  const barra = cajas[0] ?? null;
  const r = barra?.getBoundingClientRect() ?? null;

  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44);
    })
    .map((e) => {
      const b = e.getBoundingClientRect();
      return {
        t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 28),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    });

  const recortados = [...document.querySelectorAll("body div *")].filter((e) => {
    const s = getComputedStyle(e);
    if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
    return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
  }).length;

  const textoChico = [...document.querySelectorAll("*")]
    .filter((e) => {
      if (!e.textContent?.trim() || e.children.length) return false;
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return false;
      return parseFloat(getComputedStyle(e).fontSize) < 12;
    })
    .map((e) => e.textContent.trim().slice(0, 24));

  const txt = document.body.innerText;
  return {
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    altoVentana: window.innerHeight,
    // 🔴 Lo que la barra TAPA de la ventana. Sin barra, 0.
    altoTapadoPorLaBarra: r ? Math.round(Math.max(0, window.innerHeight - r.top)) : 0,
    barraVisible: !!barra,
    barraCaja: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    botonInstalar: [...document.querySelectorAll("button")].some(
      (b) => (b.textContent || "").trim() === "Instalar app",
    ),
    instructivoManual: /Agregar a inicio|Toca Compartir/.test(txt),
    chicos,
    recortados,
    textoChico,
  };
};

async function medirPerfil(browser, ua, nombre, dispararEvento) {
  const filas = [];
  for (const ancho of ANCHOS) {
    const ctx = await browser.newContext({
      userAgent: ua,
      viewport: { width: ancho, height: 900 },
      deviceScaleFactor: 2,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);

    // 🔴 Nada que no sea GET sale de acá.
    let bloqueadas = 0;
    await ctx.route("**/*", (route) => {
      if (route.request().method() !== "GET") {
        bloqueadas++;
        return route.abort();
      }
      return route.continue();
    });

    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("cxc_role", "admin");
        // Si quedó la key de descarte, la barra NO se dibuja nunca y la
        // medición diría "0" sin haber mirado nada.
        localStorage.removeItem("fg_modoviaje_install_dismissed");
      } catch {}
      // El SW mata la hidratación en este arnés.
      try {
        delete Navigator.prototype.serviceWorker;
      } catch {}
    });

    await page.goto(`${BASE}/home`, { waitUntil: "networkidle", timeout: 120000 });

    if (dispararEvento) {
      // Chrome headless no cumple los criterios de instalación por su cuenta:
      // se dispara el evento REAL, con la misma forma que manda el navegador.
      await page.evaluate(() => {
        const e = new Event("beforeinstallprompt", { cancelable: true });
        e.prompt = () => Promise.resolve();
        e.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(e);
      });
      await page.waitForTimeout(250);
    }

    const m = await page.evaluate(MEDIR);
    m.escriturasBloqueadas = bloqueadas;
    await page.screenshot({ path: `${SALIDA}/${nombre}-${ancho}.png`, fullPage: false });
    filas.push({ perfil: nombre, ancho, ...m });
    await ctx.close();
  }
  return filas;
}

const browser = await chromium.launch();
const filas = [
  ...(await medirPerfil(browser, UA_IPHONE, "iphone", false)),
  ...(await medirPerfil(browser, UA_ANDROID, "android", true)),
];
await browser.close();

writeFileSync(`${SALIDA}/medicion.json`, JSON.stringify({ BASE, ETAPA, filas }, null, 2));

console.log(`\n═══ INSTALL PROMPT · ${ETAPA} · ${BASE} ═══\n`);
for (const f of filas) {
  console.log(
    `${f.perfil.padEnd(8)} ${String(f.ancho).padStart(5)}  barra=${f.barraVisible ? "SÍ" : "no"}` +
      `  tapa=${String(f.altoTapadoPorLaBarra).padStart(3)}px  botón=${f.botonInstalar ? "SÍ" : "no"}` +
      `  instructivo=${f.instructivoManual ? "SÍ" : "no"}` +
      `  arrastre=${f.arrastrePagina}  recortados=${f.recortados}` +
      `  táctiles<44=${f.chicos.length}  textos<12=${f.textoChico.length}` +
      `  bloqueadas=${f.escriturasBloqueadas}`,
  );
}

// ── Veredicto: el script FALLA si mide cero sin haber mirado nada ───────────
const problemas = [];
const iph = filas.filter((f) => f.perfil === "iphone");
const and = filas.filter((f) => f.perfil === "android");

if (ETAPA === "despues") {
  for (const f of iph) {
    if (f.barraVisible) problemas.push(`iphone ${f.ancho}: la barra SIGUE apareciendo`);
    if (f.instructivoManual) problemas.push(`iphone ${f.ancho}: quedó el instructivo manual`);
  }
} else {
  // En `origin/main` la barra iOS TIENE que estar: si no, no hay nada que
  // comparar y el "antes" no probaría nada.
  if (!iph.some((f) => f.barraVisible)) {
    problemas.push("antes: la barra de iOS no apareció en NINGÚN ancho — la medición no vale");
  }
}

// 🔴 LA MITAD QUE MÁS IMPORTA, en las DOS etapas: donde SÍ se puede instalar,
// la barra y su botón siguen vivos.
for (const f of and) {
  if (!f.barraVisible) problemas.push(`android ${f.ancho}: la barra NO apareció`);
  if (!f.botonInstalar) problemas.push(`android ${f.ancho}: falta el botón «Instalar app»`);
}
for (const f of filas) {
  if (f.arrastrePagina > 0) problemas.push(`${f.perfil} ${f.ancho}: ${f.arrastrePagina}px de arrastre`);
  if (f.escriturasBloqueadas > 0) {
    console.log(`  ⚠️  ${f.perfil} ${f.ancho}: ${f.escriturasBloqueadas} escritura(s) BLOQUEADA(S)`);
  }
}

console.log();
if (problemas.length) {
  console.log("🔴 PROBLEMAS:");
  for (const p of problemas) console.log(`  · ${p}`);
  process.exit(1);
}
console.log("🟢 OK");
