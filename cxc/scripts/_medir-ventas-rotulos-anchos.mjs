// ─────────────────────────────────────────────────────────────────────────────
// LOS 4 ANCHOS de las pantallas que este cambio toca — 390 · 834 · 1024 · 1440.
//
// iPhone · iPad parado · iPad ACOSTADO · escritorio. El del medio es el que
// nadie mira y el que más rompe: la barra lateral se lleva 224 px, así que un
// iPad de 834 deja ~610 útiles — más angosto que un iPhone acostado.
//
// Se mide contra el build de PRODUCCIÓN y con datos de producción. Solo lectura:
// se aborta en el navegador cualquier pedido que no sea GET, así que ningún
// botón puede escribir aunque se lo toque.
//
// 🔴 EL SCRIPT FALLA si no encuentra los textos nuevos: medir cero y dar verde
// sin haber mirado nada es el peor resultado posible.
//
//   BASE=http://localhost:3236 [ETAPA=antes|despues] node scripts/_medir-ventas-rotulos-anchos.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3236";
const SALIDA = process.env.SALIDA ?? "/tmp/t236-anchos";
const ETAPA = process.env.ETAPA ?? "despues";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const PANTALLAS = [
  { id: "resumen",   titulo: "Ventas › Resumen",   url: "/ventas",              ancla: "table, [data-celda]" },
  { id: "clientes",  titulo: "Ventas › Clientes",  url: "/ventas?tab=clientes", ancla: "table, [data-comparativo-clientes]" },
  { id: "productos", titulo: "Ventas › Productos", url: "/ventas?tab=productos", ancla: "[data-fila-producto]" },
  { id: "utilidad",  titulo: "Ventas › Utilidad",  url: "/ventas?tab=utilidad", ancla: "table tbody tr" },
  { id: "cxc",       titulo: "Cuentas por Cobrar", url: "/admin",               ancla: "table tbody tr, [data-cliente-fila]" },
];

const MEDIR = () => {
  // 🩸 Esta app NO tiene <main> en todas sus pantallas, y el primer
  // `div[class*="transition-"]` es un overlay VACÍO del menú: mediría 0 en todo
  // y pasaría en verde sin haber mirado nada. Se elige el contenedor con más
  // texto, que es el contenido de verdad.
  const raiz = document.querySelector("main")
    ?? [...document.querySelectorAll('div[class*="transition-"]')]
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
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 55)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, textarea, [role=button]") && r.height < 43.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 26) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 26) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este cambio puso en pantalla, leído del DOM (no del archivo). */
const LEER = () => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    // Lo que TIENE que estar.
    periodoKpis: document.querySelectorAll("[data-periodo-kpis]").length,
    comparativoClientes: document.querySelectorAll("[data-comparativo-clientes]").length,
    diceMismoPeriodo: /mismo período de \d{4}/.test(txt),
    tramoCompleto: /Por vencer\s*0-90d|Por vencer/.test(txt) && /0-90d/.test(txt),
    filas: document.querySelectorAll("table tbody tr, [data-fila-producto]").length,
    // Lo que NO puede volver.
    diceYTD: /\bYTD\b/.test(txt),
    diceHuerfanos: /huérfano|sin master/i.test(txt),
    diceCxcActual: /CXC actual/.test(txt),
    diceVerEnCxc: /Ver en CXC/.test(txt),
    diceDeltaVs2025: /Δ vs 2025/.test(txt),
    diceApostrofo: /vs '\d\d/.test(txt),
    diceClickParaVer: /click para ver detalle/.test(txt),
  };
};

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const out = {};
let fallas = [];

for (const ancho of ANCHOS) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "Daniel Levy");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify([
      "vista-general", "ventas", "cxc", "multifashion", "directorio", "proveedores",
      "catalogos", "guias", "packing-lists", "reclamos", "cargar", "comisiones",
      "marketing", "caja", "gastos-contabilidad", "saldos-banco", "prestamos",
      "cheques", "asistencia", "referencia", "usuarios", "data-health",
    ]));
  });
  // 🔴 SOLO LECTURA.
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    return (m === "GET" || m === "HEAD") ? route.continue() : route.abort();
  });

  for (const p of PANTALLAS) {
    const page = await ctx.newPage();
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    try { await page.waitForSelector(p.ancla, { timeout: 45000 }); } catch {}
    try { await page.waitForLoadState("networkidle", { timeout: 30000 }); } catch {}
    await page.waitForTimeout(1800);
    const m = await page.evaluate(MEDIR);
    const l = await page.evaluate(LEER);
    await page.close();
    const clave = `${p.id}@${ancho}`;
    out[clave] = { ...m, ...l, titulo: p.titulo, ancho };
    console.log(
      `${String(ancho).padStart(4)} ${p.titulo.padEnd(22)} arrastre ${String(m.arrastre).padStart(4)} · ` +
      `recorte ${String(m.recortados.length).padStart(2)} · táctil<44 ${String(m.tactiles.length).padStart(2)} · ` +
      `texto<12 ${String(m.textosChicos.length).padStart(2)} · filas ${l.filas}`,
    );
    if (m.arrastre > 0) fallas.push(`${clave}: ${m.arrastre} px de arrastre de página`);
    if (l.filas === 0) fallas.push(`${clave}: pantalla VACÍA — la medición no prueba nada`);
    // Lo que no puede volver, en NINGÚN ancho.
    for (const [k, msg] of [
      ["diceYTD", "«YTD» volvió a la pantalla"],
      ["diceHuerfanos", "«huérfanos / sin master» volvió"],
      ["diceCxcActual", "«CXC actual» volvió"],
      ["diceVerEnCxc", "«Ver en CXC» volvió"],
      ["diceDeltaVs2025", "«Δ vs 2025» volvió"],
      ["diceApostrofo", "el año con apóstrofo volvió"],
      ["diceClickParaVer", "«click para ver detalle» volvió"],
    ]) if (l[k]) fallas.push(`${clave}: ${msg}`);
  }
  await ctx.close();
}
await navegador.close();

// Lo NUEVO tiene que estar donde corresponde, en los 4 anchos.
for (const ancho of ANCHOS) {
  if (!out[`resumen@${ancho}`]?.periodoKpis && ancho < 1440) {
    // La línea del período es de la vista de CELULAR (min-[1440px]:hidden).
    fallas.push(`resumen@${ancho}: falta la línea del período arriba de los KPIs`);
  }
  if (!out[`clientes@${ancho}`]?.diceMismoPeriodo) {
    fallas.push(`clientes@${ancho}: la pantalla no dice contra qué período compara`);
  }
  if (!out[`cxc@${ancho}`]?.tramoCompleto) {
    fallas.push(`cxc@${ancho}: los tramos no dicen nombre + rango`);
  }
}

const archivo = path.join(SALIDA, `${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(out, null, 1));
console.log(`\nGuardado en ${archivo}`);

// Comparación contra origin/main: lo que importa es que no haya arrastre,
// recorte ni táctil NUEVO — los pre-existentes son de código que no se tocó.
const otro = path.join(SALIDA, `${ETAPA === "antes" ? "despues" : "antes"}.json`);
if (existsSync(otro)) {
  const a = JSON.parse(readFileSync(ETAPA === "antes" ? archivo : otro, "utf8"));
  const d = JSON.parse(readFileSync(ETAPA === "antes" ? otro : archivo, "utf8"));
  console.log("\n=== CONTRA origin/main · nada NUEVO puede aparecer ===");
  for (const k of Object.keys(a)) {
    const A = a[k], D = d[k];
    if (!D) continue;
    const dif = {
      arrastre: D.arrastre - A.arrastre,
      recorte: D.recortados.length - A.recortados.length,
      tactil: D.tactiles.length - A.tactiles.length,
      texto: D.textosChicos.length - A.textosChicos.length,
    };
    const nuevo = Object.entries(dif).filter(([, v]) => v > 0);
    console.log(
      `${k.padEnd(24)} arrastre ${A.arrastre}→${D.arrastre} · recorte ${A.recortados.length}→${D.recortados.length} · ` +
      `táctil ${A.tactiles.length}→${D.tactiles.length} · texto<12 ${A.textosChicos.length}→${D.textosChicos.length}` +
      (nuevo.length ? `  ❌ NUEVO: ${nuevo.map(([n, v]) => `${n} +${v}`).join(", ")}` : "  ✅"),
    );
    for (const [n, v] of nuevo) fallas.push(`${k}: ${v} ${n} NUEVO(s) contra origin/main`);
  }
}

console.log("");
if (fallas.length) {
  console.log("🔴 FALLAS:");
  for (const f of fallas) console.log("   · " + f);
  process.exit(1);
}
console.log("🟢 390 · 834 · 1024 · 1440 → 0 px de arrastre y nada nuevo contra origin/main.");
