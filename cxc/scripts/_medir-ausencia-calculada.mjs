// Medición de la PLANILLA y del REPORTE tocados por el PR «la ausencia se
// calcula», en los CUATRO anchos: 390 · 834 · 1024 · 1440.
//
// Qué mide en /asistencia?tab=planilla, con datos de PRODUCCIÓN:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · Y lo que este PR vino a cambiar, leído del DOM real, con el DETALLE de
//     una persona ABIERTO:
//       – la etiqueta «Ausencias (… · N día(s) de más de 30 min tarde)»;
//       – la línea azul que explica de dónde sale el monto de la ausencia;
//       – que la etiqueta «Tardanzas (X min)» NO muestre el total viejo.
//     (Y de paso, que los avisos que ya había sigan ahí: período abierto,
//      código sin ficha una sola vez, y el grupo «Decidilo vos».)
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login), `delete Navigator.prototype.serviceWorker`
// antes de navegar, esta app NO tiene <main>, y la pestaña vive en la URL.
//
// SOLO LECTURA: se abren pantallas y se leen. No se toca ningún botón que
// guarde ni ningún campo de monto.
//
//   npm run build && PORT=3499 npm run start
//   BASE=http://localhost:3499 ETAPA=antes|despues node scripts/_medir-ausencia-calculada.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3499";
const OUT = process.env.OUT ?? "/tmp/ausencia-calculada";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

/** Las tres empresas: Boston tiene los dos casos de vigencia parcial. */
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error("Falta /tmp/fg-cookie.txt (cookie cxc_session de una sesión real)");
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = cookieDeSesion();

const RAIZ = `[...document.querySelectorAll('div[class*="transition-"]')]
  .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0] ?? document.body`;

const MEDIR = new Function(`
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const recortados = []; const tactiles = []; const textosChicos = [];
  const raiz = ${RAIZ};
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: el.tagName + "." + String(el.className).slice(0, 60), px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 28) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
`);

/** Lo que este PR cambió, leído del DOM. */
const LEER_CAMBIOS = new Function(`
  const raiz = ${RAIZ};
  const txt = (raiz.textContent ?? "").replace(/\\s+/g, " ");
  const cuenta = (re) => (txt.match(re) ?? []).length;
  return {
    avisoPeriodoAbierto: /todavía no termina/.test(txt),
    avisoSinFicha: cuenta(/no tiene ficha \\(código/g),
    // 🔴 Adentro del cuadro NO puede quedar ninguna fila «sin ficha».
    filaSinFichaEnElCuadro: cuenta(/sin ficha en Configuración/g),
    grupoDecidir: /Decidilo vos:/.test(txt),
    // ── Lo que trae ESTE PR ──────────────────────────────────────────────
    // 🔑 El ESCRITORIO y el CELULAR lo dicen por caminos distintos —la tabla
    // con un asterisco y su pie, la tarjeta con la etiqueta y la línea azul—,
    // así que se miden los dos y se exige el que corresponde a cada ancho.
    pieAsterisco: /Incluye días en que la persona SÍ vino pero llegó más de 30 minutos tarde/.test(txt),
    // 🔑 El asterisco en una celda de «Ausencias». Es el TESTIGO de que en esta
    // empresa y esta quincena hay algo que explicar: sin él, exigir el pie
    // sería exigirlo donde no corresponde (Fashion Wear, 16-31 jul, no tiene
    // ni un día de más de 30 minutos tarde — medido).
    hayAsterisco: [...raiz.querySelectorAll("td span span")].some((e) => (e.textContent ?? "").trim() === "*"),
    etiquetaAusenciaConDias: cuenta(/de más de 30 min tarde/g),
    explicacionAusencia: cuenta(/en que llegó más de 30 minutos tarde/g),
    grupoFalta: /Falta un dato:/.test(txt),
    motivosDecidir: cuenta(/(entró el \\d|salió el \\d|Vacaciones del |Trabajo fuera de la oficina del )/g),
    quincenaCompleta: cuenta(/la quincena completa le daría/g),
    // Testigo de que la pantalla TRAJO DATOS.
    hayTotal: /TOTAL/.test(txt) || /Total ·/.test(txt),
    filas: document.querySelectorAll("table tbody tr").length,
  };
`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

const page = await ctx.newPage();
const resultados = {};

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};
  for (const empresa of EMPRESAS) {
    await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.waitForTimeout(1500);
    // 🩸 SE ELIGE UNA QUINCENA CERRADA CON DATOS, y no la que abre la pantalla.
    // Hoy es 25-ago: la quincena en curso tiene medio mes sin marcar y en varias
    // empresas NO hay ni un día de más de 30 minutos tarde. Midiendo ésa, el
    // script pasaría en verde sin haber visto ni una de las etiquetas nuevas.
    // La del 16 al 31 de julio las tiene en las tres empresas (medido).
    await page.locator("select").first().selectOption({ label: "16 al 31 de julio de 2026" }).catch(() => {});
    await page.waitForTimeout(1200);
    // La empresa se elige en el desplegable, que es como lo hace una persona.
    await page.locator("select").nth(1).selectOption(empresa).catch(() => {});
    await page.waitForTimeout(2500);
    // 🔴 EN EL CELULAR EL DETALLE VIVE ADENTRO DE LA TARJETA, y es donde están
    // la etiqueta de «Ausencias» y la línea azul. Medir las tarjetas cerradas
    // daría verde sin haber mirado ni una. Se abren TODAS: no se sabe de
    // antemano cuál tiene un día de más de 30 minutos tarde.
    // 🩸 El escritorio NO tiene tarjetas (`md:hidden`): ahí lo que se exige es
    // el asterisco y su pie, que es otro camino para el mismo hecho.
    // 🩸 SOLO UNA TARJETA PUEDE ESTAR ABIERTA A LA VEZ (`setAbierta` guarda UN
    // código). Abrirlas todas en fila las va cerrando una a una y al final no
    // queda ninguna con el detalle a la vista: el script leía cero etiquetas y
    // decía que faltaban. Se abre UNA, se lee, y se acumula con OR.
    let extra = { pieAsterisco: false, hayAsterisco: false, etiquetaAusenciaConDias: 0, explicacionAusencia: 0 };
    /** El PEOR caso de layout entre todos los estados mirados, no el último. */
    let peor = { arrastre: 0, recortados: [], tactiles: [], textosChicos: [] };
    if (a.w < 768) {
      // 🩸 DOS TRAMPAS, LAS DOS DABAN UN VERDE FALSO:
      //  1. Solo UNA tarjeta puede estar abierta a la vez (`setAbierta` guarda
      //     UN código), así que abrirlas todas en fila las va cerrando.
      //  2. Clickear `first()` en bucle OSCILA entre las dos primeras: al abrir
      //     la B, la A vuelve a decir «ver detalle» y vuelve a ser la primera.
      //     Se recorren 18 tarjetas y se abren siempre las mismas dos.
      // Se recorre por NOMBRE, que es estable, y se abre una por una.
      const nombres = await page.evaluate(() => [...document.querySelectorAll("button")]
        .filter((b) => (b.textContent ?? "").includes("ver detalle"))
        .map((b) => (b.querySelector("span span") ?? b).textContent?.trim() ?? ""));
      for (const nombre of nombres) {
        if (!nombre) continue;
        const boton = page.locator(`button:has-text("${nombre.replace(/"/g, "")}")`).first();
        await boton.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(120);
        const r = await page.evaluate(LEER_CAMBIOS);
        // 🔴 Y SE MIDE EL LAYOUT CON LA TARJETA ABIERTA. La línea azul que
        // explica la ausencia vive ADENTRO del detalle: midiendo solo las
        // tarjetas cerradas, un texto que se sale de la pantalla no aparecería
        // en ningún número y el script daría verde igual.
        const m = await page.evaluate(MEDIR);
        peor = {
          arrastre: Math.max(peor.arrastre, m.arrastre),
          recortados: m.recortados.length > peor.recortados.length ? m.recortados : peor.recortados,
          tactiles: m.tactiles.length > peor.tactiles.length ? m.tactiles : peor.tactiles,
          textosChicos: m.textosChicos.length > peor.textosChicos.length ? m.textosChicos : peor.textosChicos,
        };
        extra = {
          pieAsterisco: extra.pieAsterisco || r.pieAsterisco,
          hayAsterisco: extra.hayAsterisco || r.hayAsterisco,
          etiquetaAusenciaConDias: Math.max(extra.etiquetaAusenciaConDias, r.etiquetaAusenciaConDias),
          explicacionAusencia: Math.max(extra.explicacionAusencia, r.explicacionAusencia),
        };
        // Se cierra antes de pasar a la siguiente: así el DOM vuelve al estado
        // conocido y el próximo `has-text` no encuentra dos botones iguales.
        await boton.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(60);
      }
    }
    if (process.env.DEBUG_MEDICION) {
      console.error("DBG", a.nombre, empresa, "extra=", JSON.stringify(extra));
    }
    const leido = await page.evaluate(LEER_CAMBIOS);
    const medidoCerrado = await page.evaluate(MEDIR);
    paso[empresa] = {
      ...medidoCerrado,
      arrastre: Math.max(medidoCerrado.arrastre, peor.arrastre),
      recortados: peor.recortados.length > medidoCerrado.recortados.length ? peor.recortados : medidoCerrado.recortados,
      tactiles: peor.tactiles.length > medidoCerrado.tactiles.length ? peor.tactiles : medidoCerrado.tactiles,
      textosChicos: peor.textosChicos.length > medidoCerrado.textosChicos.length ? peor.textosChicos : medidoCerrado.textosChicos,
      ...leido,
      pieAsterisco: leido.pieAsterisco || extra.pieAsterisco,
      hayAsterisco: leido.hayAsterisco || extra.hayAsterisco,
      etiquetaAusenciaConDias: Math.max(leido.etiquetaAusenciaConDias, extra.etiquetaAusenciaConDias),
      explicacionAusencia: Math.max(leido.explicacionAusencia, extra.explicacionAusencia),
    };
    await page.screenshot({ path: `${OUT}/planilla-${process.env.ETAPA ?? "despues"}-${empresa}-${a.w}.png`, fullPage: true });
  }
  resultados[a.nombre] = paso;
}

await browser.close();

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
const problemas = [];
for (const [ancho, p] of Object.entries(resultados)) {
  for (const [empresa, r] of Object.entries(p)) {
    const q = `${ancho}/${empresa}`;
    if (!r.hayTotal) problemas.push(`${q}: la planilla salió vacía`);
    // ⚠️ La quincena elegida (16-31 jul) YA CERRÓ, así que no lleva el aviso de
    // período abierto ni el del código sin ficha: exigirlos acá sería copiar un
    // chequeo de otro PR que no aplica a estos datos. Lo que sí se exige es que
    // NINGUNA fila «sin ficha» se haya colado adentro del cuadro.
    if (r.filaSinFichaEnElCuadro) problemas.push(`${q}: quedó una fila «sin ficha» DENTRO del cuadro`);
    // 🩸 Solo se exige DESPUÉS: en `origin/main` estas etiquetas no existen, y
    // exigirlas en el «antes» haría fallar la línea de base a propósito.
    if ((process.env.ETAPA ?? "despues") === "despues") {
      // 🔴 LA INVARIANTE, y no una lista de empresas que envejece: el pie
      // aparece EXACTAMENTE cuando hay un asterisco. Un asterisco sin pie deja
      // un símbolo sin explicar; un pie sin asterisco es un cartel que no
      // aplica y que se deja de leer.
      if (r.hayAsterisco !== r.pieAsterisco) {
        problemas.push(`${q}: asterisco=${r.hayAsterisco} pero pie=${r.pieAsterisco} — tienen que ir juntos`);
      }
      if (ancho === "iPhone" && r.hayAsterisco) {
        if (!r.etiquetaAusenciaConDias) problemas.push(`${q}: ninguna etiqueta de «Ausencias» dice los días de más de 30 min`);
        if (!r.explicacionAusencia) problemas.push(`${q}: falta la línea que explica de dónde sale el monto de la ausencia`);
      }
    }
    if (r.arrastre > 0) problemas.push(`${q}: ${r.arrastre} px de arrastre`);
    if (r.tactiles.length) problemas.push(`${q}: ${r.tactiles.length} blanco(s) táctil(es) bajo 44 px`);
  }
}

console.log(JSON.stringify(resultados, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.error("\n🟢 390 · 834 · 1024 · 1440 — 0 arrastre, 0 blancos bajo 44 px, y las etiquetas nuevas a la vista.");
}
