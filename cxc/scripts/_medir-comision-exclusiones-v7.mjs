#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — v6 (sin exclusiones) vs v7 (con comision_exclusion) sobre los
// datos REALES de 2026, corriendo el SQL DE VERDAD de las tres migraciones
// (v5, v6, v7) en un Postgres local (pglite). SOLO LECTURA contra producción.
//
// Por qué así: la v7 y la tabla todavía no están en producción (la DDL la
// corre Daniel) y es plata que se le paga a gente. Lo que hay que probar es
// que EL ARCHIVO que se va a aplicar, con LAS exclusiones que carga, mueve
// exactamente a quien Daniel dijo (Reinaldo en Active Shoes y Active Wear) y a
// nadie más.
//
// Pasos, cada uno con su cuadre:
//   1. Baja recibos / utilidad / facturas (con cliente_switch_id) / clientes de
//      Switch / vendedores / tasas de 2026 para las 6 del grupo (paginado y
//      verificado contra count=exact).
//   2. Los carga en pglite con las MISMAS columnas y corre los tres .sql del
//      repo sin editarlos (la v7 crea la tabla y carga las exclusiones).
//   3. CUADRE: la v5 de pglite contra la RPC v5 de PRODUCCIÓN, celda por
//      celda. Si no dan lo mismo, los datos no son los de producción.
//   4. El cuadro v6 → v7 por empresa y vendedor, y la lista de quién se movió.
//
// Uso:
//   PGLITE_DIR=/tmp/v6/node_modules/@electric-sql/pglite \
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-comision-exclusiones-v7.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(new URL(".", import.meta.url).pathname, "..");
const OUT = process.env.OUT ?? "/tmp/v7/datos";
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const YEAR = 2026;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HASTA = `${YEAR}-10-01`;

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
  `select=id,empresa_key,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,cliente_nombre,vendedor_registro,vendedor_cartera,total,es_retencion&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${HASTA}`, "id");
const utilidad = await cargar("utilidad", "switch_factura_utilidad",
  `select=id,empresa_key,secuencial,fecha,tipo_comprobante,vendedor,cliente,subtotal_con_descuento,pct_utilidad&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${HASTA}`, "id");
// ±2 días de ventana en doc_vendedor → se trae un poco más ancho. v7 necesita
// el cliente_switch_id para resolver el código del cliente.
const facturas = await cargar("facturas", "switch_facturas",
  `select=id,empresa_key,secuencial,fecha,vendedor_nombre,cliente_switch_id&empresa_key=in.(${EMP})&fecha=gte.${YEAR - 1}-12-28T00:00:00Z&fecha=lt.${YEAR}-10-05T00:00:00Z`, "id");
const clientes = await cargar("clientes", "switch_clientes",
  `select=id,empresa_key,cliente_switch_id,codigo,nombre&empresa_key=in.(${EMP})`, "id");
const vendedores = await cargar("vendedores", "vendedores", "select=empresa_key,nombre,activo", "empresa_key,nombre");
const tasas = await cargar("tasas", "comision_vendedor_tasa", "select=vendedor_nombre,tasa_venta,tasa_cobro,activo", "vendedor_nombre");
console.log(`datos: recibos ${recibos.length} · utilidad ${utilidad.length} · facturas ${facturas.length} · clientes ${clientes.length} · vendedores ${vendedores.length} · tasas ${tasas.length}`);

// ─── 2. pglite con las columnas reales y el SQL real ─────────────────────────
const { PGlite } = await import(path.join(PGLITE_DIR, "dist/index.js"));
const db = new PGlite();
await db.exec(`
  CREATE ROLE service_role NOLOGIN;
  CREATE TABLE switch_recibos (id uuid, empresa_key text, fecha date, fecha_creacion timestamptz,
    cliente_switch_id int, cliente_codigo text, cliente_nombre text, vendedor_registro text,
    vendedor_cartera text, total numeric(14,4), es_retencion boolean NOT NULL DEFAULT false);
  CREATE TABLE switch_factura_utilidad (id uuid, empresa_key text, secuencial text, fecha date,
    tipo_comprobante text, vendedor text, cliente text, subtotal_con_descuento numeric, pct_utilidad numeric);
  CREATE TABLE switch_facturas (id uuid, empresa_key text, secuencial text, fecha timestamptz, vendedor_nombre text, cliente_switch_id int);
  CREATE TABLE switch_clientes (id uuid, empresa_key text, cliente_switch_id int, codigo text, nombre text);
  CREATE TABLE vendedores (empresa_key text, nombre text, activo boolean);
  CREATE TABLE comision_vendedor_tasa (vendedor_nombre text, tasa_venta numeric, tasa_cobro numeric, activo boolean, updated_at timestamptz);
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
await insertar("switch_facturas", facturas, ["id", "empresa_key", "secuencial", "fecha", "vendedor_nombre", "cliente_switch_id"]);
await insertar("switch_clientes", clientes, ["id", "empresa_key", "cliente_switch_id", "codigo", "nombre"]);
await insertar("vendedores", vendedores, ["empresa_key", "nombre", "activo"]);
await insertar("comision_vendedor_tasa", tasas, ["vendedor_nombre", "tasa_venta", "tasa_cobro", "activo"]);

// El SQL de las migraciones, tal cual (sin GRANT/NOTIFY, que pglite no necesita).
function sqlDeMigracion(archivo) {
  const src = readFileSync(path.join(RAIZ, "supabase/migrations", archivo), "utf8");
  return src.replace(/^GRANT .*$/gm, "").replace(/^NOTIFY .*$/gm, "");
}
await db.exec(sqlDeMigracion("20260703120000_comision_b2b_v5_vendedor_factura.sql"));
await db.exec(sqlDeMigracion("20260911120000_comision_b2b_v6_cobro_quien_registro.sql"));
await db.exec(sqlDeMigracion("20260912120000_comision_exclusion_v7.sql"));

// «pon a Reinaldo 1 y 1»: la migración trae un UPDATE idempotente. Se mide si
// tocó algo comparando las tasas de producción (cargadas arriba) con las que
// quedaron después de correr el archivo.
const tasasDespues = (await db.query("SELECT vendedor_nombre, tasa_venta, tasa_cobro FROM comision_vendedor_tasa WHERE vendedor_nombre IN ('REINALDO ESPINOSA','REYNALDO ESPINOSA') ORDER BY 1")).rows;
for (const t of tasasDespues) {
  const antes = tasas.find((x) => x.vendedor_nombre === t.vendedor_nombre);
  const cambio = Number(antes.tasa_venta) !== Number(t.tasa_venta) || Number(antes.tasa_cobro) !== Number(t.tasa_cobro);
  console.log(`tasa ${t.vendedor_nombre}: producción ${antes.tasa_venta}/${antes.tasa_cobro} → migración ${t.tasa_venta}/${t.tasa_cobro} ${cambio ? "(CAMBIA)" : "(ya estaba en 1 y 1: no cambia)"}`);
}
const exclusiones = (await db.query("SELECT empresa_key, cliente_codigo, vendedor FROM comision_exclusion WHERE activa ORDER BY 1,2,3")).rows;
console.log(`exclusiones cargadas por la migración: ${exclusiones.length} filas · ${new Set(exclusiones.map((e) => e.empresa_key + "|" + e.cliente_codigo)).size} pares (empresa, cliente)`);
// Cada código de la migración existe en switch_clientes de SU empresa.
for (const e of exclusiones) {
  const hit = clientes.find((c) => c.empresa_key === e.empresa_key && (c.codigo ?? "").toUpperCase() === e.cliente_codigo);
  if (!hit) throw new Error(`exclusión ${e.empresa_key} ${e.cliente_codigo}: el código NO existe en switch_clientes`);
}
console.log("los códigos de las exclusiones existen todos en switch_clientes de su empresa ✓");

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
const local6 = {}, local7 = {};
for (const e of EMPRESAS) {
  for (const m of MESES) {
    const [l5, p5, l6, l7] = await Promise.all([correr("comision_b2b_v5", e, m), rpcProd("comision_b2b_v5", e, m), correr("comision_b2b_v6", e, m), correr("comision_b2b_v7", e, m)]);
    local6[`${e}|${m}`] = l6; local7[`${e}|${m}`] = l7;
    const a = porVendedor(l5), b = porVendedor(p5);
    for (const nom of new Set([...a.keys(), ...b.keys()])) {
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

// ─── 4. el cuadro: v6 → v7 por empresa y vendedor, ene–sep ──────────────────
const fmt = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => String(s ?? "").trim();
const NOMBRE = { vistana: "Vistana", fashion_wear: "Fashion Wear", fashion_shoes: "Fashion Shoes", active_shoes: "Active Shoes", active_wear: "Active Wear", joystep: "Joystep" };
const acc = new Map(); // empresa|vendedor
const bump = (e, v, k, val) => {
  const key = `${e}|${norm(v)}`;
  const o = acc.get(key) ?? { empresa: e, vendedor: norm(v), venta6: 0, venta7: 0, cobro6: 0, cobro7: 0, total6: 0, total7: 0 };
  o[k] += val;
  acc.set(key, o);
};
for (const e of EMPRESAS) for (const m of MESES) {
  for (const v of local6[`${e}|${m}`].vendedores) { bump(e, v.vendedor, "venta6", n2(v.comision)); bump(e, v.vendedor, "cobro6", n2(v.comision_cobro)); bump(e, v.vendedor, "total6", n2(v.comision_total)); }
  for (const v of local7[`${e}|${m}`].vendedores) { bump(e, v.vendedor, "venta7", n2(v.comision)); bump(e, v.vendedor, "cobro7", n2(v.comision_cobro)); bump(e, v.vendedor, "total7", n2(v.comision_total)); }
}

console.log(`\n══ COMISIÓN ene–sep ${YEAR} · v6 (sin exclusiones) → v7 (con las ${exclusiones.length} filas cargadas) ══`);
const filas = [...acc.values()].filter((o) => o.total6 !== 0 || o.total7 !== 0).sort((a, b) => a.empresa.localeCompare(b.empresa) || (b.total6 + b.total7) - (a.total6 + a.total7));
let empAct = null;
const movidos = [];
for (const o of filas) {
  if (o.empresa !== empAct) {
    empAct = o.empresa;
    console.log(`\n${NOMBRE[empAct]}`);
    console.log("  vendedor".padEnd(26) + "venta v6".padStart(11) + "venta v7".padStart(11) + "cobro v6".padStart(11) + "cobro v7".padStart(11) + "total v6".padStart(11) + "total v7".padStart(11) + "dif".padStart(11));
  }
  const d = n2(o.total7 - o.total6);
  if (d !== 0 || n2(o.venta7 - o.venta6) !== 0 || n2(o.cobro7 - o.cobro6) !== 0) movidos.push({ ...o, dif: d });
  console.log("  " + o.vendedor.padEnd(24) + fmt(o.venta6).padStart(11) + fmt(o.venta7).padStart(11) + fmt(o.cobro6).padStart(11) + fmt(o.cobro7).padStart(11) + fmt(o.total6).padStart(11) + fmt(o.total7).padStart(11) + fmt(d).padStart(11));
}

console.log("\n── Quién se movió (cualquier celda de venta o cobro distinta entre v6 y v7) ──");
for (const o of movidos) {
  console.log(`  ${NOMBRE[o.empresa].padEnd(14)} ${o.vendedor.padEnd(22)} venta ${fmt(n2(o.venta7 - o.venta6)).padStart(10)} · cobro ${fmt(n2(o.cobro7 - o.cobro6)).padStart(10)} · total ${fmt(o.dif).padStart(10)}`);
}
const esperado = (o) => ["active_shoes", "active_wear"].includes(o.empresa) && /^RE[IY]NALDO ESPINOSA$/.test(o.vendedor.toUpperCase());
const inesperados = movidos.filter((o) => !esperado(o));
console.log(inesperados.length === 0
  ? "  Solo Reinaldo en Active Shoes y Active Wear ✓ — nadie más se movió"
  : `  ✗ SE MOVIÓ ALGUIEN MÁS: ${inesperados.map((o) => `${o.empresa}/${o.vendedor}`).join(", ")}`);
const sube = movidos.filter((o) => o.dif > 0);
console.log(sube.length === 0 ? "  Nadie sube ✓ (una exclusión solo puede bajar)" : `  ✗ ALGUIEN SUBE: ${sube.map((o) => `${o.empresa}/${o.vendedor} +${fmt(o.dif)}`).join(", ")}`);

// Total por empresa y grupo
console.log("\n── Total por empresa (comisión total, ene–sep) ──");
const totEmp = new Map();
for (const o of filas) { const t = totEmp.get(o.empresa) ?? { v6: 0, v7: 0 }; t.v6 += o.total6; t.v7 += o.total7; totEmp.set(o.empresa, t); }
let g6 = 0, g7 = 0;
for (const e of EMPRESAS) { const t = totEmp.get(e) ?? { v6: 0, v7: 0 }; console.log("  " + NOMBRE[e].padEnd(24) + fmt(t.v6).padStart(12) + fmt(t.v7).padStart(12) + fmt(n2(t.v7 - t.v6)).padStart(12)); g6 += t.v6; g7 += t.v7; }
console.log("  " + "GRUPO".padEnd(24) + fmt(g6).padStart(12) + fmt(g7).padStart(12) + fmt(n2(g7 - g6)).padStart(12));

// ─── 5. qué documentos y recibos quedaron fuera ──────────────────────────────
const fuera = await db.query(`
  WITH docs AS (
    SELECT f.empresa_key, f.secuencial, f.fecha, f.cliente, f.tipo_comprobante, f.subtotal_con_descuento, f.pct_utilidad,
           COALESCE(NULLIF(TRIM(sf.vendedor_nombre), ''), f.vendedor) AS vendedor, UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_factura_utilidad f
    LEFT JOIN LATERAL (
      SELECT sf.vendedor_nombre, sf.cliente_switch_id FROM switch_facturas sf
      WHERE sf.empresa_key = f.empresa_key AND sf.secuencial = f.secuencial ORDER BY sf.fecha DESC LIMIT 1
    ) sf ON true
    LEFT JOIN switch_clientes sc ON sc.empresa_key = f.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
  )
  SELECT d.empresa_key, d.vendedor, d.cliente_codigo, COUNT(*) AS docs,
         SUM(CASE WHEN d.tipo_comprobante = 'Nota de Crédito' THEN -ABS(d.subtotal_con_descuento)
                  WHEN d.tipo_comprobante = 'Factura' AND d.pct_utilidad > 20 THEN ABS(d.subtotal_con_descuento) ELSE 0 END) AS base
  FROM docs d JOIN comision_exclusion ce ON ce.activa AND ce.empresa_key = d.empresa_key AND ce.cliente_codigo = d.cliente_codigo AND ce.vendedor = UPPER(TRIM(d.vendedor))
  GROUP BY 1,2,3 ORDER BY 1,2,3`);
console.log("\n── VENTA que quedó fuera (documentos de utilidad 2026 que cruzan con una exclusión) ──");
for (const r of fuera.rows) console.log(`  ${NOMBRE[r.empresa_key].padEnd(14)} ${r.vendedor.padEnd(20)} ${r.cliente_codigo.padEnd(7)} ${String(r.docs).padStart(3)} docs · base ${fmt(Number(r.base)).padStart(12)}`);
const fueraCobro = await db.query(`
  SELECT r.empresa_key, TRIM(r.vendedor_registro) AS vendedor, UPPER(TRIM(r.cliente_codigo)) AS cliente_codigo, COUNT(*) AS recibos, SUM(r.total) AS base
  FROM switch_recibos r JOIN comision_exclusion ce ON ce.activa AND ce.empresa_key = r.empresa_key
    AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)) AND ce.vendedor = UPPER(TRIM(r.vendedor_registro))
  WHERE r.es_retencion = false GROUP BY 1,2,3 ORDER BY 1,2,3`);
console.log("\n── COBRO que quedó fuera (recibos 2026 que cruzan con una exclusión) ──");
for (const r of fueraCobro.rows) console.log(`  ${NOMBRE[r.empresa_key].padEnd(14)} ${r.vendedor.padEnd(20)} ${r.cliente_codigo.padEnd(7)} ${String(r.recibos).padStart(3)} recibos · base ${fmt(Number(r.base)).padStart(12)}`);

// ¿Algún cliente excluido tuvo venta o cobro con OTRO vendedor? (ese sí comisiona)
const otros = await db.query(`
  SELECT r.empresa_key, UPPER(TRIM(r.cliente_codigo)) AS cliente_codigo, TRIM(r.vendedor_registro) AS vendedor, COUNT(*) AS recibos
  FROM switch_recibos r
  WHERE r.es_retencion = false AND EXISTS (SELECT 1 FROM comision_exclusion ce WHERE ce.activa AND ce.empresa_key = r.empresa_key AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)))
    AND NOT EXISTS (SELECT 1 FROM comision_exclusion ce WHERE ce.activa AND ce.empresa_key = r.empresa_key AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)) AND ce.vendedor = UPPER(TRIM(r.vendedor_registro)))
  GROUP BY 1,2,3 ORDER BY 1,2,3`);
console.log("\n── Cobros a clientes excluidos registrados por OTRO vendedor (siguen comisionando, a propósito) ──");
if (otros.rows.length === 0) console.log("  ninguno en 2026");
for (const r of otros.rows) console.log(`  ${NOMBRE[r.empresa_key].padEnd(14)} ${r.cliente_codigo.padEnd(7)} ${r.vendedor.padEnd(20)} ${r.recibos} recibos`);

// ─── 6. Reinaldo al 1% de venta: qué vale y qué valdría al 0,5% ─────────────
// Contexto para el pedido «pon a Reinaldo 1 y 1»: la comisión de VENTA de 2026
// ya sale al 1% (así está la tasa en producción desde el 26-ago). Si la tasa
// fuera 0,5%, sería la mitad.
const reinaldoVenta = filas.filter((o) => /^RE[IY]NALDO ESPINOSA$/.test(o.vendedor.toUpperCase()));
const ventaAl1 = reinaldoVenta.reduce((a, o) => a + o.venta7, 0);
console.log(`
── Reinaldo, comisión de VENTA ene–sep ${YEAR} (v7, las dos grafías, 4 empresas) ──`);
console.log(`  al 1% (como está hoy y como manda la migración): ${fmt(n2(ventaAl1))}`);
console.log(`  si estuviera al 0,5% sería:                       ${fmt(n2(ventaAl1 / 2))}  → diferencia ${fmt(n2(ventaAl1 / 2))}`);
console.log(`  efecto del UPDATE de la migración sobre 2026:      0,00 (la tasa ya era 1 y 1)`);

writeFileSync(path.join(OUT, "_cuadro.json"), JSON.stringify({ cuadre_v5: { celdas, descuadres }, exclusiones: exclusiones.length, filas, movidos, inesperados: inesperados.length, totEmp: [...totEmp] }, null, 2));
await db.close();
