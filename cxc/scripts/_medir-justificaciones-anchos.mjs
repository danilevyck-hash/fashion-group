// Medición de JUSTIFICACIONES —los motivos nuevos y el permiso de HORAS— en los
// CUATRO anchos: 390 · 834 · 1024 · 1440.
//
// Qué mide en /asistencia?tab=justificaciones, con datos de PRODUCCIÓN:
//   · ARRASTRE · RECORTE · blancos táctiles bajo 44 px · textos bajo 12 px.
//   · Y lo que este PR cambió, leído del DOM real:
//       – los CUATRO motivos que ofrece el desplegable, y que los retirados
//         (Vacaciones, Permiso, Luto, Otro) NO se puedan elegir;
//       – los dos campos de hora, APAGADOS mientras la migración no corra;
//       – el aviso de la migración y la línea que explica qué hace el permiso;
//       – que las 5 justificaciones vivas SIGAN LISTADAS, incluida la de
//         Rodrigo con el nombre viejo del motivo.
//
// 🔴 SOLO LECTURA: no se aprieta «Agregar» ni el botón de borrar.
//
//   BASE=http://localhost:3499 ETAPA=antes|despues node scripts/_medir-justificaciones-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3499";
const ETAPA = process.env.ETAPA ?? "despues";
const OUT = process.env.OUT ?? "/tmp/justificaciones-anchos";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const cuerpo = Buffer.from(JSON.stringify({
  role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local",
})).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(cuerpo).digest("base64url");

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

// 🔑 Se lee del BODY: acá la pregunta es «¿está este texto en la pantalla?», y
// recortar el contenedor es la forma de contestar «no» sobre algo que sí está.
const LEER = new Function(`
  const txt = (document.body.textContent ?? "").replace(/\\s+/g, " ");
  const opciones = [...document.querySelectorAll("option")].map((o) => (o.textContent ?? "").trim());
  const horas = [...document.querySelectorAll('input[type="time"]')];
  return {
    opciones,
    camposHora: horas.length,
    horasApagadas: horas.length > 0 && horas.every((i) => i.disabled),
    avisoMigracion: /Todavía no se pueden cargar permisos de horas/.test(txt),
    explicaDiaEntero: /Sin horas, se justifica el día entero/.test(txt),
    // Las justificaciones vivas de producción, con el nombre VIEJO del motivo.
    filaRodrigo: /Trabajo fuera de la oficina/.test(txt),
    filaEloyn: /Vacaciones/.test(txt),
    incapacidades: (txt.match(/Incapacidad/g) ?? []).length,
    filas: document.querySelectorAll("table tbody tr").length,
  };
`);

const b = await chromium.launch();
const c = await b.newContext();
await c.addCookies([{ name: "cxc_session", value: `${cuerpo}.${sig}`, url: BASE }]);
await c.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});
const p = await c.newPage();
const res = {};
for (const a of ANCHOS) {
  await p.setViewportSize({ width: a.w, height: a.h });
  await p.goto(`${BASE}/asistencia?tab=justificaciones`, { waitUntil: "networkidle", timeout: 180_000 });
  await p.waitForTimeout(2500);
  res[a.nombre] = { ...(await p.evaluate(MEDIR)), ...(await p.evaluate(LEER)) };
  await p.screenshot({ path: `${OUT}/just-${ETAPA}-${a.w}.png`, fullPage: true });
}
await b.close();

const RETIRADOS = ["Vacaciones", "Permiso", "Luto", "Otro"];
const problemas = [];
for (const [ancho, r] of Object.entries(res)) {
  // 🩸 Una pantalla vacía mide 0 en todo y pasaría en verde sin haber mirado nada.
  if (r.filas === 0) problemas.push(`${ancho}: la lista de justificaciones salió vacía`);
  if (!r.filaRodrigo) problemas.push(`${ancho}: se perdió la justificación de Rodrigo (nombre viejo del motivo)`);
  if (!r.filaEloyn) problemas.push(`${ancho}: se perdió la justificación de Eloyn (motivo retirado)`);
  if (r.arrastre > 0) problemas.push(`${ancho}: ${r.arrastre} px de arrastre`);
  if (r.tactiles.length) problemas.push(`${ancho}: ${r.tactiles.length} blanco(s) táctil(es) bajo 44 px`);
  if (ETAPA === "despues") {
    for (const m of ["Incapacidad", "Catástrofe", "Escolares", "Trabajo de vendedor"]) {
      if (!r.opciones.includes(m)) problemas.push(`${ancho}: falta la opción «${m}»`);
    }
    for (const m of RETIRADOS) {
      if (r.opciones.includes(m)) problemas.push(`${ancho}: «${m}» todavía se puede ELEGIR`);
    }
    if (r.camposHora !== 2) problemas.push(`${ancho}: hay ${r.camposHora} campos de hora (tienen que ser 2)`);
    // La migración NO está corrida en producción: los campos van apagados y se
    // dice por qué. Si algún día corre, este chequeo hay que darlo vuelta.
    if (!r.horasApagadas) problemas.push(`${ancho}: los campos de hora NO están apagados sin la migración`);
    if (!r.avisoMigracion) problemas.push(`${ancho}: falta el aviso de la migración de horas`);
    if (!r.explicaDiaEntero) problemas.push(`${ancho}: no se dice qué pasa sin horas`);
  }
}

console.log(JSON.stringify(res, null, 2));
if (problemas.length) { console.error("\n🔴 " + problemas.join("\n🔴 ")); process.exitCode = 1; }
else console.error(`\n🟢 [${ETAPA}] 390 · 834 · 1024 · 1440 — 0 arrastre, 0 blancos bajo 44 px.`);
