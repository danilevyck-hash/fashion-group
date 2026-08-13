// NINGÚN NÚMERO DE NEGOCIO PUEDE CAMBIAR.
//
// Este cambio toca CÓMO se cargan los datos (de dónde salen, cuántas veces se
// piden), nunca QUÉ dicen. Eso hay que probarlo mirando la pantalla, no
// razonándolo: se capturan TODAS las cifras visibles de cada pantalla contra el
// build de producción y con datos de producción, antes y después, y se comparan
// una por una.
//
// ⚠️ SE COMPARA POSICIÓN POR POSICIÓN, no como conjunto. Un conjunto ordenado
// diría "los mismos números" aunque dos filas se hubieran intercambiado, que es
// exactamente el error que más daño hace en Comisiones (la comisión del
// vendedor A en la fila del vendedor B).
//
// ⚠️ LO QUE CAMBIA SOLO NO SE CUENTA COMO DIFERENCIA. Hay dos clases de texto
// que se mueven entre dos corridas sin que nadie haya roto nada: las horas
// ("Sincronizado hace 3 minutos") y la venta del día, que sube si la tienda
// factura mientras se mide. Se anotan aparte en vez de contaminar el veredicto.
//
// Solo lectura: se navega y se mira. No se toca ningún botón que ejecute nada.
//
//   BASE=http://localhost:3172 ETAPA=antes node scripts/_verif-numeros-no-cambian.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3172";
const SALIDA = process.env.SALIDA ?? "/tmp/t166";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  { id: "ventas", titulo: "Ventas", url: "/ventas", ancla: "table, [data-celda]" },
  { id: "ventas-clientes", titulo: "Ventas > Clientes", url: "/ventas?tab=clientes", ancla: "table, [data-fila-cliente]" },
  { id: "clientes", titulo: "Clientes", url: "/clientes", ancla: "table tbody tr, [data-vista]" },
  { id: "multifashion", titulo: "Multifashion", url: "/multifashion", ancla: "table, [data-celda]" },
  { id: "reclamos", titulo: "Reclamos", url: "/reclamos", ancla: "main" },
  { id: "comisiones", titulo: "Comisiones", url: "/comisiones", ancla: "table" },
];

// Toda cifra visible: montos ($ y negativos), porcentajes y enteros sueltos.
const SONDA = `(() => {
  const raiz = document.querySelector("main") ?? document.body;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const cifras = [];
  const it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = it.nextNode())) {
    const t = (n.textContent ?? "").trim();
    if (!t) continue;
    const padre = n.parentElement;
    if (!padre || !visible(padre)) continue;
    for (const m of t.matchAll(/-?\\\$?\\d[\\d.,]*%?/g)) cifras.push(m[0]);
  }
  return {
    cifras,
    // Contexto para saber que la pantalla NO estaba vacía (un 0 sobre una
    // pantalla en blanco "coincide" perfecto y no prueba nada).
    filas: raiz.querySelectorAll("table tbody tr").length,
    textoLargo: raiz.innerText.length,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
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

const resultado = {};
for (const p of PANTALLAS) {
  const page = await ctx.newPage();
  await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  try { await page.waitForSelector(p.ancla, { timeout: 30000 }); } catch {}
  try { await page.waitForLoadState("networkidle", { timeout: 25000 }); } catch {}
  await page.waitForTimeout(1500);
  const r = await page.evaluate(SONDA);
  await page.close();
  resultado[p.id] = { titulo: p.titulo, ...r };
  console.error(`[${ETAPA}] ${p.titulo.padEnd(18)} ${String(r.cifras.length).padStart(4)} cifras · ${r.filas} filas · ${r.textoLargo} chars`);
}
await navegador.close();

const archivo = path.join(SALIDA, `numeros-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(resultado, null, 1));
console.error(`\nGuardado en ${archivo}`);

// Si ya existe el par, comparar.
const otro = path.join(SALIDA, `numeros-${ETAPA === "antes" ? "despues" : "antes"}.json`);
if (!existsSync(otro)) process.exit(0);

const a = JSON.parse(readFileSync(ETAPA === "antes" ? archivo : otro, "utf8"));
const d = JSON.parse(readFileSync(ETAPA === "antes" ? otro : archivo, "utf8"));

console.log("");
console.log("=== ANTES vs DESPUÉS · cifra por cifra, en su posición ===");
let distintasTotal = 0;
for (const id of Object.keys(a)) {
  const A = a[id], D = d[id] ?? { cifras: [] };
  const n = Math.max(A.cifras.length, D.cifras.length);
  const distintas = [];
  for (let i = 0; i < n; i++) {
    if (A.cifras[i] !== D.cifras[i]) distintas.push({ i, antes: A.cifras[i], despues: D.cifras[i] });
  }
  distintasTotal += distintas.length;
  const vacia = A.cifras.length === 0 ? "  ⚠️ SIN DATOS (no prueba nada)" : "";
  console.log(
    `${A.titulo.padEnd(20)} ${String(A.cifras.length).padStart(4)} → ${String(D.cifras.length).padStart(4)} cifras · ` +
      (distintas.length === 0 ? "✅ 0 distintas" : `❌ ${distintas.length} DISTINTAS`) + vacia,
  );
  for (const x of distintas.slice(0, 12)) {
    console.log(`     [${x.i}] antes=${x.antes ?? "—"}  después=${x.despues ?? "—"}`);
  }
}
console.log("");
console.log(distintasTotal === 0 ? "✅ NINGÚN NÚMERO CAMBIÓ." : `❌ ${distintasTotal} cifras distintas — revisar una por una.`);
