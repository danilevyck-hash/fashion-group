// Medición de este PR — 390 · 834 · 1440, contra el build de producción.
//
// Mide TRES cosas y no hay que confundirlas:
//
//  A) LOS NÚMEROS QUE NO PUEDEN CAMBIAR. Ventas, Margen, CXC, CXP y —sobre
//     todo— DISPONIBILIDAD se leen del payload real de /api/dashboard/vista-general
//     y se imprimen al centavo, para cotejarlos contra `origin/main` corriendo
//     el MISMO script con otro BASE. Nada de "se ve igual".
//
//  B) LA RENTABILIDAD POR EMPRESA. Se imprime empresa por empresa (ventas,
//     utilidad, gasto, rentabilidad, %, estado) y se verifica que el payload NO
//     traiga ninguna rentabilidad de grupo.
//
//  C) EL NOMBRE DE LAS CUENTAS EN GASTOS. `egresos_varios` está VACÍA en
//     producción (el cron corre 10:35 UTC), así que el detalle se prueba
//     INTERCEPTANDO la respuesta de la API con las cuentas y montos REALES del
//     archivo que bajó Daniel — la misma técnica del banco de fotos de Tommy:
//     se le sirve a la pantalla la forma exacta del dato, sin inventar una fila
//     en producción.
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
//   npm run build && PORT=3184 npm run start
//   BASE=http://localhost:3184 node scripts/_medir-cuentas-y-rentabilidad.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3184";
const OUT = process.env.OUT ?? "/tmp/medicion-t184";
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

// ── El detalle de egresos con nombres, armado del archivo REAL de Daniel ─────

function catalogoReal() {
  const csv = readFileSync(new URL("../src/__tests__/fixtures/catalogo-cuentas-vistana.csv", import.meta.url), "latin1");
  const m = new Map();
  for (const linea of csv.split(/\r\n|\n/).slice(1)) {
    if (!linea.trim()) continue;
    const c = linea.split(";");
    if (c.length < 6) continue;
    const cod = c.slice(0, 5).map((x) => x.trim().replace(/^"|"$/g, "")).join(".");
    m.set(cod, c.slice(5).join(";").replace(/\s+/g, " ").trim());
  }
  return m;
}

function egresosReales() {
  const csv = readFileSync(new URL("../src/__tests__/fixtures/egresos-vistana-2026.csv", import.meta.url), "latin1");
  const filas = [];
  for (const linea of csv.split(/\r\n|\n/).slice(1)) {
    if (!linea.trim()) continue;
    const c = linea.split(";").map((x) => x.trim().replace(/^"|"$/g, ""));
    const cuenta = c.find((x) => /^\d+(\.\d+){4}$/.test(x));
    if (!cuenta) continue;
    const fecha = c[0];
    const total = Number(String(c[c.length - 1]).replace(/,/g, ""));
    if (!Number.isFinite(total)) continue;
    filas.push({ fecha, cuenta, total, ref: c[5] ?? "" });
  }
  return filas;
}

const CAT = catalogoReal();
const codigoVisible = (c) => {
  const s = c.split(".");
  let fin = s.length;
  while (fin > 3 && s[fin - 1] === "00") fin--;
  return s.slice(0, fin).join(".");
};

function payloadEgresos(mes) {
  const delMes = egresosReales().filter((f) => f.fecha.startsWith(mes));
  const porCuenta = new Map();
  for (const f of delMes) {
    const p = porCuenta.get(f.cuenta) ?? { cuenta: f.cuenta, totalCent: 0, renglones: 0, ejemplos: [] };
    p.totalCent += Math.round(f.total * 100);
    p.renglones += 1;
    if (p.ejemplos.length < 3 && f.ref && !p.ejemplos.includes(f.ref)) p.ejemplos.push(f.ref);
    porCuenta.set(f.cuenta, p);
  }
  const cuentas = [...porCuenta.values()]
    .map((c) => ({
      ...c,
      corta: c.cuenta.split(".").slice(0, 3).join("."),
      visible: codigoVisible(c.cuenta),
      nombre: CAT.get(c.cuenta) ?? null,
      grupo: c.cuenta.split(".")[0],
      esGasto: c.cuenta.startsWith("6."),
    }))
    .sort((a, b) => b.totalCent - a.totalCent);
  const gasto = cuentas.filter((c) => c.esGasto);
  const noGasto = cuentas.filter((c) => !c.esGasto);
  const suma = (xs) => xs.reduce((a, c) => a + c.totalCent, 0);

  const empresa = (key, nombre, conDatos, automatica) => ({
    empresaKey: key,
    nombre,
    ultimoMesConMovimientos: conDatos ? mes : null,
    descargaAutomatica: automatica,
    resumen: {
      mes,
      estado: conDatos ? "con_movimientos" : "sin_datos",
      totalSalidaCent: conDatos ? suma(cuentas) : 0,
      totalGastoCent: conDatos ? suma(gasto) : 0,
      totalNoGastoCent: conDatos ? suma(noGasto) : 0,
      cuentasGasto: conDatos ? gasto : [],
      cuentasNoGasto: conDatos ? noGasto : [],
      renglones: conDatos ? delMes.length : 0,
      documentos: conDatos ? new Set(delMes.map((f) => f.fecha + f.cuenta)).size : 0,
    },
  });

  return {
    instalado: true,
    mes,
    empresas: [
      empresa("vistana", "Vistana International", true, true),
      empresa("fashion_wear", "Fashion Wear", false, true),
      empresa("fashion_shoes", "Fashion Shoes", false, true),
      empresa("active_shoes", "Active Shoes", false, true),
      empresa("active_wear", "Active Wear", false, true),
      empresa("joystep", "Joystep", false, true),
      empresa("american_classic", "Multifashion", false, true),
      // 🔴 Boston: la que NO se baja sola.
      empresa("confecciones_boston", "Confecciones Boston", false, false),
    ],
  };
}

// ── Medición ────────────────────────────────────────────────────────────────

const MEDIR = `() => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);
  const recortados = [];
  const chicos = [];
  const tactiles = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // El h1 \`sr-only\` mide 1 px de ancho A PROPÓSITO (lector de pantalla):
    // contarlo como recorte es ruido puro, y aparece en las dos ramas.
    if (el.className && String(el.className).includes("sr-only")) continue;
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 4 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
      recortados.push({ t: (el.textContent ?? "").trim().slice(0, 45), px: desborde });
    }
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 12 && (el.textContent ?? "").trim() && el.children.length === 0) {
      chicos.push({ t: (el.textContent ?? "").trim().slice(0, 35), fs });
    }
    if (["BUTTON", "A"].includes(el.tagName) || el.getAttribute("role") === "button") {
      if (r.height < 44) tactiles.push({ t: (el.textContent ?? "").trim().slice(0, 35), h: Math.round(r.height) });
    }
  }
  return { arrastre, recortados, chicos, tactiles };
}`;

const money = (n) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "cxc_session", value: COOKIE, url: BASE },
  ]);
  await ctx.addInitScript(() => {
    try { delete Navigator.prototype.serviceWorker; } catch {}
    sessionStorage.setItem("cxc_role", "admin");
  });

  const page = await ctx.newPage();

  // ── A + B: Vista General ──────────────────────────────────────────────────
  let payloadVG = null;
  page.on("response", async (r) => {
    if (r.url().includes("/api/dashboard/vista-general") && r.status() === 200) {
      try { payloadVG = await r.json(); } catch {}
    }
  });

  const resultados = [];
  const MESES_VG = (process.env.MESES ?? "2026-08,2026-01").split(",");

  for (const mes of MESES_VG) {
    for (const a of ANCHOS) {
      await page.setViewportSize({ width: a.w, height: a.h });
      await page.goto(`${BASE}/vista-general?mes=${mes}`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-fila-semaforo]", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      const m = await page.evaluate(eval(`(${MEDIR})`));
      resultados.push({ pantalla: `vista-general ${mes}`, ...a, ...m });
      await page.screenshot({ path: `${OUT}/vg-${mes}-${a.w}.png`, fullPage: true });
    }

    if (payloadVG) {
      console.log(`\n═══ VISTA GENERAL · ${mes} ═══`);
      console.log(`Ventas        ${money(payloadVG.ventas?.total)}`);
      console.log(`Margen        ${payloadVG.margen?.pct == null ? "—" : (payloadVG.margen.pct * 100).toFixed(1) + "%"} · utilidad ${money(payloadVG.margen?.utilidad)}`);
      console.log(`Gastos        ${money(payloadVG.gastos?.total)} (${payloadVG.gastos?.empresasConGasto}/${payloadVG.gastos?.empresasTotal} empresas)`);
      console.log(`DISPONIBILIDAD ${money(payloadVG.disponibilidad?.total)} · ${payloadVG.disponibilidad?.cuentas} cuentas · al ${payloadVG.disponibilidad?.fechaMasVieja}`);
      console.log(`CXC           ${money(payloadVG.cxc?.total)} · vencido ${money(payloadVG.cxc?.vencido)}`);
      console.log(`CXP           ${money(payloadVG.cxp?.total)} · vencido ${money(payloadVG.cxp?.vencido)}`);
      console.log(`rentabilidad de grupo en el payload: ${"rentabilidad" in payloadVG ? "🔴 SÍ (MAL)" : "✅ NO"}`);
      console.log(`\n  RENTABILIDAD POR EMPRESA`);
      for (const e of payloadVG.semaforo ?? []) {
        const rent = e.rentabilidad == null ? "—" : money(e.rentabilidad);
        const pct = e.pct == null ? "" : ` (${(e.pct * 100).toFixed(1)}%)`;
        console.log(
          `  ${e.name.padEnd(24)} ventas ${money(e.ventas).padStart(14)} · utilidad ${money(e.utilidad).padStart(13)} · gasto ${(e.gasto == null ? "—" : money(e.gasto)).padStart(12)} · RENT ${rent.padStart(13)}${pct}  [${e.estado}]${e.gasto == null ? `  → "${e.texto ?? e.motivo}"` : ""}`,
        );
      }
      writeFileSync(`${OUT}/vista-general-${mes}.json`, JSON.stringify(payloadVG, null, 2));
      payloadVG = null;
    }
  }

  // ── C: Gastos › Egresos, estado REAL (tabla vacía + aviso de Boston) ──────
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/gastos-contabilidad?fuente=egresos&mes=2026-08`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const m = await page.evaluate(eval(`(${MEDIR})`));
    resultados.push({ pantalla: "gastos egresos (real)", ...a, ...m });
    await page.screenshot({ path: `${OUT}/gastos-real-${a.w}.png`, fullPage: true });
    if (a.w === 390) {
      const txt = await page.evaluate(() => document.body.innerText);
      console.log(`\n═══ GASTOS › lo que salió de caja y banco (estado REAL hoy) ═══`);
      console.log(txt.split("\n").filter((l) => l.trim()).slice(0, 40).join("\n"));
    }
  }

  // ── C bis: el DETALLE con los nombres, servido con el archivo real ────────
  const MES_EG = "2026-07";
  await ctx.route("**/api/gastos-contabilidad/egresos**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payloadEgresos(MES_EG)) }),
  );

  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/gastos-contabilidad?fuente=egresos&mes=${MES_EG}&empresa=vistana`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(600);
    const m = await page.evaluate(eval(`(${MEDIR})`));
    resultados.push({ pantalla: "gastos detalle (nombres)", ...a, ...m });
    await page.screenshot({ path: `${OUT}/gastos-detalle-${a.w}.png`, fullPage: true });
    if (a.w === 390) {
      const txt = await page.evaluate(() => document.body.innerText);
      console.log(`\n═══ GASTOS › detalle de Vistana ${MES_EG} — código — NOMBRE ═══`);
      console.log(txt.split("\n").filter((l) => l.trim()).slice(0, 34).join("\n"));
    }
  }

  // Y la lista con Boston, con el mismo payload interceptado.
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/gastos-contabilidad?fuente=egresos&mes=${MES_EG}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const m = await page.evaluate(eval(`(${MEDIR})`));
    resultados.push({ pantalla: "gastos lista (Boston)", ...a, ...m });
    await page.screenshot({ path: `${OUT}/gastos-lista-${a.w}.png`, fullPage: true });
    if (a.w === 390) {
      const txt = await page.evaluate(() => document.body.innerText);
      const i = txt.indexOf("Confecciones Boston");
      console.log(`\n═══ GASTOS › lo que ve Daniel al entrar a Boston ═══`);
      console.log(txt.slice(Math.max(0, i - 60), i + 320));
    }
  }

  await browser.close();

  console.log(`\n═══ LOS 3 ANCHOS ═══`);
  let mal = 0;
  for (const r of resultados) {
    const ok = r.arrastre === 0 && r.recortados.length === 0 && r.chicos.length === 0 && r.tactiles.length === 0;
    if (!ok) mal++;
    console.log(
      `${ok ? "✅" : "🔴"} ${r.pantalla.padEnd(26)} ${String(r.w).padStart(5)} → arrastre ${r.arrastre} · recortados ${r.recortados.length} · <12px ${r.chicos.length} · táctiles<44 ${r.tactiles.length}`,
    );
    for (const x of r.recortados) console.log(`      recortado ${x.px}px: ${x.t}`);
    for (const x of r.chicos) console.log(`      ${x.fs}px: ${x.t}`);
    for (const x of r.tactiles) console.log(`      táctil ${x.h}px: ${x.t}`);
  }
  writeFileSync(`${OUT}/anchos.json`, JSON.stringify(resultados, null, 2));
  console.log(`\n${mal === 0 ? "✅ TODO LIMPIO" : `🔴 ${mal} con hallazgos`} · capturas en ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
