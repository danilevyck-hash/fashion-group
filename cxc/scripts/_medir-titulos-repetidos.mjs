// Medición de las 23 pantallas a las que se les quitó el título GRANDE que
// repetía el nombre de la pantalla (barra pegajosa + miga de pan + h1).
//
// Cuatro anchos: 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440.
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado. Por eso 1024
// va en la lista: no es "escritorio", es el mismo iPad girado.
//
// Qué mide en cada pantalla:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · SUBIDA — la Y del primer elemento de contenido dentro de <main>/contenedor.
//     Es el número del pedido de Daniel: cuántos px gana la primera pantalla
//     del iPhone. Se compara contra el MISMO script corrido sobre origin/main.
//   · IDENTIFICACIÓN — que el nombre de la pantalla SIGA visible en la barra
//     pegajosa (celular) y/o en la miga (escritorio). Sin eso la poda deja una
//     pantalla sin nombre, y ese caso NO se poda.
//   · El h1 sr-only: que exista, que sea uno solo y que NO se vea.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie de sesión Y
// `sessionStorage.cxc_role` + `fg_modules` (si no, todo redirige al login), y
// `delete Navigator.prototype.serviceWorker` antes de navegar (bloquear el SW
// de otra forma mata la hidratación).
//
// SOLO LECTURA: no toca la base ni Switch; solo navega y mide.
//
//   npm run build && PORT=3462 npm run start
//   BASE=http://localhost:3462 OUT=/tmp/poda-despues node scripts/_medir-titulos-repetidos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3462";
const OUT = process.env.OUT ?? "/tmp/poda-titulos";
// Capturas: solo de las representativas, y solo a 390 y 1440 (que son los dos
// que Daniel mira). Sacar 23 × 4 sería ruido.
const CAPTURAR = new Set((process.env.CAPTURAR ?? "").split(",").filter(Boolean));
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad-acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

/**
 * Las 23 pantallas. `espera` es un selector que prueba que la pantalla CARGÓ:
 * medir una pantalla vacía da 0 px de arrastre y no prueba nada.
 */
const PANTALLAS = [
  { id: "grupo-ventas", url: "/g/ventas-clientes", nombre: "Ventas y clientes", espera: "main, div.max-w-5xl" },
  { id: "grupo-operacion", url: "/g/operacion", nombre: "Operación", espera: "main, div.max-w-5xl" },
  { id: "grupo-admin", url: "/g/administracion", nombre: "Administración", espera: "main, div.max-w-5xl" },
  { id: "ventas", url: "/ventas", nombre: "Ventas", espera: "main" },
  { id: "vista-general", url: "/vista-general", nombre: "Vista General", espera: "div.max-w-5xl" },
  { id: "referencia", url: "/referencia", nombre: "Referencia", espera: "main" },
  { id: "multifashion", url: "/multifashion", nombre: "Multifashion", espera: "main" },
  { id: "cxc", url: "/admin", nombre: "Cuentas por Cobrar", espera: "main, header" },
  { id: "clientes", url: "/clientes", nombre: "Clientes", espera: "main" },
  { id: "proveedores", url: "/proveedores", nombre: "Proveedores", espera: "main" },
  { id: "data-health", url: "/admin/data-health", nombre: "Data Health", espera: "div.max-w-6xl" },
  { id: "guias", url: "/guias", nombre: "Guías de Despacho", espera: "div.max-w-6xl" },
  { id: "guia-nueva", url: "/guias/nueva", nombre: "Nueva guía", espera: "div.max-w-6xl" },
  { id: "reclamos", url: "/reclamos", nombre: "Reclamos", espera: "div.max-w-6xl" },
  { id: "reclamo-nuevo", url: "/reclamos?view=form", nombre: "Nuevo Reclamo", espera: "div.max-w-6xl" },
  { id: "depurador", url: "/productos/cargar", nombre: "Depurador", espera: "div.max-w-5xl" },
  { id: "facturas-tienda", url: "/productos/cargar?tab=facturas", nombre: "Facturas Tienda", espera: "div.max-w-5xl" },
  { id: "asistencia", url: "/asistencia", nombre: "Asistencia", espera: "div.max-w-6xl" },
  { id: "cheques", url: "/cheques", nombre: "Cheques", espera: "div.max-w-6xl" },
  { id: "caja", url: "/caja", nombre: "Caja Menuda", espera: "div.max-w-6xl" },
  { id: "prestamos", url: "/prestamos", nombre: "Préstamos", espera: "div.max-w-6xl" },
  { id: "marketing", url: "/marketing", nombre: "Marketing", espera: "main, div" },
  { id: "gastos", url: "/gastos-contabilidad", nombre: "Gastos", espera: "main" },
  { id: "saldos-banco", url: "/saldos-banco", nombre: "Saldos de Banco", espera: "main" },
];

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

/**
 * Todo lo que se mide de una pantalla, en UNA pasada dentro del navegador.
 * `nombre` es el nombre esperado de la pantalla (para la identificación).
 */
const MEDIR = (nombre) => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const raiz = document.querySelector("main") ?? document.body;

  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({
        el: `${el.tagName}.${String(el.className).slice(0, 60)}`,
        px: el.scrollWidth - el.clientWidth,
      });
    }
    if (el.matches("button, a[href], input, select, textarea, [role=button]")) {
      if (r.height < 44 - 0.5) {
        tactiles.push({
          el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
          alto: Math.round(r.height * 10) / 10,
          txt: (el.textContent ?? "").trim().slice(0, 28),
        });
      }
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      // El sr-only mide 1px a propósito y no lo lee nadie con los ojos.
      const esSrOnly = r.width <= 2 && r.height <= 2;
      if (fs < 12 && !esSrOnly) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }

  // ── SUBIDA: la Y del primer elemento de contenido VISIBLE ────────────────
  // Se busca el primer nodo con texto o con caja propia dentro del contenedor
  // de la página (saltando el AppHeader, que no cambió). Es el número que
  // Daniel pidió: cuánto sube la primera pantalla.
  const barra = document.querySelector("div.sticky.top-0");
  const yBarra = barra ? barra.getBoundingClientRect().bottom : 0;
  let primerContenido = null;
  const candidatos = raiz.querySelectorAll("h1, h2, p, button, a[href], input, table, svg, span, div");
  for (const el of candidatos) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;           // sr-only y píxeles sueltos fuera
    if (r.top < yBarra - 1) continue;                     // lo que vive DENTRO de la barra
    if (el.closest("div.sticky.top-0")) continue;
    const txt = (el.textContent ?? "").trim();
    if (!txt && el.tagName !== "SVG" && el.tagName !== "INPUT") continue;
    primerContenido = {
      tag: el.tagName,
      clase: String(el.className).slice(0, 60),
      y: Math.round(r.top * 10) / 10,
      desdeLaBarra: Math.round((r.top - yBarra) * 10) / 10,
      txt: txt.replace(/\s+/g, " ").slice(0, 60),
    };
    break;
  }

  // ── IDENTIFICACIÓN: ¿el nombre sigue visible sin el título grande? ───────
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden";
  };
  // El chip de módulo de la barra pegajosa (solo en celular) y la miga (solo
  // en escritorio) viven los dos dentro del mismo `div.sticky.top-0`.
  let enLaBarra = null;
  let enLaMiga = null;
  if (barra) {
    for (const sp of barra.querySelectorAll("span.truncate")) {
      if (visible(sp)) { enLaBarra = (sp.textContent ?? "").trim(); break; }
    }
    const miga = barra.querySelector("div.flex-wrap");
    if (visible(miga)) enLaMiga = (miga.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  // Un breadcrumb PROPIO de la pantalla (Reclamos › Nuevo Reclamo lo tiene, y
  // se ve en todos los anchos: no es el del AppHeader).
  let migaPropia = null;
  const nav = raiz.querySelector("nav");
  if (visible(nav)) migaPropia = (nav.textContent ?? "").replace(/\s+/g, " ").trim();

  // ── El h1: uno solo, y no se ve ──────────────────────────────────────────
  const h1s = [...document.querySelectorAll("h1")].map((h) => {
    const r = h.getBoundingClientRect();
    return {
      txt: (h.textContent ?? "").trim().slice(0, 50),
      clase: String(h.className).slice(0, 40),
      ancho: Math.round(r.width),
      alto: Math.round(r.height),
    };
  });

  const dice = (s) => !!s && s.toLowerCase().includes(nombre.toLowerCase());
  return {
    arrastre,
    innerW: window.innerWidth,
    recortados,
    tactiles,
    textosChicos,
    primerContenido,
    identificacion: {
      enLaBarra,
      enLaMiga,
      migaPropia,
      loDice: dice(enLaBarra) || dice(enLaMiga) || dice(migaPropia),
    },
    h1s,
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "medicion");
    sessionStorage.setItem("fg_modules", JSON.stringify([]));
  } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

const page = await ctx.newPage();
const resultados = {};

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  resultados[a.nombre] = {};

  for (const p of PANTALLAS) {
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForSelector(p.espera, { timeout: 45_000 });
      await page.waitForTimeout(900);
      const m = await page.evaluate(MEDIR, p.nombre);
      resultados[a.nombre][p.id] = m;
      if (CAPTURAR.has(p.id) && (a.w === 390 || a.w === 1440)) {
        await page.screenshot({ path: `${OUT}/${p.id}-${a.w}.png`, fullPage: false });
      }
    } catch (e) {
      resultados[a.nombre][p.id] = { error: String(e).slice(0, 200) };
    }
  }
}

writeFileSync(`${OUT}/medicion.json`, JSON.stringify(resultados, null, 2));

// ── Resumen legible ────────────────────────────────────────────────────────
console.log(`\nBASE=${BASE}  OUT=${OUT}\n`);
for (const a of ANCHOS) {
  let arrastre = 0, recortes = 0, tact = 0, textos = 0, sinNombre = [], h1Malos = [];
  for (const p of PANTALLAS) {
    const m = resultados[a.nombre][p.id];
    if (!m || m.error) { sinNombre.push(`${p.id}(ERROR)`); continue; }
    arrastre = Math.max(arrastre, m.arrastre);
    recortes += m.recortados.length;
    tact += m.tactiles.length;
    textos += m.textosChicos.length;
    if (!m.identificacion.loDice) sinNombre.push(p.id);
    if (m.h1s.length !== 1) h1Malos.push(`${p.id}(${m.h1s.length})`);
  }
  console.log(
    `${a.nombre.padEnd(14)} ${String(a.w).padStart(4)}px  ` +
    `arrastre ${String(arrastre).padStart(3)}  recortados ${String(recortes).padStart(2)}  ` +
    `táctiles<44 ${String(tact).padStart(2)}  textos<12 ${String(textos).padStart(2)}  ` +
    `sin nombre: ${sinNombre.length ? sinNombre.join(",") : "0"}  h1≠1: ${h1Malos.length ? h1Malos.join(",") : "0"}`,
  );
}

console.log("\nY del primer contenido a 390 px (para el antes/después):");
for (const p of PANTALLAS) {
  const m = resultados.iPhone[p.id];
  if (!m || m.error) { console.log(`  ${p.id.padEnd(18)} ERROR`); continue; }
  console.log(
    `  ${p.id.padEnd(18)} y=${String(m.primerContenido?.y ?? "?").padStart(6)}  ` +
    `desdeLaBarra=${String(m.primerContenido?.desdeLaBarra ?? "?").padStart(6)}  ` +
    `«${m.primerContenido?.txt ?? ""}»`,
  );
}

await browser.close();
