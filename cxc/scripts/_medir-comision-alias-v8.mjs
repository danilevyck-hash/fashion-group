#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — v7 (una fila por grafía) vs v8 (alias: una persona, una fila;
// exclusiones con Venta y Cobro por separado) sobre los datos REALES de 2026,
// corriendo el SQL DE VERDAD de las cuatro migraciones (v5, v6, v7, v8) en un
// Postgres local (pglite). SOLO LECTURA contra producción.
//
// Lo que hay que probar, porque es plata que se le paga a gente:
//   · Que la v8 mueve EXACTAMENTE lo que Daniel dijo —las cuatro grafías de
//     Reinaldo colapsan en «REYNALDO ESPINOSA», AGUAS en «REY STOUTE AGUAS»—
//     y que, por persona, NADIE cambia de número salvo por la fila de tasa
//     con cobro 0 % que se corrige.
//   · Que las 17 exclusiones quedan en 11 (una por persona) con las dos
//     casillas marcadas, y que restan lo mismo que antes.
//
// Pasos, cada uno con su cuadre:
//   1. Baja recibos / utilidad / facturas / clientes / vendedores / tasas de
//      2026 para las 6 del grupo (paginado y verificado contra count=exact),
//      más los recibos 2023-2025 de Active Wear (donde vive la grafía
//      «REINDALDO ESPINOSA », la de la tasa con cobro 0 %).
//   2. Los carga en pglite con las MISMAS columnas, corre v5+v6+v7 y calcula
//      la v7 para cada (empresa, mes); DESPUÉS corre la v8 (que colapsa tasas
//      y exclusiones) y calcula la v8.
//   3. CUADRE: la v7 de pglite contra la RPC v7 de PRODUCCIÓN (ya aplicada),
//      celda por celda. Si no dan lo mismo, los datos no son los de producción.
//   4. El cuadro v7 → v8 por empresa y PERSONA (la v7 se agrupa post-hoc con
//      el mismo alias), y la lista de cualquier celda que cambie.
//
// Uso:
//   PGLITE_DIR=/tmp/v6/node_modules/@electric-sql/pglite \
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-comision-alias-v8.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

const RAIZ = path.resolve(new URL(".", import.meta.url).pathname, "..");
const OUT = process.env.OUT ?? "/tmp/v8/datos";
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
const SEL_RECIBOS = "select=id,empresa_key,fecha,fecha_creacion,cliente_switch_id,cliente_codigo,cliente_nombre,vendedor_registro,vendedor_cartera,total,es_retencion";
const recibos = await cargar("recibos", "switch_recibos",
  `${SEL_RECIBOS}&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${HASTA}`, "id");
// Active Wear 2023-2025: donde está «REINDALDO ESPINOSA » (la fila de tasa con cobro 0 %).
const recibosAWViejos = await cargar("recibos_aw_viejos", "switch_recibos",
  `${SEL_RECIBOS}&empresa_key=eq.active_wear&fecha=gte.2023-01-01&fecha=lt.${YEAR}-01-01`, "id");
const utilidad = await cargar("utilidad", "switch_factura_utilidad",
  `select=id,empresa_key,secuencial,fecha,tipo_comprobante,vendedor,cliente,subtotal_con_descuento,pct_utilidad&empresa_key=in.(${EMP})&fecha=gte.${YEAR}-01-01&fecha=lt.${HASTA}`, "id");
const facturas = await cargar("facturas", "switch_facturas",
  `select=id,empresa_key,secuencial,fecha,vendedor_nombre,cliente_switch_id&empresa_key=in.(${EMP})&fecha=gte.${YEAR - 1}-12-28T00:00:00Z&fecha=lt.${YEAR}-10-05T00:00:00Z`, "id");
const clientes = await cargar("clientes", "switch_clientes",
  `select=id,empresa_key,cliente_switch_id,codigo,nombre&empresa_key=in.(${EMP})`, "id");
const vendedores = await cargar("vendedores", "vendedores", "select=empresa_key,nombre,activo", "empresa_key,nombre");
const tasas = await cargar("tasas", "comision_vendedor_tasa", "select=vendedor_nombre,tasa_venta,tasa_cobro,activo", "vendedor_nombre");
const exclusionesProd = await cargar("exclusiones", "comision_exclusion", "select=id,empresa_key,cliente_codigo,vendedor,activa,creado_por,creado_en,desactivado_por,desactivado_en", "id");
const descuentos = await cargar("descuentos", "comision_descuentos_fijos", "select=id,empresa_key,concepto,monto,vendedor_nombre,activo", "id");
console.log(`datos: recibos ${recibos.length} (+${recibosAWViejos.length} de Active Wear 2023-25) · utilidad ${utilidad.length} · facturas ${facturas.length} · clientes ${clientes.length} · vendedores ${vendedores.length} · tasas ${tasas.length} · exclusiones ${exclusionesProd.length} · descuentos ${descuentos.length}`);

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
  CREATE TABLE comision_vendedor_tasa (vendedor_nombre text PRIMARY KEY, tasa_venta numeric(6,4), tasa_cobro numeric(6,4), activo boolean, updated_at timestamptz);
  CREATE TABLE comision_descuentos_fijos (id uuid PRIMARY KEY, vendedor_nombre text NOT NULL, empresa_key text NOT NULL, concepto text NOT NULL,
    monto numeric(12,2), activo boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    UNIQUE (vendedor_nombre, empresa_key, concepto));
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
const COLS_RECIBOS = ["id", "empresa_key", "fecha", "fecha_creacion", "cliente_switch_id", "cliente_codigo", "cliente_nombre", "vendedor_registro", "vendedor_cartera", "total", "es_retencion"];
await insertar("switch_recibos", recibos, COLS_RECIBOS);
await insertar("switch_recibos", recibosAWViejos, COLS_RECIBOS);
await insertar("switch_factura_utilidad", utilidad, ["id", "empresa_key", "secuencial", "fecha", "tipo_comprobante", "vendedor", "cliente", "subtotal_con_descuento", "pct_utilidad"]);
await insertar("switch_facturas", facturas, ["id", "empresa_key", "secuencial", "fecha", "vendedor_nombre", "cliente_switch_id"]);
await insertar("switch_clientes", clientes, ["id", "empresa_key", "cliente_switch_id", "codigo", "nombre"]);
await insertar("vendedores", vendedores, ["empresa_key", "nombre", "activo"]);
await insertar("comision_vendedor_tasa", tasas, ["vendedor_nombre", "tasa_venta", "tasa_cobro", "activo"]);
await insertar("comision_descuentos_fijos", descuentos, ["id", "empresa_key", "concepto", "monto", "vendedor_nombre", "activo"]);

// El SQL de las migraciones, tal cual (sin GRANT/NOTIFY, que pglite no necesita).
function sqlDeMigracion(archivo) {
  const src = readFileSync(path.join(RAIZ, "supabase/migrations", archivo), "utf8");
  return src.replace(/^GRANT .*$/gm, "").replace(/^NOTIFY .*$/gm, "");
}
await db.exec(sqlDeMigracion("20260703120000_comision_b2b_v5_vendedor_factura.sql"));
await db.exec(sqlDeMigracion("20260911120000_comision_b2b_v6_cobro_quien_registro.sql"));
await db.exec(sqlDeMigracion("20260912120000_comision_exclusion_v7.sql"));
// La v7 cargó sus 17 filas; se reemplazan por las de PRODUCCIÓN tal cual (ids,
// fechas y estado), para que la migración v8 actúe sobre lo que hay de verdad.
await db.exec(`UPDATE comision_exclusion SET activa = false, desactivado_por = 'medicion', desactivado_en = now() WHERE activa`);
await db.exec(`DELETE FROM comision_exclusion`); // solo en la copia local de la medición
for (const e of exclusionesProd) {
  await db.query(
    `INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, activa, creado_por, creado_en, desactivado_por, desactivado_en)
     OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.empresa_key, e.cliente_codigo, e.vendedor, e.activa, e.creado_por, e.creado_en, e.desactivado_por, e.desactivado_en],
  );
}

async function correr(fn, empresa, year, mes) {
  const r = await db.query(`SELECT ${fn}($1, $2, $3) AS j`, [empresa, year, mes]);
  return r.rows[0].j;
}
const n2 = (v) => Math.round(Number(v) * 100) / 100;
const porVendedor = (j) => new Map((j.vendedores ?? []).map((v) => [v.vendedor, v]));

// La v7 ANTES de que la v8 toque tasas y exclusiones.
const local7 = {};
for (const e of EMPRESAS) for (const m of MESES) local7[`${e}|${YEAR}|${m}`] = await correr("comision_b2b_v7", e, YEAR, m);
for (const m of [1,2,3,4,5,6,7,8,9,10,11,12]) for (const y of [2023, 2024, 2025]) local7[`active_wear|${y}|${m}`] = await correr("comision_b2b_v7", "active_wear", y, m);

// ─── la v8 ────────────────────────────────────────────────────────────────────
await db.exec(sqlDeMigracion("20260913120000_comision_vendedor_alias_v8.sql"));

const alias = (await db.query("SELECT nombre_switch, vendedor_canonico FROM comision_vendedor_alias ORDER BY 1")).rows;
console.log(`\nalias cargados por la migración: ${alias.map((a) => `${a.nombre_switch} → ${a.vendedor_canonico}`).join(" · ")}`);
const canon = (s) => {
  const k = String(s ?? "").trim().toUpperCase();
  return alias.find((a) => a.nombre_switch === k)?.vendedor_canonico ?? String(s ?? "").trim();
};

const tasasDespues = (await db.query("SELECT vendedor_nombre, tasa_venta, tasa_cobro, activo FROM comision_vendedor_tasa ORDER BY 1")).rows;
console.log(`\n── comision_vendedor_tasa: ${tasas.length} filas → ${tasasDespues.length} ──`);
for (const t of tasas) console.log(`  antes   ${JSON.stringify(t.vendedor_nombre).padEnd(24)} ${t.tasa_venta} / ${t.tasa_cobro}`);
for (const t of tasasDespues) console.log(`  después ${JSON.stringify(t.vendedor_nombre).padEnd(24)} ${t.tasa_venta} / ${t.tasa_cobro}`);
const reynaldo = tasasDespues.find((t) => t.vendedor_nombre === "REYNALDO ESPINOSA");
if (!reynaldo || Number(reynaldo.tasa_venta) !== 0.01 || Number(reynaldo.tasa_cobro) !== 0.01) throw new Error("REYNALDO ESPINOSA no quedó en 1 % / 1 %");
if (tasasDespues.some((t) => /^RE[IY]N?DALDO|^REINALDO|^AGUAS$/.test(t.vendedor_nombre))) throw new Error("quedó una grafía en la tabla de tasas");
console.log("  REYNALDO ESPINOSA = 1 % / 1 %, sin grafías ✓");

const exclDespues = (await db.query("SELECT id, empresa_key, cliente_codigo, vendedor, activa, excluye_venta, excluye_cobro, desactivado_por FROM comision_exclusion ORDER BY id")).rows;
const activas = exclDespues.filter((e) => e.activa);
console.log(`\n── comision_exclusion: ${exclusionesProd.filter((e) => e.activa).length} activas → ${activas.length} activas (${exclDespues.length} filas en total, nada se borró) ──`);
for (const e of exclDespues) console.log(`  #${String(e.id).padStart(2)} ${e.empresa_key.padEnd(13)} ${e.cliente_codigo.padEnd(6)} ${e.vendedor.padEnd(18)} ${e.activa ? "activa " : "apagada"} venta=${e.excluye_venta} cobro=${e.excluye_cobro}${e.desactivado_por ? ` (por ${e.desactivado_por})` : ""}`);
const pares = new Set(activas.map((e) => `${e.empresa_key}|${e.cliente_codigo}`));
if (activas.length !== 11 || pares.size !== 11) throw new Error(`esperaba 11 activas / 11 pares, hay ${activas.length} / ${pares.size}`);
if (!activas.every((e) => e.excluye_venta && e.excluye_cobro)) throw new Error("alguna activa no tiene las dos casillas marcadas");
if (!activas.every((e) => e.vendedor === "REYNALDO ESPINOSA")) throw new Error("alguna activa no quedó a nombre de REYNALDO ESPINOSA");
console.log("  11 activas, 11 pares (empresa, cliente), todas REYNALDO ESPINOSA con Venta y Cobro marcados ✓");

const descDespues = (await db.query("SELECT empresa_key, concepto, monto, vendedor_nombre FROM comision_descuentos_fijos ORDER BY 1,2")).rows;
console.log(`\n── comision_descuentos_fijos ──`);
for (const d of descDespues) console.log(`  ${d.empresa_key.padEnd(13)} ${d.concepto.padEnd(22)} ${String(d.monto).padStart(8)}  ${d.vendedor_nombre}`);
if (!descDespues.every((d) => d.vendedor_nombre === canon(d.vendedor_nombre))) throw new Error("un descuento quedó con grafía");

const local8 = {};
for (const e of EMPRESAS) for (const m of MESES) local8[`${e}|${YEAR}|${m}`] = await correr("comision_b2b_v8", e, YEAR, m);
for (const m of [1,2,3,4,5,6,7,8,9,10,11,12]) for (const y of [2023, 2024, 2025]) local8[`active_wear|${y}|${m}`] = await correr("comision_b2b_v8", "active_wear", y, m);

// ─── 3. cuadre: v7 local == v7 producción ────────────────────────────────────
async function rpcProd(fn, empresa, mes) {
  const r = await fetch(`${U}/rpc/${fn}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ p_empresa_key: empresa, p_year: YEAR, p_mes: mes }),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${empresa} ${mes}: ${r.status} ${await r.text()}`);
  return r.json();
}
let descuadres = 0;
let celdas = 0;
for (const e of EMPRESAS) {
  for (const m of MESES) {
    const p7 = await rpcProd("comision_b2b_v7", e, m);
    const a = porVendedor(local7[`${e}|${YEAR}|${m}`]), b = porVendedor(p7);
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
console.log(`\nCUADRE v7 pglite vs v7 producción: ${celdas} celdas, ${descuadres} distintas ${descuadres === 0 ? "✓" : "✗ — LOS DATOS NO SON LOS DE PRODUCCIÓN, el cuadro de abajo NO vale"}`);

// ─── 4. el cuadro: v7 → v8 por empresa y PERSONA, ene–sep 2026 ──────────────
const fmt = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NOMBRE = { vistana: "Vistana", fashion_wear: "Fashion Wear", fashion_shoes: "Fashion Shoes", active_shoes: "Active Shoes", active_wear: "Active Wear", joystep: "Joystep" };
const acc = new Map(); // empresa|persona
const bump = (e, v, k, val) => {
  const key = `${e}|${v}`;
  const o = acc.get(key) ?? { empresa: e, vendedor: v, venta7: 0, venta8: 0, cobro7: 0, cobro8: 0, total7: 0, total8: 0, filas7: new Set(), filas8: new Set() };
  o[k] += val;
  acc.set(key, o);
};
for (const e of EMPRESAS) for (const m of MESES) {
  for (const v of local7[`${e}|${YEAR}|${m}`].vendedores) { const p = canon(v.vendedor); bump(e, p, "venta7", n2(v.comision)); bump(e, p, "cobro7", n2(v.comision_cobro)); bump(e, p, "total7", n2(v.comision_total)); acc.get(`${e}|${p}`).filas7.add(v.vendedor); }
  for (const v of local8[`${e}|${YEAR}|${m}`].vendedores) { const p = v.vendedor; bump(e, p, "venta8", n2(v.comision)); bump(e, p, "cobro8", n2(v.comision_cobro)); bump(e, p, "total8", n2(v.comision_total)); acc.get(`${e}|${p}`).filas8.add(v.vendedor); }
}

console.log(`\n══ COMISIÓN ene–sep ${YEAR} · v7 (agrupada post-hoc por persona) → v8 (alias en la RPC) ══`);
const filas = [...acc.values()].filter((o) => o.total7 !== 0 || o.total8 !== 0).sort((a, b) => a.empresa.localeCompare(b.empresa) || (b.total7 + b.total8) - (a.total7 + a.total8));
let empAct = null;
const movidos = [];
for (const o of filas) {
  if (o.empresa !== empAct) {
    empAct = o.empresa;
    console.log(`\n${NOMBRE[empAct]}`);
    console.log("  persona".padEnd(26) + "venta v7".padStart(11) + "venta v8".padStart(11) + "cobro v7".padStart(11) + "cobro v8".padStart(11) + "total v7".padStart(11) + "total v8".padStart(11) + "dif".padStart(11) + "   filas v7 → v8");
  }
  const d = n2(o.total8 - o.total7);
  if (d !== 0 || n2(o.venta8 - o.venta7) !== 0 || n2(o.cobro8 - o.cobro7) !== 0) movidos.push({ ...o, dif: d });
  console.log("  " + o.vendedor.padEnd(24) + fmt(o.venta7).padStart(11) + fmt(o.venta8).padStart(11) + fmt(o.cobro7).padStart(11) + fmt(o.cobro8).padStart(11) + fmt(o.total7).padStart(11) + fmt(o.total8).padStart(11) + fmt(d).padStart(11) + `   ${[...o.filas7].map((s) => JSON.stringify(s)).join("+")} → ${[...o.filas8].join("+")}`);
}

console.log("\n── Celdas que cambian entre v7 y v8 (por persona, ene–sep 2026) ──");
if (movidos.length === 0) console.log("  NINGUNA ✓ — por persona, la v8 dice lo mismo que la v7 en 2026");
for (const o of movidos) console.log(`  ✗ ${NOMBRE[o.empresa].padEnd(14)} ${o.vendedor.padEnd(22)} venta ${fmt(n2(o.venta8 - o.venta7)).padStart(10)} · cobro ${fmt(n2(o.cobro8 - o.cobro7)).padStart(10)} · total ${fmt(o.dif).padStart(10)}`);

// Y las FILAS: cuántas filas de vendedor devuelve cada versión (la v8 tiene que devolver menos: una por persona).
let filas7 = 0, filas8 = 0;
for (const e of EMPRESAS) for (const m of MESES) { filas7 += local7[`${e}|${YEAR}|${m}`].vendedores.length; filas8 += local8[`${e}|${YEAR}|${m}`].vendedores.length; }
console.log(`\n  filas de vendedor devueltas en 54 (empresa, mes): v7 ${filas7} → v8 ${filas8}`);
const colapsadas = filas.filter((o) => o.filas7.size > 1);
for (const o of colapsadas) console.log(`  ${NOMBRE[o.empresa]}: ${[...o.filas7].map((s) => JSON.stringify(s)).join(" + ")} → ${o.vendedor}`);

// Total por empresa y grupo
console.log("\n── Total por empresa (comisión total, ene–sep) ──");
const totEmp = new Map();
for (const o of filas) { const t = totEmp.get(o.empresa) ?? { v7: 0, v8: 0 }; t.v7 += o.total7; t.v8 += o.total8; totEmp.set(o.empresa, t); }
let g7 = 0, g8 = 0;
for (const e of EMPRESAS) { const t = totEmp.get(e) ?? { v7: 0, v8: 0 }; console.log("  " + NOMBRE[e].padEnd(24) + fmt(t.v7).padStart(12) + fmt(t.v8).padStart(12) + fmt(n2(t.v8 - t.v7)).padStart(12)); g7 += t.v7; g8 += t.v8; }
console.log("  " + "GRUPO".padEnd(24) + fmt(g7).padStart(12) + fmt(g8).padStart(12) + fmt(n2(g8 - g7)).padStart(12));

// ─── 5. La fila con cobro 0 % («REINDALDO ESPINOSA»): qué cobraba y qué cobra ──
console.log("\n── «REINDALDO ESPINOSA» (tasa con cobro 0 %): Active Wear por año, v7 → v8 ──");
const porAnio = new Map();
for (const y of [2023, 2024, 2025, 2026]) {
  const meses = y === 2026 ? MESES : [1,2,3,4,5,6,7,8,9,10,11,12];
  let base7 = 0, com7 = 0, base8 = 0, com8 = 0, recibosN = 0;
  for (const m of meses) {
    const v7 = local7[`active_wear|${y}|${m}`].vendedores.find((v) => v.vendedor === "REINDALDO ESPINOSA");
    if (v7) { base7 += n2(v7.base_cobro); com7 += n2(v7.comision_cobro); }
    const v8 = local8[`active_wear|${y}|${m}`].vendedores.find((v) => v.vendedor === "REYNALDO ESPINOSA");
    void v8;
  }
  const rec = await db.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0) AS base FROM switch_recibos WHERE empresa_key='active_wear' AND vendedor_registro = 'REINDALDO ESPINOSA ' AND es_retencion = false AND COALESCE(cliente_codigo,'') <> 'TCKCTA' AND fecha >= make_date($1,1,1) AND fecha < make_date($1+1,1,1)`, [y]);
  recibosN = rec.rows[0].n; base8 = n2(rec.rows[0].base); com8 = n2(base8 * 0.01);
  porAnio.set(y, { recibosN, base7: n2(base7), com7: n2(com7), base8, com8 });
  console.log(`  ${y}: ${String(recibosN).padStart(3)} recibos · base ${fmt(base8).padStart(11)} · cobraba (v7, 0 %) ${fmt(n2(com7)).padStart(8)} · con la v8 (1 %, como Reynaldo) ${fmt(com8).padStart(8)}`);
}

// Y con la RPC de verdad: Active Wear 2023 y 2024, por persona, v7 → v8.
console.log("\n── Active Wear 2023-2025 con la RPC (v7 agrupada por persona → v8) ──");
const viejos = [];
for (const y of [2023, 2024, 2025]) {
  const a = new Map(), b = new Map();
  for (const m of [1,2,3,4,5,6,7,8,9,10,11,12]) {
    for (const v of local7[`active_wear|${y}|${m}`].vendedores) { const p = canon(v.vendedor); const o = a.get(p) ?? { cobro: 0, total: 0 }; o.cobro += n2(v.comision_cobro); o.total += n2(v.comision_total); a.set(p, o); }
    for (const v of local8[`active_wear|${y}|${m}`].vendedores) { const o = b.get(v.vendedor) ?? { cobro: 0, total: 0 }; o.cobro += n2(v.comision_cobro); o.total += n2(v.comision_total); b.set(v.vendedor, o); }
  }
  for (const p of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(p) ?? { cobro: 0, total: 0 }, z = b.get(p) ?? { cobro: 0, total: 0 };
    const d = n2(z.total - x.total);
    if (x.total !== 0 || z.total !== 0) console.log(`  ${y} ${p.padEnd(20)} cobro ${fmt(n2(x.cobro)).padStart(10)} → ${fmt(n2(z.cobro)).padStart(10)}   total ${fmt(n2(x.total)).padStart(10)} → ${fmt(n2(z.total)).padStart(10)}   dif ${fmt(d).padStart(9)}`);
    if (d !== 0) viejos.push({ y, p, dif: d });
  }
}

writeFileSync(path.join(OUT, "_cuadro.json"), JSON.stringify({ cuadre_v7: { celdas, descuadres }, alias, tasasDespues, exclDespues, filas: filas.map((o) => ({ ...o, filas7: [...o.filas7], filas8: [...o.filas8] })), movidos: movidos.map((o) => ({ ...o, filas7: [...o.filas7], filas8: [...o.filas8] })), totEmp: [...totEmp], reindaldo: [...porAnio], viejos }, null, 2));
await db.close();
