#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — v5 (cobro por CARTERA) vs v6 (cobro a QUIEN REGISTRÓ el recibo)
// sobre los datos REALES de 2026, corriendo el SQL DE VERDAD de las dos
// migraciones en un Postgres local (pglite). SOLO LECTURA contra producción.
//
// Por qué así y no "reproduciendo la aritmética a mano": la v6 todavía no está
// en producción (la DDL la corre Daniel) y es plata que se le paga a gente. Lo
// que se necesita probar es que EL ARCHIVO que se va a aplicar produce los
// números que Daniel aprobó — no una imitación en JS del archivo.
//
// Tres pasos, cada uno con su cuadre:
//   1. Baja a disco recibos / utilidad / facturas / vendedores / tasas de 2026
//      para las 6 del grupo (paginado y verificado contra count=exact).
//   2. Los carga en pglite con las MISMAS columnas y corre v5 y v6 (los .sql
//      del repo, sin editar) para las 6 empresas × 8 meses.
//   3. CUADRE: la v5 de pglite se compara vendedor por vendedor contra la RPC
//      v5 de PRODUCCIÓN. Si no dan lo mismo, los datos cargados no son los de
//      producción y el cuadro de v6 no vale.
//
// Uso:
//   PGLITE_DIR=/tmp/v6/node_modules/@electric-sql/pglite \
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-comision-cobro-v6.mjs
//
// pglite NO es dependencia del repo (npm i @electric-sql/pglite en un dir
// aparte y apuntar PGLITE_DIR ahí).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(new URL(".", import.meta.url).pathname, "..");
const OUT = process.env.OUT ?? "/tmp/v6/datos";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const YEAR = 2026;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8];

const U = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY (DOTENV_CONFIG_PATH=.env.local)");
const H = { apikey: KEY, Authorization: "Bearer " + KEY };
const PGLITE_DIR = process.env.PGLITE_DIR;
if (!PGLITE_DIR) throw new Error("falta PGLITE_DIR (ver cabecera)");

// ─── 1. bajar (solo GET, paginado, verificado) ───────────────────────────────
async function todo(tabla, q, orden) {
  const out = [];
  let esperadas = null;
  for (let p = 0; p < 500; p++) {
    const desde = p * 1000;
    const r = await fetch(`${U}/${tabla}?${q}&order=${orden}&offset=${desde}&limit=1000`, {
      headers: { ...H, Prefer: "count=exact" },
    });
    if (!r.ok) throw new Error(`${tabla} ${r.status} ${await r.text()}`);
    esperadas = Number(r.headers.get("content-range").split("/")[1]);
    const j = await r.json();
    out.push(...j);
    if (j.length < 1000 || out.length >= esperadas) break;
  }
  if (out.length !== esperadas) throw new Error(`${tabla}: leídas ${out.length} vs ${esperadas} contadas`);
  return out;
}

mkdirSync(OUT, { recursive: true });
const EMP = EMPRESAS.join(",");
async function cargar(nombre, tabla, q, orden) {
  const f = path.join(OUT, `${nombre}.json`);
  if (existsSync(f) && !process.env.REBAJAR) return JSON.parse(readFileSync(f, "utf8"));
  const d = await todo(tabla, q, orden);
  writeFileSync(f, JSON.stringify(d));
  return d;
}
const recibos = await cargar("recibos", "switch_recibos",
  `select=id,empresa_key,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,cliente_nombre,vendedor_registro,vendedor_cartera,total,es_retencion&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${YEAR}-09-01`, "id");
const utilidad = await cargar("utilidad", "switch_factura_utilidad",
  `select=id,empresa_key,secuencial,fecha,tipo_comprobante,vendedor,cliente,subtotal_con_descuento,pct_utilidad&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${YEAR}-09-01`, "id");
// ±2 días de ventana en doc_vendedor → se trae un poco más ancho.
const facturas = await cargar("facturas", "switch_facturas",
  `select=id,empresa_key,secuencial,fecha,vendedor_nombre&empresa_key=in.(${EMP})&fecha=gte.${YEAR - 1}-12-28T00:00:00Z&fecha=lt.${YEAR}-09-05T00:00:00Z`, "id");
const vendedores = await cargar("vendedores", "vendedores", "select=empresa_key,nombre,activo", "empresa_key,nombre");
const tasas = await cargar("tasas", "comision_vendedor_tasa", "select=vendedor_nombre,tasa_venta,tasa_cobro,activo", "vendedor_nombre");
console.log(`datos: recibos ${recibos.length} · utilidad ${utilidad.length} · facturas ${facturas.length} · vendedores ${vendedores.length} · tasas ${tasas.length}`);

// ─── 2. pglite con las columnas reales y el SQL real ─────────────────────────
const { PGlite } = await import(path.join(PGLITE_DIR, "dist/index.js"));
const db = new PGlite();
await db.exec(`
  CREATE TABLE switch_recibos (id uuid, empresa_key text, fecha date, fecha_creacion timestamptz,
    cliente_switch_id int, cliente_codigo text, cliente_nombre text, vendedor_registro text,
    vendedor_cartera text, total numeric(14,4), es_retencion boolean NOT NULL DEFAULT false);
  CREATE TABLE switch_factura_utilidad (id uuid, empresa_key text, secuencial text, fecha date,
    tipo_comprobante text, vendedor text, cliente text, subtotal_con_descuento numeric, pct_utilidad numeric);
  CREATE TABLE switch_facturas (id uuid, empresa_key text, secuencial text, fecha timestamptz, vendedor_nombre text);
  CREATE TABLE vendedores (empresa_key text, nombre text, activo boolean);
  CREATE TABLE comision_vendedor_tasa (vendedor_nombre text, tasa_venta numeric, tasa_cobro numeric, activo boolean);
`);
async function insertar(tabla, filas, cols) {
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const params = [];
    const tuplas = lote.map((f) => "(" + cols.map((c) => { params.push(f[c] ?? null); return "$" + params.length; }).join(",") + ")");
    await db.query(`INSERT INTO ${tabla} (${cols.join(",")}) VALUES ${tuplas.join(",")}`, params);
  }
}
await insertar("switch_recibos", recibos, ["id", "empresa_key", "fecha", "fecha_creacion", "cliente_switch_id", "cliente_codigo", "cliente_nombre", "vendedor_registro", "vendedor_cartera", "total", "es_retencion"]);
await insertar("switch_factura_utilidad", utilidad, ["id", "empresa_key", "secuencial", "fecha", "tipo_comprobante", "vendedor", "cliente", "subtotal_con_descuento", "pct_utilidad"]);
await insertar("switch_facturas", facturas, ["id", "empresa_key", "secuencial", "fecha", "vendedor_nombre"]);
await insertar("vendedores", vendedores, ["empresa_key", "nombre", "activo"]);
await insertar("comision_vendedor_tasa", tasas, ["vendedor_nombre", "tasa_venta", "tasa_cobro", "activo"]);

// El SQL de las migraciones, tal cual (sin GRANT/NOTIFY/COMMENT, que pglite no necesita).
function sqlDeMigracion(archivo) {
  const src = readFileSync(path.join(RAIZ, "supabase/migrations", archivo), "utf8");
  return src
    .replace(/^GRANT .*$/gm, "")
    .replace(/^NOTIFY .*$/gm, "")
    .replace(/^COMMENT ON FUNCTION[\s\S]*?;$/gm, "");
}
await db.exec(sqlDeMigracion("20260703120000_comision_b2b_v5_vendedor_factura.sql"));
await db.exec(sqlDeMigracion("20260911120000_comision_b2b_v6_cobro_quien_registro.sql"));

async function correr(fn, empresa, mes) {
  const r = await db.query(`SELECT ${fn}($1, $2, $3) AS j`, [empresa, YEAR, mes]);
  return r.rows[0].j;
}

// ─── 3. cuadre: v5 local == v5 producción ────────────────────────────────────
async function rpcProd(fn, empresa, mes) {
  const r = await fetch(`${U}/rpc/${fn}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ p_empresa_key: empresa, p_year: YEAR, p_mes: mes }),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${empresa} ${mes}: ${r.status} ${await r.text()}`);
  return r.json();
}
const n2 = (v) => Math.round(Number(v) * 100) / 100;
const porVendedor = (j) => new Map((j.vendedores ?? []).map((v) => [v.vendedor, v]));

let descuadres = 0;
let celdas = 0;
const local5 = {}, local6 = {};
for (const e of EMPRESAS) {
  for (const m of MESES) {
    const [l5, p5, l6] = await Promise.all([correr("comision_b2b_v5", e, m), rpcProd("comision_b2b_v5", e, m), correr("comision_b2b_v6", e, m)]);
    local5[`${e}|${m}`] = l5; local6[`${e}|${m}`] = l6;
    const a = porVendedor(l5), b = porVendedor(p5);
    const nombres = new Set([...a.keys(), ...b.keys()]);
    for (const nom of nombres) {
      const x = a.get(nom), y = b.get(nom);
      for (const campo of ["base", "comision", "base_cobro", "comision_cobro", "comision_total"]) {
        celdas++;
        const vx = n2(x?.[campo] ?? 0), vy = n2(y?.[campo] ?? 0);
        if (vx !== vy) { descuadres++; console.log(`  ✗ ${e} ${m} ${JSON.stringify(nom)} ${campo}: local ${vx} vs prod ${vy}`); }
      }
    }
  }
}
console.log(`\nCUADRE v5 pglite vs v5 producción: ${celdas} celdas, ${descuadres} distintas ${descuadres === 0 ? "✓" : "✗ — LOS DATOS NO SON LOS DE PRODUCCIÓN, el cuadro de abajo NO vale"}`);

// ─── 4. el cuadro: por empresa y vendedor, ene–ago, SOLO la parte de cobro ───
const fmt = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => String(s ?? "").trim();
const acc = new Map(); // empresa|vendedor → {hoy, nuevo, base_hoy, base_nuevo}
const bump = (e, v, k, val) => {
  const key = `${e}|${norm(v)}`;
  const o = acc.get(key) ?? { empresa: e, vendedor: norm(v), hoy: 0, nuevo: 0, venta: 0, base_hoy: 0, base_nuevo: 0 };
  o[k] += val;
  acc.set(key, o);
};
for (const e of EMPRESAS) {
  for (const m of MESES) {
    for (const v of local5[`${e}|${m}`].vendedores) { bump(e, v.vendedor, "hoy", n2(v.comision_cobro)); bump(e, v.vendedor, "base_hoy", n2(v.base_cobro)); bump(e, v.vendedor, "venta", n2(v.comision)); }
    for (const v of local6[`${e}|${m}`].vendedores) { bump(e, v.vendedor, "nuevo", n2(v.comision_cobro)); bump(e, v.vendedor, "base_nuevo", n2(v.base_cobro)); }
  }
}
// La venta no cambia entre v5 y v6: se verifica, no se supone.
let ventaMovida = 0;
for (const e of EMPRESAS) for (const m of MESES) {
  const a = porVendedor(local5[`${e}|${m}`]), b = porVendedor(local6[`${e}|${m}`]);
  for (const nom of new Set([...a.keys(), ...b.keys()])) {
    if (n2(a.get(nom)?.comision ?? 0) !== n2(b.get(nom)?.comision ?? 0)) ventaMovida++;
  }
}
console.log(`La comisión de VENTA entre v5 y v6: ${ventaMovida === 0 ? "0 celdas movidas ✓" : ventaMovida + " celdas MOVIDAS ✗"}`);

const NOMBRE = { vistana: "Vistana", fashion_wear: "Fashion Wear", fashion_shoes: "Fashion Shoes", active_shoes: "Active Shoes", active_wear: "Active Wear", joystep: "Joystep" };
console.log(`\n══ COMISIÓN DE COBRO ene–ago ${YEAR} · hoy (cartera) → nuevo (quien registró) ══`);
const filas = [...acc.values()].filter((o) => o.hoy !== 0 || o.nuevo !== 0).sort((a, b) => a.empresa.localeCompare(b.empresa) || (b.hoy + b.nuevo) - (a.hoy + a.nuevo));
let empAct = null;
const totEmp = new Map();
const totVend = new Map();
for (const o of filas) {
  if (o.empresa !== empAct) { empAct = o.empresa; console.log(`\n${NOMBRE[empAct]}`); console.log("  vendedor".padEnd(26) + "hoy".padStart(12) + "nuevo".padStart(12) + "diferencia".padStart(12)); }
  const d = n2(o.nuevo - o.hoy);
  console.log("  " + o.vendedor.padEnd(24) + fmt(o.hoy).padStart(12) + fmt(o.nuevo).padStart(12) + fmt(d).padStart(12));
  const te = totEmp.get(o.empresa) ?? { hoy: 0, nuevo: 0 }; te.hoy += o.hoy; te.nuevo += o.nuevo; totEmp.set(o.empresa, te);
  const tv = totVend.get(o.vendedor) ?? { hoy: 0, nuevo: 0 }; tv.hoy += o.hoy; tv.nuevo += o.nuevo; totVend.set(o.vendedor, tv);
}
console.log("\n── Total por empresa ──");
let gh = 0, gn = 0;
for (const [e, t] of totEmp) { console.log("  " + NOMBRE[e].padEnd(24) + fmt(t.hoy).padStart(12) + fmt(t.nuevo).padStart(12) + fmt(n2(t.nuevo - t.hoy)).padStart(12)); gh += t.hoy; gn += t.nuevo; }
console.log("  " + "GRUPO".padEnd(24) + fmt(gh).padStart(12) + fmt(gn).padStart(12) + fmt(n2(gn - gh)).padStart(12));
console.log("\n── Total por vendedor (las 6 empresas) ──");
for (const [v, t] of [...totVend].sort((a, b) => (b[1].nuevo - b[1].hoy) - (a[1].nuevo - a[1].hoy))) {
  console.log("  " + v.padEnd(24) + fmt(t.hoy).padStart(12) + fmt(t.nuevo).padStart(12) + fmt(n2(t.nuevo - t.hoy)).padStart(12));
}

// ─── 4b. lo que de verdad se PAGA: sin DEFAULT ni Daniel («no me autopago») ──
// La lista vive en src/lib/comisiones/sin-pago.ts; acá se lee del archivo para
// no tener dos copias.
const sinPagoSrc = readFileSync(path.join(RAIZ, "src/lib/comisiones/sin-pago.ts"), "utf8");
const SIN_PAGO = JSON.parse(sinPagoSrc.match(/VENDEDORES_SIN_PAGO[^=]*=\s*(\[[^\]]*\])/)[1]).map((v) => v.trim().toUpperCase());
const sePaga = (v) => !SIN_PAGO.includes(norm(v).toUpperCase());
let pagHoy = 0, pagNuevo = 0, noPagHoy = 0, noPagNuevo = 0;
for (const o of filas) {
  if (sePaga(o.vendedor)) { pagHoy += o.hoy; pagNuevo += o.nuevo; } else { noPagHoy += o.hoy; noPagNuevo += o.nuevo; }
}
console.log(`\n── Comisión de COBRO ene–ago ${YEAR}: a pagar vs. se calcula pero no se paga (${SIN_PAGO.join(" · ")}) ──`);
console.log("  " + "".padEnd(24) + "hoy".padStart(12) + "nuevo".padStart(12) + "diferencia".padStart(12));
console.log("  " + "A PAGAR".padEnd(24) + fmt(pagHoy).padStart(12) + fmt(pagNuevo).padStart(12) + fmt(n2(pagNuevo - pagHoy)).padStart(12));
console.log("  " + "no se paga (se muestra)".padEnd(24) + fmt(noPagHoy).padStart(12) + fmt(noPagNuevo).padStart(12) + fmt(n2(noPagNuevo - noPagHoy)).padStart(12));

// ─── 4c. ¿la VENTA todavía cae al vendedor de cartera en algún documento? ────
// El CTE ventas (igual en v5 y v6) usa switch_factura_utilidad.vendedor (el
// dueño de cartera) SOLO cuando el documento no está en switch_facturas.
const secuencialesFact = new Set(facturas.map((f) => `${f.empresa_key}|${f.secuencial}`));
const sinMatch = utilidad.filter((u) => !secuencialesFact.has(`${u.empresa_key}|${u.secuencial}`));
console.log(`\nDocumentos de utilidad ${YEAR} (ene–ago) que caerían al fallback de cartera en VENTAS: ${sinMatch.length} de ${utilidad.length}`);

// ─── 5. recibos afectados: los que cambian de mano ───────────────────────────
const comisionan = recibos.filter((r) => !r.es_retencion && (r.cliente_codigo ?? "") !== "TCKCTA" && !/multi fashion holding/i.test(r.cliente_nombre ?? ""));
const cambian = comisionan.filter((r) => norm(r.vendedor_registro) !== norm(r.vendedor_cartera));
const plataCambia = cambian.reduce((a, r) => a + Number(r.total), 0);
console.log(`\nRecibos que comisionan en ${YEAR} (ene–ago): ${comisionan.length} · cambian de mano: ${cambian.length} (${fmt(plataCambia)} de base)`);
const porEmpCambia = {};
for (const r of cambian) porEmpCambia[r.empresa_key] = (porEmpCambia[r.empresa_key] ?? 0) + 1;
console.log("  por empresa: " + Object.entries(porEmpCambia).map(([e, n]) => `${NOMBRE[e]} ${n}`).join(" · "));
const defaultCobra = comisionan.filter((r) => norm(r.vendedor_registro) === "DEFAULT");
console.log(`  registrados por DEFAULT (oficina): ${defaultCobra.length} recibos, base ${fmt(defaultCobra.reduce((a, r) => a + Number(r.total), 0))}`);

writeFileSync(path.join(OUT, "_cuadro.json"), JSON.stringify({ cuadre_v5: { celdas, descuadres }, ventaMovida, filas, totEmp: [...totEmp], totVend: [...totVend] }, null, 2));
await db.close();
