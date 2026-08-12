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
  { id: "grupo-ventas", url: "/g/ventas-clientes", nombre: "Ventas y clientes", espera: "div.sticky.top-0" },
  { id: "grupo-operacion", url: "/g/operacion", nombre: "Operación", espera: "div.sticky.top-0" },
  { id: "grupo-admin", url: "/g/administracion", nombre: "Administración", espera: "div.sticky.top-0" },
  { id: "ventas", url: "/ventas", nombre: "Ventas", espera: "div.sticky.top-0" },
  { id: "vista-general", url: "/vista-general", nombre: "Vista General", espera: "div.sticky.top-0" },
  { id: "referencia", url: "/referencia", nombre: "Referencia", espera: "div.sticky.top-0" },
  { id: "multifashion", url: "/multifashion", nombre: "Multifashion", espera: "div.sticky.top-0" },
  { id: "cxc", url: "/admin", nombre: "Cuentas por Cobrar", espera: "div.sticky.top-0" },
  { id: "clientes", url: "/clientes", nombre: "Clientes", espera: "div.sticky.top-0" },
  { id: "proveedores", url: "/proveedores", nombre: "Proveedores", espera: "div.sticky.top-0" },
  { id: "data-health", url: "/admin/data-health", nombre: "Data Health", espera: "div.sticky.top-0" },
  { id: "guias", url: "/guias", nombre: "Guías de Despacho", espera: "div.sticky.top-0" },
  { id: "guia-nueva", url: "/guias/nueva", nombre: "Nueva guía", espera: "div.sticky.top-0" },
  { id: "reclamos", url: "/reclamos", nombre: "Reclamos", espera: "div.sticky.top-0" },
  { id: "reclamo-nuevo", url: "/reclamos?view=form", nombre: "Nuevo Reclamo", espera: "nav" },
  { id: "depurador", url: "/productos/cargar", nombre: "Depurador", espera: "div.sticky.top-0" },
  { id: "facturas-tienda", url: "/productos/cargar?tab=facturas", nombre: "Facturas Tienda", espera: "div.sticky.top-0" },
  { id: "asistencia", url: "/asistencia", nombre: "Asistencia", espera: "div.sticky.top-0" },
  { id: "cheques", url: "/cheques", nombre: "Cheques", espera: "div.sticky.top-0" },
  { id: "caja", url: "/caja", nombre: "Caja Menuda", espera: "div.sticky.top-0" },
  { id: "prestamos", url: "/prestamos", nombre: "Préstamos", espera: "div.sticky.top-0" },
  { id: "marketing", url: "/marketing", nombre: "Marketing", espera: "div.sticky.top-0" },
  { id: "gastos", url: "/gastos-contabilidad", nombre: "Gastos", espera: "div.sticky.top-0" },
  { id: "saldos-banco", url: "/saldos-banco", nombre: "Saldos de Banco", espera: "div.sticky.top-0" },
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

  // 🩸 El `sr-only` es, por definición, una caja de 1×1 con `overflow:hidden`
  // y el texto adentro — o sea, el detector de RECORTES lo cuenta como recorte
  // en TODAS las pantallas. Es un falso positivo del medidor, no un defecto de
  // la página: un lector de pantalla lee el nodo entero, no su caja. Se
  // reconoce por la firma del utilitario (clip + 1×1), no por la clase, para
  // que también atrape al `sr-only` que venga de otro lado.
  const esSrOnly = (el, r, cs) =>
    (r.width <= 2 && r.height <= 2) ||
    cs.clip === "rect(0px, 0px, 0px, 0px)" ||
    String(el.className).split(/\s+/).includes("sr-only");

  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (esSrOnly(el, r, cs)) continue;
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
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }

  // ── SUBIDA: dónde empieza lo que se VE ───────────────────────────────────
  // 🩸 Acá se midió mal la primera vez: tomar "el primer elemento en orden del
  // DOM" devuelve el <div> contenedor, que arranca en el mismo Y con título y
  // sin título — daba 0 px de ganancia en las 23. Lo que hay que medir es el
  // primer PÍXEL PINTADO: el `top` más chico entre las hojas visibles (las que
  // pintan texto o son un control), salteando la barra pegajosa —que no
  // cambió— y el sr-only.
  const barra = document.querySelector("div.sticky.top-0");
  const yBarra = barra ? barra.getBoundingClientRect().bottom : 0;
  let primerContenido = null;
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (esSrOnly(el, r, cs)) continue;
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (r.top < yBarra - 1) continue;
    if (el.closest("div.sticky.top-0")) continue;
    // Solo hojas: un contenedor "empieza" donde empieza su primer hijo, así
    // que medirlo no dice nada sobre lo que el ojo ve.
    const pintaTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const esControl = el.matches("input, select, textarea, svg, img");
    if (!pintaTexto && !esControl) continue;
    if (!primerContenido || r.top < primerContenido.y) {
      primerContenido = {
        tag: el.tagName,
        clase: String(el.className).slice(0, 60),
        y: Math.round(r.top * 10) / 10,
        desdeLaBarra: Math.round((r.top - yBarra) * 10) / 10,
        txt: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 45),
      };
    }
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
  for (const nav of raiz.querySelectorAll("nav")) {
    if (visible(nav)) { migaPropia = (nav.textContent ?? "").replace(/\s+/g, " ").trim(); break; }
  }
  // Y la PESTAÑA activa: en el Depurador el nombre de la pantalla no lo dice
  // ni la barra ni la miga (las dos dicen el módulo), lo dice el selector de
  // pestañas — que se ve en los cuatro anchos. Cuenta como identificación.
  let enPestana = null;
  const dicen = (s) => !!s && s.toLowerCase().includes(nombre.toLowerCase());
  for (const el of raiz.querySelectorAll("button, [role=tab], a[href]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > 260) continue; // solo la zona de arriba, donde uno se ubica
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (dicen(t)) { enPestana = t; break; }
  }

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
      enPestana,
      // 🔴 La regla del pedido: si la pantalla no dice su nombre en la barra,
      // ni en la miga, ni en su propio breadcrumb/pestaña, su título NO se
      // podía quitar. Esto lo verifica ancho por ancho.
      loDice: dicen(enLaBarra) || dicen(enLaMiga) || dicen(migaPropia) || dicen(enPestana),
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
    // `networkidle` se cuelga en las pantallas que dejan un fetch largo (o un
    // poll) abierto: la primera corrida perdió media docena de mediciones por
    // eso. Se navega con `domcontentloaded` —que siempre llega— y la prueba de
    // que la pantalla CARGÓ la da el selector, no la red. Un reintento cubre
    // el timeout suelto por contención de los dos servidores a la vez.
    let m = null;
    for (let intento = 1; intento <= 2 && !m; intento++) {
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector(p.espera, { timeout: 60_000 });
        // El contenido llega por fetch después de hidratar: se espera a que la
        // altura del documento se quede quieta dos veces seguidas.
        let previa = -1;
        for (let i = 0; i < 25; i++) {
          await page.waitForTimeout(400);
          const h = await page.evaluate(() => document.documentElement.scrollHeight);
          if (h === previa && i > 2) break;
          previa = h;
        }
        m = await page.evaluate(MEDIR, p.nombre);
      } catch (e) {
        if (intento === 2) m = { error: String(e).slice(0, 200) };
      }
    }
    resultados[a.nombre][p.id] = m;
    if (CAPTURAR.has(p.id) && (a.w === 390 || a.w === 1440) && !m?.error) {
      await page.screenshot({ path: `${OUT}/${p.id}-${a.w}.png`, fullPage: false });
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
