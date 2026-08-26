// Medición del SALDO DE VACACIONES en los tres anchos: 390 · 834 · 1440 (más
// 1024, el iPad acostado, que es donde este repo ya se quemó dos veces).
//
// Qué mide, en `/asistencia?tab=vacaciones`:
//   1. la sección «Saldo por persona» existe y trae UNA fila por persona activa;
//   2. 🔴 quien NO tiene fecha de ingreso APARECE, dice «Falta la fecha de
//      ingreso» y su renglón NO tiene ningún número;
//   3. la línea que cuenta cuántas se quedaron sin saldo, con el DÓNDE;
//   4. al elegir una persona en el formulario, su saldo se dice ahí mismo;
//   5. y en Configuración, que la fecha de ingreso SE PUEDA EDITAR (es lo que
//      Daniel decidió que haga contabilidad).
//
// Y en los cuatro anchos: ARRASTRE de página · RECORTES · blancos táctiles
// <44 px · textos <12 px.
//
// 🔴 SOLO LECTURA: el navegador ABORTA cualquier pedido que no sea GET. Medir
// no puede depender de que nadie toque un botón por accidente.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo), y los
// rótulos llevan `uppercase` POR CSS — `innerText` los devuelve en MAYÚSCULAS.
//
//   npm run build && npx next start -p 3471
//   BASE=http://localhost:3471 node scripts/_medir-vacaciones-saldo.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3471";
const OUT = process.env.OUT ?? "/tmp/asistencia-saldo";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  // 🩸 La cookie se FIRMA acá, no se toma de un archivo compartido: `/tmp` lo
  // usan varios scripts a la vez y una cookie de otra corrida deja la medición
  // en la pantalla de login — con TODO en cero y en verde si nadie lo mira.
  const propia = process.env.COOKIE_FILE;
  if (propia && existsSync(propia)) return readFileSync(propia, "utf8").trim();
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
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
    // El `h1.sr-only` de la página mide 1 px a propósito y siempre "recorta":
    // contarlo es ruido PRE-EXISTENTE, no un defecto de esta pantalla.
    if (!el.classList.contains("sr-only")
        && (ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
    }
    // 🔑 Un checkbox de 16 px DENTRO de una etiqueta de 44 cumple la regla: lo
    // que se toca es la etiqueta entera.
    if (el.matches("button, a[href], select, textarea, [role=button], input:not([type=checkbox]):not([type=radio])")
        && r.height < 43.5) {
      tactiles.push({
        el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
        alto: Math.round(r.height * 10) / 10,
        txt: (el.textContent ?? "").trim().slice(0, 28),
      });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM de la pestaña Vacaciones. */
const LEER_SALDO = () => {
  // 🔑 `textContent` y no `innerText`: los rótulos llevan `uppercase` por CSS y
  // un `sr-only` está clipeado — `innerText` devuelve mayúsculas o vacío, y
  // compararlos tal cual da SIEMPRE `false`, o sea verde (o rojo) sin haber
  // mirado nada.
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  const filas = [...document.querySelectorAll("li[data-saldo-codigo]")].map((li) => ({
    codigo: li.getAttribute("data-saldo-codigo"),
    texto: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
    // 🩸 El VALOR, aparte del nombre: los códigos sin ficha se llaman «50», o
    // sea que el nombre de esa persona ES un número. Mirar el renglón entero
    // acusaba de «saldo inventado» a un renglón perfectamente honesto.
    valor: (li.querySelector("[data-saldo-valor]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));
  const sinFecha = filas.filter((f) => f.valor.includes("Falta la fecha de ingreso"));
  return {
    haySeccion: txt.includes("Saldo por persona"),
    diceLaRegla: txt.includes("30 días por cada 11 meses trabajados"),
    diceDesdeCuando: txt.includes("El saldo resta solo las vacaciones cargadas acá"),
    avisoSinFecha: /(\d+) personas no tienen saldo/.exec(txt)?.[0] ?? null,
    avisoDiceDonde: txt.includes("Se carga en Configuración"),
    filas: filas.length,
    conNumero: filas.filter((f) => /\d+ de \d+/.test(f.valor)).length,
    sinFecha: sinFecha.length,
    // 🔴 El renglón de quien no tiene fecha NO puede traer un número: un «0 de
    // 0» se leería como «no le queda ni un día».
    sinFechaConNumero: sinFecha.filter((f) => /\d/.test(f.valor)).length,
    // El caso real cargado: ELOYN MENDOZA, 100 ganados − 29 tomados = 71.
    eloyn: filas.find((f) => f.codigo === "29")?.texto ?? null,
    // La más antigua: ANGELA GARCIA, ingreso 16-feb-2019 → 245 ganados.
    angela: filas.find((f) => f.codigo === "7")?.texto ?? null,
    // ⛔ Lo que NO puede aparecer nunca.
    diceSaldoCero: /Falta la fecha de ingreso[^]{0,20}0 de 0/.test(txt),
  };
};

/** El saldo dicho en el formulario, al elegir la persona. */
const LEER_ELEGIDO = () => {
  const select = document.querySelector("select");
  const p = select?.parentElement?.querySelector("p");
  return (p?.textContent ?? "").replace(/\s+/g, " ").trim();
};

/** Configuración: ¿se puede EDITAR la fecha de ingreso? */
const LEER_CONFIG = () => {
  const fechas = [...document.querySelectorAll('input[type="date"]')];
  return {
    diceEmpezoATrabajar: (document.body.textContent ?? "").includes("Empezó a trabajar"),
    camposFecha: fechas.length,
    editables: fechas.filter((i) => !i.disabled && !i.readOnly).length,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// 🔴 NADA QUE NO SEA GET SALE DE ACÁ. No se escribe una fila.
let escriturasBloqueadas = 0;
await ctx.route("**/*", async (route) => {
  if (route.request().method() !== "GET") { escriturasBloqueadas += 1; return route.abort(); }
  return route.fallback();
});

const hallazgos = [];
const acusar = (m) => { hallazgos.push(m); console.log(`  🔴 ${m}`); };

for (const a of ANCHOS) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: a.w, height: a.h });

  // ── La pestaña Vacaciones ──────────────────────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=vacaciones`, { waitUntil: "networkidle" });
  await page.waitForSelector("li[data-saldo-codigo]", { timeout: 30_000 }).catch(() => {});
  const m = await page.evaluate(MEDIR);
  const s = await page.evaluate(LEER_SALDO);
  await page.screenshot({ path: `${OUT}/saldo-${a.w}.png`, fullPage: true });

  console.log(`\n── ${a.nombre} (${a.w}px, útil ${m.innerW}) ──`);
  console.log(`   arrastre ${m.arrastre}px · recortados ${m.recortados.length} · táctiles<44 ${m.tactiles.length} · textos<12 ${m.textosChicos.length}`);
  console.log(`   saldos: ${s.filas} filas · ${s.conNumero} con número · ${s.sinFecha} sin fecha`);
  console.log(`   ELOYN  → ${s.eloyn}`);
  console.log(`   ANGELA → ${s.angela}`);
  console.log(`   aviso  → ${s.avisoSinFecha}`);

  if (m.arrastre > 0) acusar(`${a.nombre}: la página arrastra ${m.arrastre}px`);
  for (const r of m.recortados) acusar(`${a.nombre}: recortado ${r.px}px — ${r.el}`);
  for (const t of m.tactiles) acusar(`${a.nombre}: táctil de ${t.alto}px — ${t.el} "${t.txt}"`);
  for (const t of m.textosChicos) acusar(`${a.nombre}: texto de ${t.fs}px — "${t.txt}"`);

  // 🩸 El script FALLA si mide cero sin haber mirado nada.
  if (!s.haySeccion) acusar(`${a.nombre}: no aparece «Saldo por persona»`);
  if (!s.diceLaRegla) acusar(`${a.nombre}: no dice la regla de los 30 días`);
  if (!s.diceDesdeCuando) acusar(`${a.nombre}: no dice desde cuándo cuenta la resta`);
  if (s.filas < 10) acusar(`${a.nombre}: solo ${s.filas} filas de saldo (¿cargó?)`);
  if (s.sinFecha === 0) acusar(`${a.nombre}: nadie aparece con «Falta la fecha de ingreso»`);
  if (s.sinFechaConNumero > 0) acusar(`${a.nombre}: ${s.sinFechaConNumero} renglones SIN fecha traen un número`);
  if (s.diceSaldoCero) acusar(`${a.nombre}: se está pintando un «0 de 0» donde falta la fecha`);
  if (!s.avisoSinFecha) acusar(`${a.nombre}: falta la línea de cuántas personas no tienen saldo`);
  if (!s.avisoDiceDonde) acusar(`${a.nombre}: el aviso no dice DÓNDE se carga la fecha`);
  if (!/71 de 100/.test(s.eloyn ?? "")) acusar(`${a.nombre}: ELOYN no dice «71 de 100» → ${s.eloyn}`);
  if (!/245 de 245/.test(s.angela ?? "")) acusar(`${a.nombre}: ANGELA no dice «245 de 245» → ${s.angela}`);

  // Elegir una persona en el formulario dice su saldo ahí mismo.
  await page.selectOption("select", "29").catch(() => {});
  const elegido = await page.evaluate(LEER_ELEGIDO);
  console.log(`   elegido(29) → ${elegido}`);
  if (!/Le quedan 71 de 100/.test(elegido)) acusar(`${a.nombre}: al elegir a ELOYN no dice su saldo → "${elegido}"`);
  await page.selectOption("select", "22").catch(() => {});
  const elegido2 = await page.evaluate(LEER_ELEGIDO);
  if (!/Falta la fecha de ingreso/.test(elegido2)) acusar(`${a.nombre}: al elegir a quien no tiene fecha no lo dice → "${elegido2}"`);
  if (/\d/.test(elegido2)) acusar(`${a.nombre}: el aviso de falta de fecha trae un número → "${elegido2}"`);

  // ── Configuración: la fecha de ingreso se puede EDITAR ─────────────────
  await page.goto(`${BASE}/asistencia?tab=configuracion`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Abrir la primera ficha para que se dibujen sus campos.
  await page.getByText("Empezó a trabajar").first().waitFor({ timeout: 3000 }).catch(async () => {
    const b = page.locator("button").filter({ hasText: /ANGELA|ALEJANDRA|ANDRE/ }).first();
    await b.click({ timeout: 3000 }).catch(() => {});
  });
  const c = await page.evaluate(LEER_CONFIG);
  console.log(`   configuración: «Empezó a trabajar» ${c.diceEmpezoATrabajar ? "SÍ" : "NO"} · ${c.camposFecha} campos de fecha, ${c.editables} editables`);
  if (a.w === 1440) {
    if (!c.diceEmpezoATrabajar) acusar(`Configuración: no se encontró el campo «Empezó a trabajar»`);
    if (c.editables === 0) acusar(`Configuración: la fecha de ingreso NO se puede editar`);
  }

  await page.close();
}

await browser.close();
console.log(`\nEscrituras bloqueadas: ${escriturasBloqueadas}`);
console.log(hallazgos.length === 0 ? "\n🟢 SIN HALLAZGOS" : `\n🔴 ${hallazgos.length} hallazgos`);
process.exit(hallazgos.length === 0 ? 0 : 1);
