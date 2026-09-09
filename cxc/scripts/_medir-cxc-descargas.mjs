#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS DESCARGAS DE CUENTAS POR COBRAR — ANTES vs DESPUÉS, contra producción.
//
// Lee SOLO LECTURA (Management API) la vista `switch_estadocuenta_aging` —la
// misma que alimenta la pantalla— y reproduce, con las reglas de HOY y con las
// de ANTES, lo que sale en cada archivo. Lo que tiene que verse:
//
//   · la PLATA de los que se cobran no se mueve ni un centavo,
//   · salen exactamente los 5 clientes con saldo A FAVOR (y su −$1.220,05),
//   · el «Detallado» con una empresa en el filtro deja de contradecirse:
//     ANTES los encabezados sumaban una cosa y las filas otra,
//   · cuántos nombres cambian al pasar de MAYÚSCULAS a la grafía de Switch.
//
//   node scripts/_medir-cxc-descargas.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) throw new Error("falta SUPABASE_ACCESS_TOKEN en .env.local");
const PROYECTO = "rspocgqhtpveytgbtler";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const n = (v) => Number(v ?? 0);
const $ = (v) => `$${n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (v) => Math.round(v * 100) / 100;

const filas = await sql(`
  select company_key, codigo, nombre, nombre_normalized,
         d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365, total
  from switch_estadocuenta_aging
`);

// Consolidado por cliente, igual que la pantalla (llave = nombre_normalized).
const porCliente = new Map();
for (const f of filas) {
  let c = porCliente.get(f.nombre_normalized);
  if (!c) {
    c = { llave: f.nombre_normalized, nombre: f.nombre, codigo: f.codigo, empresas: new Map(), t0: 0, t1: 0, t2: 0, total: 0 };
    porCliente.set(f.nombre_normalized, c);
  }
  const t0 = n(f.d0_30) + n(f.d31_60) + n(f.d61_90);
  const t1 = n(f.d91_120);
  const t2 = n(f.d121_180) + n(f.d181_270) + n(f.d271_365) + n(f.mas_365);
  c.t0 += t0; c.t1 += t1; c.t2 += t2; c.total += n(f.total);
  c.empresas.set(f.company_key, { t0, t1, t2, total: n(f.total) });
}
const cartera = [...porCliente.values()].filter((c) => r2(c.total) !== 0);

console.log("═══ LA CARTERA DE HOY (las 6 del grupo) ═══");
console.log(`clientes con saldo ≠ 0 : ${cartera.length}`);
const suma = (xs, k) => r2(xs.reduce((s, c) => s + c[k], 0));
console.log(`total                  : ${$(suma(cartera, "total"))}`);
console.log(`  0 a 90 días          : ${$(suma(cartera, "t0"))}`);
console.log(`  91 a 120             : ${$(suma(cartera, "t1"))}`);
console.log(`  121 y más            : ${$(suma(cartera, "t2"))}`);

// ── 1 · El saldo a favor ─────────────────────────────────────────────────────
const aFavor = cartera.filter((c) => c.total < 0);
const seCobran = cartera.filter((c) => c.total > 0);
console.log("\n═══ 1 · SALDO A FAVOR — sale del cobro y de las descargas ═══");
console.log(`ANTES   : ${cartera.length} renglones · ${$(suma(cartera, "total"))} · botón «Cobrar» para los ${aFavor.length} a favor`);
console.log(`DESPUÉS : ${seCobran.length} renglones · ${$(suma(seCobran, "total"))} · sin botón para esos ${aFavor.length}`);
console.log(`diferencia: ${$(suma(aFavor, "total"))} — que es exactamente lo que suman los de saldo a favor:`);
for (const c of aFavor.sort((a, b) => a.total - b.total)) {
  console.log(`   ${c.codigo.padEnd(8)} ${c.nombre.padEnd(30)} ${$(c.total)}`);
}

// ── 2 · El detallado con una empresa en el filtro ────────────────────────────
console.log("\n═══ 2 · 🩸 EL «DETALLADO» SE CONTRADECÍA A SÍ MISMO ═══");
for (const empresa of ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]) {
  // La pantalla, con una empresa puesta, recorta el TOTAL del cliente a esa
  // empresa. El papel viejo listaba abajo TODAS las empresas del rol.
  const conEsa = cartera.filter((c) => c.empresas.has(empresa) && r2(c.empresas.get(empresa).total) !== 0);
  const encabezados = r2(conEsa.reduce((s, c) => s + c.empresas.get(empresa).total, 0));
  const filasViejas = r2(conEsa.reduce((s, c) => s + [...c.empresas.values()].reduce((x, e) => x + e.total, 0), 0));
  const cobrables = conEsa.filter((c) => c.empresas.get(empresa).total > 0);
  const ahora = r2(cobrables.reduce((s, c) => s + c.empresas.get(empresa).total, 0));
  console.log(
    `${empresa.padEnd(14)} ANTES encabezados ${$(encabezados).padStart(15)} vs filas ${$(filasViejas).padStart(15)}` +
    `${Math.abs(encabezados - filasViejas) > 0.005 ? "  ← NO CUADRA" : ""}`,
  );
  console.log(`${"".padEnd(14)} DESPUÉS las dos cosas ${$(ahora).padStart(15)} (${cobrables.length} clientes, sin los de saldo a favor)`);
}

// ── 3 · El nombre capitalizado ──────────────────────────────────────────────
const difieren = filas.filter((f) => f.nombre !== f.nombre_normalized).length;
const mayus = new Set(filas.filter((f) => f.nombre === f.nombre.toUpperCase()).map((f) => f.nombre));
console.log("\n═══ 3 · EL NOMBRE CAPITALIZADO ═══");
console.log(`filas de la cartera                       : ${filas.length}`);
console.log(`donde la grafía de Switch difiere de la llave: ${difieren}`);
console.log(`las que Switch manda en MAYÚSCULAS (siglas) : ${mayus.size} → ${[...mayus].join(" · ")}`);
console.log("   (por eso se muestra la grafía de Switch tal cual: capitalizar «R.J.A.S.A.» daría «R.j.a.s.a.»)");

// ── 4 · Lo que baja cada archivo ────────────────────────────────────────────
console.log("\n═══ 4 · LO QUE BAJA CADA ARCHIVO (con «Todas mis empresas») ═══");
console.log(`Total por cliente      : ${seCobran.length} renglones · Total ${$(suma(seCobran, "total"))}`);
const renglonesEmpresa = seCobran.reduce(
  (s, c) => s + [...c.empresas.values()].filter((e) => r2(e.total) !== 0).length, 0,
);
console.log(`Detallado por compañía : ${renglonesEmpresa} renglones · Total ${$(suma(seCobran, "total"))}`);
console.log("   (los dos archivos suman lo MISMO: uno reparte lo que el otro junta)");
