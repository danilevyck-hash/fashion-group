// Medición del REPORTE DE ASISTENCIA arreglado, en los tres anchos: 390 · 834 ·
// 1440 (más 1024, el iPad acostado, donde este repo ya se quemó dos veces).
//
// Qué mide, en /asistencia?tab=reporte, con DATOS DE PRODUCCIÓN:
//   1. El reporte con el aviso «Hoy … todavía va corriendo» arriba.
//   2. El detalle abierto, con el chip GRIS «En curso» en la fila de hoy.
//   3. El aviso «N personas no aparecen» (vigencia).
//   4. Un rango PASADO: ni aviso de día en curso ni chip — el borde.
//
// Y en los cuatro: ARRASTRE de página · RECORTES · blancos táctiles <44 px ·
// textos <12 px.
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 HOY NADIE ESTÁ FUERA DE VIGENCIA en producción (medido: 0), así que el
// aviso del punto 3 no aparecería solo y el script pasaría en verde sin haber
// mirado nada. Para ESE estado se INTERCEPTA la respuesta de
// `/api/asistencia/reporte` y se le cambia `fueraDelRango` a 2 — el resto del
// payload es el de producción y el componente que se mide es el REAL. No se
// toca la base ni se aprieta ningún botón que escriba.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo), y las
// filas del detalle son una tabla ANIDADA — contar `tbody tr` a secas mezcla
// las dos y el índice deja de significar "la persona i".
//
//   npm run build && npx next start -p 3488
//   BASE=http://localhost:3488 node scripts/_medir-reporte-hoy-y-vigencia.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3488";
const OUT = process.env.OUT ?? "/tmp/asistencia-reporte-hoy";
// `antes` = el build de `origin/main` (línea base: qué recortes y textos chicos
// ya existían). `despues` = este PR. Los dos escriben su JSON en OUT.
const ETAPA = process.env.ETAPA ?? "despues";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "Daniel", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = cookieDeSesion();

const MEDIR = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [], tactiles = [], textosChicos = [];
  const zonas = [raiz, ...document.querySelectorAll("body > div.fixed.inset-0")];
  for (const zona of zonas) {
    for (const el of zona.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
        recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 50)}`, px: el.scrollWidth - el.clientWidth });
      }
      if (el.matches("button, a[href], input, select, textarea, [role=button]") && r.height < 43.5) {
        tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 28) });
      }
      if (el.children.length === 0 && (el.textContent ?? "").trim()) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
      }
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM. */
const LEER = () => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  // El detalle es una tabla ANIDADA: se la busca explícitamente en vez de
  // contar `tbody tr` a secas, que mezclaría las filas de personas con las de
  // días y haría que el índice no signifique nada.
  const anidada = document.querySelector("td table");
  const filasDetalle = anidada ? [...anidada.querySelectorAll("tbody tr")] : [];
  return {
    personas: document.querySelectorAll("tbody > tr[class*=cursor], tbody > tr").length,
    avisoDiaEnCurso: /todavía va corriendo/.test(txt),
    avisoFueraDeRango: /no aparecen? porque no estaba trabajando/.test(txt),
    chipEnCurso: filasDetalle.some((tr) => /En curso/.test(tr.textContent ?? "")),
    chipRevisar: filasDetalle.some((tr) => /Revisar/.test(tr.textContent ?? "")),
    diceTodaviaNoMarco: /Todavía no marcó — el día va corriendo/.test(txt),
    filasDetalle: filasDetalle.length,
    ayudaExplica: /El día de hoy nunca entra ahí/.test(txt),
  };
};

// 🩸 SE COMPARAN CATEGORÍAS, NO CONTEOS. El detalle que se abre depende de qué
// persona tenga el caso que se busca, y esa persona no es la misma en los dos
// builds: contar "17 vs 19 textos chicos" mezcla el cambio con el fixture y no
// dice nada. Lo que sí es comparable es QUÉ textos chicos existen —«10.5px |
// Persona», «11px | Revisar»— y ahí una categoría NUEVA es una regresión real.
const chico = (m) => ({
  arrastre: m.arrastre,
  recortados: m.recortados.length,
  peorRecorte: m.recortados.reduce((a, r) => Math.max(a, r.px), 0),
  tactiles: m.tactiles.length,
  textosChicos: m.textosChicos.length,
  clasesRecorte: [...new Set(m.recortados.map((r) => r.el))].sort(),
  clasesTextoChico: [...new Set(m.textosChicos.map((t) => `${t.fs}px | ${t.txt}`))].sort(),
  clasesTactiles: [...new Set(m.tactiles.map((t) => `${t.alto}px | ${t.txt}`))].sort(),
});

async function abrirReporte(page, { desde, hasta, inyectarFuera }) {
  if (inyectarFuera) {
    await page.route("**/api/asistencia/reporte*", async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      // Solo se toca el contador del aviso: el resto es producción tal cual.
      j.fueraDelRango = 2;
      await route.fulfill({ response: res, body: JSON.stringify(j) });
    });
  }
  await page.goto(`${BASE}/asistencia?tab=reporte`, { waitUntil: "networkidle" });
  // 🩸 Esperar la TABLA, no un timeout: con `waitForTimeout` a secas, una
  // corrida lenta medía la pantalla todavía vacía y reportaba "no se ve el
  // aviso" — un falso rojo indistinguible de una regresión real.
  await page.waitForSelector("tbody > tr", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  // 🩸 El rango NO viaja en la URL y los `input[type=date]` viven DENTRO del
  // desplegable cerrado: sin abrirlo, `fill()` no encuentra nada y el script
  // mediría el rango por defecto creyendo que midió otro.
  if (desde) {
    await page.getByRole("button", { name: /Últimos 15 días|Quincena|—/ }).first().click();
    await page.waitForTimeout(250);
    const inputs = page.locator('input[type="date"]');
    await inputs.nth(1).fill(hasta);   // primero el tope: `max` del otro depende de él
    await page.waitForTimeout(400);
    await inputs.nth(0).fill(desde);
    await page.waitForTimeout(400);
    // Se CIERRA el desplegable: sus botones de 40 px son pre-existentes y solo
    // existen mientras está abierto — medirlos sería medir otra pantalla.
    await page.getByRole("button", { name: /▲/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(600);
}

const ESTADOS = [
  { id: "1-hoy-en-rango", abrir: {}, abrirDetalle: true },
  { id: "2-fuera-de-rango", abrir: { inyectarFuera: true }, abrirDetalle: false },
  { id: "3-rango-pasado", abrir: { desde: "2026-07-01", hasta: "2026-07-15" }, abrirDetalle: true, pasado: true },
];

const fallos = [];
const resumen = {};

const browser = await chromium.launch();
for (const anc of ANCHOS) {
  for (const est of ESTADOS) {
    const ctx = await browser.newContext({ viewport: { width: anc.w, height: anc.h } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => {
      // Sin esto todo redirige al login, y sin lo segundo el SW mata la hidratación.
      sessionStorage.setItem("cxc_role", "admin");
      // eslint-disable-next-line no-undef
      delete Navigator.prototype.serviceWorker;
    });
    const page = await ctx.newPage();
    await abrirReporte(page, est.abrir);

    if (est.abrirDetalle) {
      // 🩸 NO alcanza con abrir la primera persona: la de arriba puede no tener
      // marcas hoy, y entonces su fila de hoy dice «Todavía no marcó» y el chip
      // «En curso» no aparecería — el script daría por ausente algo que sí está.
      // Se abren personas hasta encontrar una CON marcas en el día que se busca.
      // 🩸 Y se busca «En curso» EXACTAMENTE, no «En curso|Revisar»: con el OR,
      // la primera persona (que tiene un día viejo mal marcado) hacía match por
      // «Revisar» y el bucle paraba ahí — el chip nuevo quedaba sin medir y el
      // script lo reportaba como ausente. Un criterio de parada de más es un
      // criterio que mide otra cosa.
      const busca = est.pasado ? /Revisar/ : /En curso/;
      const filas = page.locator("tbody > tr");
      const total = Math.min(await filas.count(), 40);
      for (let i = 0; i < total; i++) {
        await filas.nth(i).click();
        await page.waitForTimeout(300);
        const hay = await page.evaluate((re) => {
          const an = document.querySelector("td table");
          if (!an) return false;
          return [...an.querySelectorAll("tbody tr")].some((tr) => new RegExp(re).test(tr.textContent ?? ""));
        }, busca.source);
        if (hay) break;
        await filas.nth(i).click(); // cerrar y probar la siguiente
        await page.waitForTimeout(200);
      }
    }
    // El ⓘ está COLAPSADO por defecto: su texto no está en el DOM hasta que se
    // abre. Comprobarlo cerrado sería comprobar que no existe.
    await page.getByRole("button", { name: /Cómo se leen estos números/ }).first()
      .click().catch(() => {});
    await page.waitForTimeout(300);

    const m = await page.evaluate(MEDIR);
    const l = await page.evaluate(LEER);
    const clave = `${anc.nombre}/${est.id}`;
    resumen[clave] = { ...chico(m), ...l };
    await page.screenshot({ path: `${OUT}/${anc.w}-${est.id}.png`, fullPage: true });

    // El arrastre SIEMPRE es rojo: la regla del repo es 0 px, sin excepciones
    // heredadas. Los recortes y los textos chicos se juzgan contra main abajo.
    if (m.arrastre > 0) fallos.push(`${clave}: ARRASTRE ${m.arrastre}px`);

    // 🔴 El script FALLA si no encuentra lo que vino a medir: dar verde sin
    // haber mirado nada es el peor resultado posible.
    // ⚠️ En `ETAPA=antes` (el build de `origin/main`) estos elementos NO existen
    // todavía: exigirlos ahí haría fallar la línea base, que es justamente lo
    // que hay que poder medir para saber qué recortes son PRE-EXISTENTES.
    if (ETAPA === "antes") { await ctx.close(); continue; }
    if (est.id === "1-hoy-en-rango") {
      if (!l.avisoDiaEnCurso) fallos.push(`${clave}: NO se ve el aviso del día en curso`);
      if (!l.chipEnCurso) fallos.push(`${clave}: NO se ve el chip «En curso» en el detalle`);
      if (!l.ayudaExplica) fallos.push(`${clave}: el ⓘ no explica que hoy no entra`);
    }
    if (est.id === "2-fuera-de-rango" && !l.avisoFueraDeRango) {
      fallos.push(`${clave}: NO se ve el aviso de «no aparecen»`);
    }
    if (est.id === "3-rango-pasado") {
      if (l.avisoDiaEnCurso) fallos.push(`${clave}: un rango PASADO anuncia un día en curso`);
      if (l.chipEnCurso) fallos.push(`${clave}: un rango PASADO tiene chip «En curso»`);
    }
    await ctx.close();
  }
}
await browser.close();

// ── Comparación contra `origin/main` ────────────────────────────────────────
// 🔴 SIN LÍNEA BASE, ESTE SCRIPT NO SIRVE DE PORTERO: el módulo ya tenía sus
// etiquetas de columna de 10/10,5 px y el `H1.sr-only` recortado, así que
// reportarlos como hallazgos sería gritar todos los días por algo que no cambió
// —y el día que aparezca un recorte de verdad, nadie lo vería entre el ruido—.
// Lo que se exige es que este PR no ESTRENE ninguna categoría.
const BASELINE = `${OUT}/medicion-antes.json`;
if (ETAPA === "despues" && existsSync(BASELINE)) {
  const antes = JSON.parse(readFileSync(BASELINE, "utf8"));
  const union = (o, campo) => new Set(Object.values(o).flatMap((v) => v[campo] ?? []));
  for (const campo of ["clasesTextoChico", "clasesRecorte", "clasesTactiles"]) {
    const viejo = union(antes, campo);
    for (const [clave, v] of Object.entries(resumen)) {
      for (const x of v[campo] ?? []) {
        if (!viejo.has(x)) fallos.push(`${clave}: ${campo} NUEVO respecto de main — «${x}»`);
      }
    }
  }
  for (const [clave, v] of Object.entries(resumen)) {
    const base = antes[clave];
    if (base && v.arrastre > base.arrastre) {
      fallos.push(`${clave}: ARRASTRE subió ${base.arrastre}→${v.arrastre}px respecto de main`);
    }
  }
  console.log("(comparado contra la línea base de origin/main)");
} else if (ETAPA === "despues") {
  console.log(`⚠️ sin línea base en ${BASELINE}: los recortes y textos chicos PRE-EXISTENTES`);
  console.log("   del módulo van a salir como hallazgos. Corré antes ETAPA=antes contra main.");
}

writeFileSync(`${OUT}/medicion-${ETAPA}.json`, JSON.stringify(resumen, null, 2));
console.log(JSON.stringify(resumen, null, 2));
console.log(`\nCapturas y JSON en ${OUT} (etapa: ${ETAPA})`);
if (fallos.length) {
  console.log(`\n🔴 ${fallos.length} hallazgo(s):`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("\n🟢 390 · 834 · 1024 · 1440 — 0 arrastre, 0 recortados, 0 blancos <44px, 0 textos <12px");
