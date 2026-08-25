// ─────────────────────────────────────────────────────────────────────────────
// NINGÚN NÚMERO DE NEGOCIO PUEDE CAMBIAR — salvo los DOS que sí se agregan.
//
// Este cambio toca RÓTULOS (lo que dicen las pantallas) y una lista de empresas
// (joystep entra a Utilidad). Lo primero no puede mover un centavo; lo segundo
// mueve SOLO lo de joystep, y las otras cinco tienen que quedar idénticas.
//
// 🔴 SE COMPARA POSICIÓN POR POSICIÓN, no como conjunto. Un conjunto ordenado
// diría "los mismos números" aunque dos filas se hubieran intercambiado, que es
// el error que más daño hace.
//
// 🩸 LOS RÓTULOS SÍ CAMBIAN, Y ESO METE TOKENS NUEVOS. "Año 2025 completo" y
// "vs 2024" agregan años al texto de la pantalla, así que un extractor de
// "todo lo que parezca número" acusaría a este cambio de mover cifras que no
// movió. Por eso se comparan **las cifras de NEGOCIO** —lo que lleva `$` o
// `%`— que es lo que la regla protege, y los años sueltos de los rótulos se
// listan aparte como CONTEXTO, para poder mirarlos a mano.
//
// Solo lectura: se navega y se mira. No se toca ningún botón que ejecute nada.
//
//   BASE=http://localhost:3236 ETAPA=antes|despues node scripts/_verif-ventas-rotulos-numeros.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3236";
const SALIDA = process.env.SALIDA ?? "/tmp/t236-rotulos";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const PANTALLAS = [
  { id: "ventas",     titulo: "Ventas › Resumen",  url: "/ventas",                 ancla: "table, [data-celda]" },
  { id: "clientes",   titulo: "Ventas › Clientes", url: "/ventas?tab=clientes",    ancla: "table, [data-fila-cliente]" },
  { id: "productos",  titulo: "Ventas › Productos", url: "/ventas?tab=productos",  ancla: "[data-fila-producto]" },
  { id: "utilidad",   titulo: "Ventas › Utilidad", url: "/ventas?tab=utilidad",    ancla: "table tbody tr" },
  { id: "cxc",        titulo: "Cuentas por Cobrar", url: "/admin",                 ancla: "table tbody tr" },
  { id: "directorio", titulo: "Clientes",          url: "/clientes",               ancla: "table tbody tr, [data-vista]" },
];

// Toda cifra visible, separada en DOS baldes.
//
// 🩸 SE LEE `innerText`, NO LOS NODOS DE TEXTO UNO POR UNO. En JSX, `${fmt(x)}`
// produce DOS hijos —el "$" literal y el resultado— y React los renderiza como
// nodos separados: recorriéndolos de a uno, ningún monto del CXC lleva su "$"
// pegado y el balde de plata daba **CERO** en pantallas llenas de dinero. Un
// cero que "coincide" perfecto entre las dos corridas y no prueba nada.
// `innerText` los une como los ve la persona, y además respeta lo que el CSS
// esconde (que es justo lo que hay que excluir).
const SONDA = `(() => {
  const raiz = document.querySelector("main") ?? document.body;
  const texto = raiz.innerText ?? "";
  const plata = [];   // lo que lleva $ o % — las cifras de NEGOCIO
  const sueltos = []; // enteros pelados: conteos, años de rótulo, días
  for (const m of texto.matchAll(/[-−]?\\$\\s?[\\d][\\d.,]*|[-−+]?[\\d][\\d.,]*\\s?%/g)) {
    plata.push(m[0].replace(/\\s+/g, ""));
  }
  for (const m of texto.matchAll(/(?<![\\d$%.,\\-−])\\d[\\d.,]*(?![\\d%])/g)) sueltos.push(m[0]);
  return {
    plata,
    sueltos,
    // Contexto: una pantalla vacía "coincide" perfecto y no prueba nada.
    filas: raiz.querySelectorAll("table tbody tr, [data-fila-producto], [data-fila-cliente]").length,
    textoLargo: texto.length,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
// 🩸 Sin esto el service worker mata la hidratación y la pantalla mide vacío.
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
// 🔴 SOLO LECTURA: se aborta cualquier pedido que no sea GET.
await ctx.route("**/*", (route) => {
  const m = route.request().method();
  if (m !== "GET" && m !== "HEAD") return route.abort();
  return route.continue();
});

const resultado = {};
for (const p of PANTALLAS) {
  const page = await ctx.newPage();
  await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  try { await page.waitForSelector(p.ancla, { timeout: 45000 }); } catch {}
  try { await page.waitForLoadState("networkidle", { timeout: 30000 }); } catch {}
  await page.waitForTimeout(2000);
  const r = await page.evaluate(SONDA);
  await page.close();
  resultado[p.id] = { titulo: p.titulo, ...r };
  console.error(
    `[${ETAPA}] ${p.titulo.padEnd(22)} ${String(r.plata.length).padStart(4)} cifras de plata · ` +
    `${String(r.sueltos.length).padStart(4)} sueltos · ${r.filas} filas · ${r.textoLargo} chars`,
  );
}
await navegador.close();

const archivo = path.join(SALIDA, `${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(resultado, null, 1));
console.error(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, `${ETAPA === "antes" ? "despues" : "antes"}.json`);
if (!existsSync(otro)) process.exit(0);

const a = JSON.parse(readFileSync(ETAPA === "antes" ? archivo : otro, "utf8"));
const d = JSON.parse(readFileSync(ETAPA === "antes" ? otro : archivo, "utf8"));

// Utilidad DEBE cambiar: joystep entra. Se verifica aparte, fila por fila.
const CAMBIA_A_PROPOSITO = new Set(["utilidad"]);

console.log("");
console.log("=== ANTES (origin/main) vs DESPUÉS · cifra de PLATA por posición ===");
let distintasTotal = 0;
let vacias = 0;
for (const id of Object.keys(a)) {
  const A = a[id], D = d[id] ?? { plata: [], sueltos: [] };
  const n = Math.max(A.plata.length, D.plata.length);
  const distintas = [];
  for (let i = 0; i < n; i++) if (A.plata[i] !== D.plata[i]) distintas.push({ i, antes: A.plata[i], despues: D.plata[i] });
  const esperado = CAMBIA_A_PROPOSITO.has(id);
  if (!esperado) distintasTotal += distintas.length;
  if (A.plata.length === 0) vacias++;
  const veredicto = distintas.length === 0
    ? "✅ 0 distintas"
    : esperado ? `⚠️  ${distintas.length} distintas — ESPERADO (entra joystep)` : `❌ ${distintas.length} DISTINTAS`;
  console.log(
    `${A.titulo.padEnd(22)} ${String(A.plata.length).padStart(4)} → ${String(D.plata.length).padStart(4)} · ${veredicto}` +
    (A.plata.length === 0 ? "  ⚠️ SIN DATOS (no prueba nada)" : ""),
  );
  if (!esperado) for (const x of distintas.slice(0, 12)) {
    console.log(`     [${x.i}] antes=${x.antes ?? "—"}  después=${x.despues ?? "—"}`);
  }
}

console.log("");
console.log("=== CONTEXTO · enteros sueltos (los rótulos SÍ cambian de texto) ===");
for (const id of Object.keys(a)) {
  const A = a[id], D = d[id] ?? { sueltos: [] };
  const n = Math.max(A.sueltos.length, D.sueltos.length);
  const dif = [];
  for (let i = 0; i < n; i++) if (A.sueltos[i] !== D.sueltos[i]) dif.push({ i, antes: A.sueltos[i], despues: D.sueltos[i] });
  console.log(`${A.titulo.padEnd(22)} ${String(A.sueltos.length).padStart(4)} → ${String(D.sueltos.length).padStart(4)} · ${dif.length} distintos`);
  for (const x of dif.slice(0, 6)) console.log(`     [${x.i}] antes=${x.antes ?? "—"}  después=${x.despues ?? "—"}`);
}

console.log("");
if (vacias > 0) {
  console.log(`🔴 ${vacias} pantalla(s) sin una sola cifra: la medición NO prueba nada.`);
  process.exit(1);
}
console.log(distintasTotal === 0
  ? "🟢 NINGÚN número de negocio cambió (fuera de Utilidad, donde entra joystep a propósito)."
  : `🔴 ${distintasTotal} cifras de plata cambiaron donde NO debían.`);
process.exit(distintasTotal === 0 ? 0 : 1);
