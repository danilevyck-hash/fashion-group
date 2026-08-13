// Medición de Vista General con el INVENTARIO VALORIZADO y los GASTOS POR
// EMPRESA — 390 · 834 · 1440. SOLO LECTURA: no escribe nada en la base.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// Mide TRES estados, porque los textos largos viven en los dos últimos:
//   A) real       — el payload tal como llega hoy.
//   B) viejo      — el dato pasado de 26 h (aviso en ámbar, texto más largo).
//   C) sin-dato   — inventario no disponible + gastos sin conectar.
//
// GOTCHAS (CLAUDE.md, pagados ya varias veces):
//   · sembrar la cookie Y `sessionStorage.cxc_role`, o todo redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar;
//   · esta app NO tiene <main>: el contenedor se elige por el que MÁS texto
//     tiene, no por el primer div (el primero es un overlay VACÍO del menú y
//     daría 0 en todo, verde sin haber mirado nada);
//   · el script FALLA si no encuentra los paneles: medir cero es peor que no
//     medir.
//
//   PORT=3186 npm run start
//   BASE=http://localhost:3186 node scripts/_medir-vista-general-inventario.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3186";
const OUT = process.env.OUT ?? "/tmp/vg-inventario";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
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

const MEDIR = () => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  // 🩸 El contenedor con MÁS texto, no el primero: el primero es un overlay
  // vacío del menú y daría 0 en todo.
  let raiz = document.body;
  let mejor = 0;
  for (const el of document.querySelectorAll("body div")) {
    const n = (el.textContent ?? "").length;
    if (n > mejor) { mejor = n; raiz = el; }
  }
  const recortados = [], tactiles = [], textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 50)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 32) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const px = parseFloat(cs.fontSize);
      if (px < 11.5) textosChicos.push({ px, txt: (el.textContent ?? "").trim().slice(0, 32) });
    }
  }
  const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
  return {
    arrastre, recortados, tactiles, textosChicos,
    kpis: txt("a.group.rounded-\\[14px\\]"),
    filasInventario: txt("[data-fila-inventario]"),
    sinInventario: txt("[data-fila-sin-inventario]"),
    filasGasto: txt("[data-fila-gasto]"),
    totalCosto: txt('[data-col="total-costo"]')[0] ?? null,
    totalPrecio: txt('[data-col="total-precio"]')[0] ?? null,
    frescura: txt('[data-col="frescura"]')[0] ?? null,
    sinCosto: txt('[data-col="sin-costo"]')[0] ?? null,
    cobertura: txt('[data-col="cobertura"]')[0] ?? null,
    hayPanelInventario: !!document.querySelector('[data-panel="inventario"]'),
    hayPanelGastos: !!document.querySelector('[data-panel="gastos"]'),
    // Lo que NO puede aparecer: una tarjeta "Gastos" con un total del grupo.
    hayTarjetaGastosVieja: txt("a.group.rounded-\\[14px\\]").some((t) => /^Gastos/.test(t)),
  };
};

const ESTADOS = {
  real: null,
  viejo: (j) => (!j.inventario ? j : { ...j, inventario: { ...j.inventario, viejo: true, horas: 40 } }),
  "sin-dato": (j) => ({
    ...j,
    inventario: { ...(j.inventario ?? {}), disponible: false, porEmpresa: [], totalCosto: 0, totalPrecio: 0, totalUnidades: 0, sinCosto: { articulos: 0, unidades: 0 }, medidoEn: null, viejo: false, horas: null, sinInventario: j.inventario?.sinInventario ?? [] },
    gastos: { ...j.gastos, disponible: false },
  }),
};

async function main() {
  const navegador = await chromium.launch();
  const resultado = { base: BASE, estados: {} };
  let fallo = false;

  for (const [estado, transformar] of Object.entries(ESTADOS)) {
    resultado.estados[estado] = {};
    for (const a of ANCHOS) {
      const ctx = await navegador.newContext({ viewport: { width: a.w, height: a.h } });
      await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
      await ctx.addInitScript(() => {
        try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
        try { delete Navigator.prototype.serviceWorker; } catch {}
      });
      const pag = await ctx.newPage();
      if (transformar) {
        await pag.route("**/api/dashboard/vista-general*", async (route) => {
          const res = await route.fetch();
          const j = await res.json();
          await route.fulfill({ response: res, json: transformar(j) });
        });
      }
      await pag.goto(`${BASE}/vista-general`, { waitUntil: "networkidle" });
      await pag.waitForTimeout(700);
      const m = await pag.evaluate(MEDIR);
      resultado.estados[estado][a.nombre] = m;

      if (!m.hayPanelInventario || !m.hayPanelGastos) {
        console.log(`🔴 ${estado} · ${a.nombre}: NO se encontró un panel (inv=${m.hayPanelInventario} gastos=${m.hayPanelGastos})`);
        fallo = true;
      }
      if (m.hayTarjetaGastosVieja) {
        console.log(`🔴 ${estado} · ${a.nombre}: volvió la tarjeta "Gastos" con total del grupo`);
        fallo = true;
      }
      const ok = m.arrastre === 0 && m.recortados.length === 0 && m.tactiles.length === 0 && m.textosChicos.length === 0;
      console.log(
        `${ok ? "🟢" : "🟡"} ${estado.padEnd(9)} ${a.nombre.padEnd(11)} (${a.w}px) → arrastre ${m.arrastre} · ` +
        `recortados ${m.recortados.length} · táctiles<44 ${m.tactiles.length} · texto<12px ${m.textosChicos.length}`,
      );
      for (const r of m.recortados) console.log(`      recortado ${r.px}px  ${r.el}`);
      for (const t of m.tactiles) console.log(`      táctil ${t.alto}px  "${t.txt}"`);
      for (const t of m.textosChicos) console.log(`      texto ${t.px}px  "${t.txt}"`);

      await pag.screenshot({ path: `${OUT}/${estado}-${a.w}.png`, fullPage: true });
      await ctx.close();
    }
  }

  const r = resultado.estados.real.iPhone;
  console.log("\n── Lo que se lee en pantalla (iPhone 390) ──");
  console.log(`  frescura      : ${r.frescura}`);
  console.log(`  total al costo: ${r.totalCosto}`);
  console.log(`  a precio      : ${r.totalPrecio}`);
  console.log(`  sin costo     : ${r.sinCosto}`);
  console.log(`  cobertura     : ${r.cobertura}`);
  for (const f of r.filasInventario) console.log(`  inv  · ${f}`);
  for (const f of r.sinInventario) console.log(`  sin  · ${f}`);
  for (const f of r.filasGasto) console.log(`  gas  · ${f}`);
  console.log(`  KPIs          : ${r.kpis.map((k) => k.split(" ").slice(0, 3).join(" ")).join(" | ")}`);

  writeFileSync(`${OUT}/medicion.json`, JSON.stringify(resultado, null, 2));
  console.log(`\n→ ${OUT}/medicion.json`);
  await navegador.close();
  if (fallo) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
