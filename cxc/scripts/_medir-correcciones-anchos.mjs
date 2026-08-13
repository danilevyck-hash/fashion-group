// Medición de la CORRECCIÓN DE MARCACIONES en los tres anchos: 390 · 834 · 1440
// (más 1024, el iPad acostado, que es donde este repo ya se quemó dos veces).
//
// Qué mide, en /asistencia?tab=reporte:
//   1. El reporte con el aviso de «N horas corregidas a mano» arriba.
//   2. El detalle abierto, con la línea «Reloj 08:47:12 → 08:00 — motivo — quién».
//   3. La ventana de CORREGIR (formulario: hora + razón obligatoria).
//   4. La ventana de DESHACER (la que aparece si esa hora ya tiene corrección).
//   5. La ventana de AGREGAR una marcación que el reloj nunca registró.
//
// Y en las cinco: ARRASTRE de página · RECORTES · blancos táctiles <44 px ·
// textos <12 px.
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 LA TABLA `asistencia_correcciones` TODAVÍA NO EXISTE EN PRODUCCIÓN (la DDL
// la corre Daniel a mano), así que sin ayuda la pantalla —correctamente— NO
// ofrece corregir y no habría nada que medir. Se INTERCEPTA la respuesta de
// `/api/asistencia/reporte` y se le inyecta UNA corrección con la forma exacta
// que va a tener: los datos siguen siendo los de producción y el componente que
// se mide es el REAL. No se toca la base ni se aprieta ningún botón que guarde.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), y esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo).
//
//   npm run build && npx next start -p 3467
//   BASE=http://localhost:3467 node scripts/_medir-correcciones-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3467";
const OUT = process.env.OUT ?? "/tmp/asistencia-correcciones";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

const MOTIVO = "se le dañó el carro, avisó";
const RELOJ = "08:47:12";

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
  // 🩸 Esta app NO tiene <main>, y el primer `div[class*="transition-"]` es un
  // overlay VACÍO del menú: mediría 0 en todo y pasaría en verde sin mirar nada.
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  // Con la ventana abierta hay que mirar TAMBIÉN el portal, que vive fuera de
  // la raíz (createPortal a <body>). Sin esto la ventana no se mediría.
  const zonas = [raiz, ...document.querySelectorAll("body > div.fixed.inset-0")];
  for (const zona of zonas) {
    for (const el of zona.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
      if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
        recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
      }
      if (el.matches("button, a[href], input, select, textarea, [role=button]") && r.height < 43.5) {
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
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM. */
const LEER = () => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    avisaArriba: /hora corregida a mano|horas corregidas a mano/.test(txt),
    chipEnLaPersona: /día corregido|días corregidos/.test(txt),
    lineaDeCorreccion: /Reloj\s*08:47:12\s*→/.test(txt),
    diceElMotivo: txt.includes("se le dañó el carro, avisó"),
    diceQuien: /—?\s*Daniel\b/.test(txt),
    ventanaAbierta: !!document.querySelector("body > div.fixed.inset-0"),
    ventanaDiceReloj: /Lo que marcó el reloj/.test(txt),
    ventanaDiceNoSeBorra: /Esto no se borra nunca/.test(txt),
    ventanaPideRazon: /Por qué se corrige/.test(txt),
    ventanaDiceQueFalta: /Falta:/.test(txt),
    botonGuardarApagado: [...document.querySelectorAll("button")]
      .some((b) => /Guardar corrección|Agregar marcación/.test(b.textContent ?? "") && b.disabled),
    botonDeshacer: [...document.querySelectorAll("button")]
      .some((b) => /Deshacer la corrección/.test(b.textContent ?? "")),
    filasPersona: document.querySelectorAll("table")[0]?.querySelectorAll("tbody > tr").length ?? 0,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// ── La inyección. Datos de producción; UNA corrección con la forma real. ────
await ctx.route("**/api/asistencia/reporte*", async (route) => {
  const res = await route.fetch();
  const d = await res.json().catch(() => null);
  if (!d?.personas?.length) return route.fulfill({ response: res });

  d.correccionesDisponible = true;
  d.avisoCorrecciones = null;

  // La primera persona con un día de 4 marcas: se corrige su primera hora.
  let puesta = false;
  for (const p of d.personas) {
    if (puesta) break;
    for (const dia of p.dias) {
      if (dia.marcas.length < 4) continue;
      dia.correcciones = [{
        id: "simulada",
        hora: dia.marcas[0],
        relojHora: "08:47:12",
        agregada: false,
        motivo: "se le dañó el carro, avisó",
        creadaPor: "Daniel",
        creadaEn: "2026-08-13T18:00:00.000Z",
      }];
      p.resumen.diasCorregidos = 1;
      p.resumen.correcciones = 1;
      d.__personaCorregida = p.codigo;
      puesta = true;
      break;
    }
  }
  d.correcciones = { correcciones: puesta ? 1 : 0, dias: puesta ? 1 : 0, agregadas: 0 };
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
});

const page = await ctx.newPage();
const resultados = {};
const problemas = [];

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};

  await page.goto(`${BASE}/asistencia?tab=reporte`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(3500);

  // 1 ── El reporte cerrado, con el aviso arriba.
  paso.reporteCerrado = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/reporte-cerrado-${a.w}.png`, fullPage: true });

  // 2 ── Abrir a la persona corregida (la del chip azul) y ver la línea.
  // ⚠️ Las filas se toman de la tabla PRINCIPAL: al abrir a alguien se inserta
  // una tabla ANIDADA, y contar `tbody tr` a secas mezcla sus filas con las de
  // las personas — el índice deja de significar «la persona i».
  const filas = page.locator("table").first().locator("tbody > tr");
  const conChip = filas.filter({ hasText: /día corregido|días corregidos/ }).first();
  await conChip.click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  paso.detalleAbierto = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/detalle-${a.w}.png`, fullPage: true });

  // 3 ── DESHACER: la hora corregida (azul) abre la ventana de deshacer.
  const horaCorregida = page.locator('button[title="Corregir esta hora"].text-blue-700').first();
  await horaCorregida.click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.ventanaDeshacer = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/ventana-deshacer-${a.w}.png`, fullPage: false });
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("body > div.fixed.inset-0").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(600);

  // 4 ── CORREGIR: una hora SIN corrección abre el formulario.
  const horaSinCorregir = page.locator('button[title="Corregir esta hora"]:not(.text-blue-700)').first();
  await horaSinCorregir.click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.ventanaCorregir = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/ventana-corregir-${a.w}.png`, fullPage: false });
  // El motivo vacío tiene que dejar el botón APAGADO y decir qué falta.
  paso.ventanaCorregir.botonApagadoSinRazon = paso.ventanaCorregir.botonGuardarApagado;
  await page.locator("body > div.fixed.inset-0").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(600);

  // 5 ── AGREGAR una marcación que el reloj nunca registró.
  await page.getByRole("button", { name: /Agregar hora|Agregar marcación/ }).first()
    .click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.ventanaAgregar = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/ventana-agregar-${a.w}.png`, fullPage: false });
  await page.locator("body > div.fixed.inset-0").first().click({ position: { x: 5, y: 5 } }).catch(() => {});

  resultados[a.nombre] = paso;

  // 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN MIRAR NADA.
  const P = (m) => problemas.push(`${a.nombre} (${a.w}): ${m}`);
  if (!paso.reporteCerrado.filasPersona) P("el reporte salió vacío");
  if (!paso.reporteCerrado.avisaArriba) P("NO avisa arriba que hay horas corregidas");
  if (!paso.reporteCerrado.chipEnLaPersona) P("la persona corregida no lleva chip (no se ve sin abrir)");
  if (!paso.detalleAbierto.lineaDeCorreccion) P("el detalle no muestra la hora del RELOJ tachada");
  if (!paso.detalleAbierto.diceElMotivo) P("el detalle no dice el motivo");
  if (!paso.detalleAbierto.diceQuien) P("el detalle no dice quién corrigió");
  if (!paso.ventanaDeshacer.ventanaAbierta) P("la ventana de deshacer no abrió");
  if (!paso.ventanaDeshacer.botonDeshacer) P("no hay botón de deshacer");
  if (!paso.ventanaDeshacer.ventanaDiceNoSeBorra) P("la ventana no dice que la marcación no se borra");
  if (!paso.ventanaCorregir.ventanaAbierta) P("la ventana de corregir no abrió");
  if (!paso.ventanaCorregir.ventanaPideRazon) P("la ventana no pide la razón");
  if (!paso.ventanaCorregir.botonApagadoSinRazon) P("🔴 el botón de guardar NO está apagado sin razón");
  if (!paso.ventanaCorregir.ventanaDiceQueFalta) P("el botón apagado no dice qué falta");
  if (!paso.ventanaAgregar.ventanaAbierta) P("la ventana de agregar no abrió");
}

await browser.close();

// Resumen corto, que es lo que se lee.
console.log("═".repeat(78));
console.log("CORRECCIÓN DE MARCACIONES — arrastre · recortes · táctiles <44 · texto <12");
console.log("═".repeat(78));
for (const [ancho, p] of Object.entries(resultados)) {
  console.log(`\n${ancho}`);
  for (const [pantalla, m] of Object.entries(p)) {
    console.log(
      `  ${pantalla.padEnd(18)} útil ${String(m.innerW).padStart(4)} · ` +
      `arrastre ${String(m.arrastre).padStart(3)} · recortes ${String(m.recortados.length).padStart(2)} · ` +
      `táctil<44 ${String(m.tactiles.length).padStart(2)} · texto<12 ${String(m.textosChicos.length).padStart(2)}`,
    );
    for (const r of m.recortados) console.log(`      recorte: ${r.px}px ${r.el}`);
    for (const t of m.tactiles) console.log(`      táctil: ${t.alto}px «${t.txt}»`);
    for (const t of m.textosChicos.slice(0, 4)) console.log(`      texto: ${t.fs}px «${t.txt}»`);
  }
}
console.log("\n" + "═".repeat(78));
if (problemas.length) {
  console.error("🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.log("🟢 sin problemas de contenido en los cuatro anchos");
}
