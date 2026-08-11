// Medición de Vista General con el gasto del MAYOR CONTABLE — 390 · 834 · 1440.
//
// Mide DOS cosas distintas y no hay que confundirlas:
//
//  A) LOS NÚMEROS QUE NO PUEDEN CAMBIAR. Ventas, Margen (utilidad bruta), CXC,
//     CXP y Disponibilidad se leen del payload real y se imprimen al centavo,
//     para cotejarlos contra `origin/main` corriendo el MISMO script con otro
//     BASE. Nada de "se ve igual": se compara cifra contra cifra.
//
//  B) CÓMO SE VE EL GASTO. Con la migración del mayor SIN correr, la pantalla
//     tiene que decir por qué no hay número y NUNCA pintar $0. Y con datos, el
//     mes cerrado da su total y el que no está listo da su motivo. Como en la
//     base todavía no hay una sola línea de mayor, el segundo caso se prueba
//     INTERCEPTANDO la respuesta de la API con los totales REALES medidos
//     contra Switch — la misma técnica que se usó para el banco de fotos de
//     Tommy: se le sirve a la pantalla la forma exacta del dato, sin inventar
//     una fila en producción.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role` (si no,
// todo redirige al login) y `delete Navigator.prototype.serviceWorker` antes de
// navegar.
//
// SOLO LECTURA: no escribe nada en la base.
//
//   npm run build && PORT=3118 npm run start
//   BASE=http://localhost:3118 node scripts/_medir-vista-general-gastos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3118";
const OUT = process.env.OUT ?? "/tmp/vista-general-gastos";
const MES = process.env.MES ?? "2026-01";
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
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of document.querySelectorAll("main *, body > div > div *")) {
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
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({
        el: el.tagName,
        alto: Math.round(r.height * 10) / 10,
        txt: (el.textContent ?? "").trim().slice(0, 32),
      });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const px = parseFloat(cs.fontSize);
      if (px < 11.5) textosChicos.push({ px, txt: (el.textContent ?? "").trim().slice(0, 32) });
    }
  }
  const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, " ").trim());
  return {
    arrastre,
    recortados,
    tactiles,
    textosChicos,
    kpis: txt("a.group.rounded-\\[14px\\]"),
    semaforo: txt("[data-fila-semaforo]"),
    hayEquilibrio: document.body.textContent.includes("Punto de equilibrio"),
    pideCargar: /carga los gastos/i.test(document.body.textContent),
  };
};

/**
 * Payload con los totales REALES del mayor medidos contra Switch. Se inyecta
 * para ver la pantalla CON datos mientras la migración no haya corrido.
 * Vistana / Fashion Wear / Fashion Shoes / Multifashion cierran en enero-2026;
 * Active Shoes en dic-2025, Active Wear en oct-2025, Joystep en ago-2025 y
 * Boston en jun-2025 → en enero-2026 esas cuatro NO tienen número.
 */
function payloadConDatos(real) {
  const cerrados = {
    vistana: 11685.66,
    fashion_wear: 31893.38,
    fashion_shoes: 5069.58,
  };
  const ultimoCerrado = {
    active_shoes: "2025-12",
    active_wear: "2025-10",
    joystep: "2025-08",
    confecciones_boston: "2025-06",
    american_classic: null,
  };
  const mesLargo = (m) => {
    if (!m) return null;
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [y, mm] = m.split("-");
    return `${MESES[Number(mm) - 1]} ${y}`;
  };

  const porEmpresa = real.gastos.porEmpresa.map((g) => {
    if (cerrados[g.key] !== undefined) {
      return { ...g, gasto: cerrados[g.key], motivo: null, texto: null, ultimoMesCerrado: "2026-01" };
    }
    // Multifashion (american_classic) cierra enero pero SIN planilla: el caso
    // que obliga a callar el número aunque el mes esté cerrado.
    if (g.key === "american_classic") {
      return {
        ...g, gasto: null, motivo: "sin_planilla",
        texto: "A este mes le falta el gasto de planilla, así que el total quedaría corto.",
        ultimoMesCerrado: "2026-01",
      };
    }
    const hasta = ultimoCerrado[g.key];
    return {
      ...g, gasto: null, motivo: "sin_cerrar",
      texto: `La contabilidad de esta empresa llega hasta ${mesLargo(hasta)}.`,
      ultimoMesCerrado: hasta,
    };
  });

  const conGasto = porEmpresa.filter((g) => g.gasto !== null);
  const claves = new Set(conGasto.map((g) => g.key));
  const gastoDe = new Map(conGasto.map((g) => [g.key, g.gasto]));
  let v = 0, u = 0, gg = 0;
  for (const e of real.semaforo) {
    if (!claves.has(e.key)) continue;
    v += e.ventas; u += e.utilidad; gg += gastoDe.get(e.key);
  }
  const monto = u - gg;

  return {
    ...real,
    gastos: {
      disponible: true,
      total: conGasto.reduce((s, g) => s + g.gasto, 0),
      empresasConGasto: conGasto.length,
      empresasTotal: porEmpresa.length,
      porEmpresa,
    },
    rentabilidad: {
      mes: real.mes, monto, pct: v > 0 ? monto / v : null, parcial: false,
      ventas: v, utilidad: u, gastos: gg,
      empresasConGasto: conGasto.length, empresasTotal: porEmpresa.length,
    },
    semaforo: real.semaforo.map((e) => {
      const g = porEmpresa.find((x) => x.key === e.key);
      const rent = g.gasto !== null ? e.utilidad - g.gasto : null;
      const estado = rent === null ? "sin_gastos"
        : rent < 0 ? "rojo"
        : e.ventas <= 0 ? "ambar"
        : rent / e.ventas < 0.05 ? "ambar" : "verde";
      return { ...e, gasto: g.gasto, motivo: g.motivo, texto: g.texto, ultimoMesCerrado: g.ultimoMesCerrado, rentabilidad: rent, pct: rent !== null && e.ventas > 0 ? rent / e.ventas : null, estado };
    }),
  };
}

const money = (n) => (n === null || n === undefined ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

async function main() {
  const navegador = await chromium.launch();
  const resultado = { base: BASE, mes: MES, real: null, estados: {} };

  // ── Payload REAL (una sola lectura, sirve de referencia para los dos casos) ──
  const ctxApi = await navegador.newContext();
  await ctxApi.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  const api = await ctxApi.request.get(`${BASE}/api/dashboard/vista-general?mes=${MES}`);
  const real = await api.json();
  resultado.real = real;
  await ctxApi.close();

  console.log(`\n═══ A) LOS NÚMEROS QUE NO PUEDEN CAMBIAR — ${BASE} · mes ${MES} ═══`);
  console.log(`Ventas            ${money(real.ventas?.total)}   (${real.ventas?.empresasCount} empresas)`);
  console.log(`Utilidad bruta    ${money(real.margen?.utilidad)}   margen ${real.margen?.pct === null ? "—" : (real.margen.pct * 100).toFixed(4) + "%"}`);
  console.log(`CXC total         ${money(real.cxc?.total)}   vencido ${money(real.cxc?.vencido)}   (${real.cxc?.empresasCount} empresas)`);
  console.log(`CXP total         ${money(real.cxp?.total)}   vencido ${money(real.cxp?.vencido)}   (${real.cxp?.empresasCount} empresas)`);
  console.log(`Disponibilidad    ${money(real.disponibilidad?.total)}   ${real.disponibilidad?.cuentas} cuentas   al ${real.disponibilidad?.fechaMasVieja}`);
  console.log(`Reclamos          ${real.reclamos?.total} sin pagar`);
  console.log(`\nVentas por empresa:`);
  for (const e of real.ventas?.byEmpresa ?? []) console.log(`  ${e.name.padEnd(24)} ventas ${money(e.ventas).padStart(14)}   utilidad ${money(e.utilidad).padStart(14)}`);

  console.log(`\n═══ B) EL GASTO ═══`);
  console.log(`gastos.disponible = ${real.gastos?.disponible}   total = ${real.gastos?.total === null ? "null (sin número, correcto)" : money(real.gastos?.total)}   ${real.gastos?.empresasConGasto}/${real.gastos?.empresasTotal} empresas`);
  console.log(`rentabilidad = ${real.rentabilidad === null ? "null (sin número, correcto)" : money(real.rentabilidad.monto)}`);
  console.log(`equilibrio en el payload: ${Object.prototype.hasOwnProperty.call(real, "equilibrio") ? "🔴 SIGUE" : "retirado ✓"}`);

  // ── Los dos estados de pantalla, en los 3 anchos ──
  for (const estado of ["sin-migracion", "con-datos"]) {
    resultado.estados[estado] = {};
    for (const a of ANCHOS) {
      const ctx = await navegador.newContext({ viewport: { width: a.w, height: a.h } });
      await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
      await ctx.addInitScript(() => {
        try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
        delete Navigator.prototype.serviceWorker;
      });
      const page = await ctx.newPage();
      if (estado === "con-datos") {
        await page.route("**/api/dashboard/vista-general*", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(payloadConDatos(real)),
          });
        });
      }
      await page.goto(`${BASE}/vista-general?mes=${MES}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const m = await page.evaluate(MEDIR);

      // El desglose de cada empresa: es donde vive la frase que explica POR QUÉ
      // no hay número. Se abre una por una porque el acordeón es de a una.
      m.desgloses = [];
      const filas = await page.$$(`${a.w < 768 ? "div" : "tr"}[data-fila-semaforo]`);
      for (const f of filas) {
        await f.click();
        await page.waitForTimeout(120);
        const t = await page.$$eval(
          "[data-col='sin-gasto'], [data-col='rentabilidad-detalle']",
          (els) => els.map((e) => (e.closest("p") ?? e).textContent.replace(/\s+/g, " ").trim()),
        );
        if (t.length) m.desgloses.push(t[t.length - 1]);
      }
      if (m.desgloses.length) {
        console.log(`\n[${estado}] ${a.nombre} — desgloses:`);
        for (const d of m.desgloses) console.log(`      · ${d}`);
      }
      resultado.estados[estado][a.nombre] = m;
      await page.screenshot({ path: `${OUT}/${estado}-${a.w}.png`, fullPage: true });
      console.log(
        `\n[${estado}] ${a.nombre} (${a.w}px)  arrastre ${m.arrastre}px · recortados ${m.recortados.length} · táctiles<44 ${m.tactiles.length} · textos<12 ${m.textosChicos.length} · "Punto de equilibrio" ${m.hayEquilibrio ? "🔴 SIGUE" : "no"} · pide cargar ${m.pideCargar ? "🔴 SÍ" : "no"}`,
      );
      if (a.w === 390) {
        for (const k of m.kpis) console.log(`      KPI · ${k}`);
        for (const s of m.semaforo) console.log(`      SEM · ${s}`);
      }
      for (const r of m.recortados) console.log(`      recorte ${r.px}px ${r.el}`);
      for (const t of m.tactiles) console.log(`      táctil ${t.alto}px "${t.txt}"`);
      await ctx.close();
    }
  }

  writeFileSync(`${OUT}/medicion.json`, JSON.stringify(resultado, null, 2));
  console.log(`\nCapturas y JSON en ${OUT}`);
  await navegador.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
