// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN — las categorías de Reebok, antes y después de volverlas tabla.
// 🔴 SOLO LECTURA. No escribe una sola fila en producción.
//
//   set -a && . ./.env.local && set +a
//   node scripts/_medir-categorias-reebok.mjs
//
// Contesta tres preguntas:
//   1) Con la tabla sembrada, ¿cambia la clasificación de alguno de los
//      artículos de `active_shoes`? **Tiene que dar CERO**, o la tabla no
//      reproduce el mapa del código y correr la migración estrenaría una
//      clasificación distinta.
//   2) Agregando T-SHIRTS · TOPS · BRA · JACKETS a `apparel`, ¿cuántos
//      artículos cambian de cajón y cuáles?
//   3) ¿Qué rubros quedan hoy sin traducir, y por qué camino entra cada uno?
//
// 🔑 La semilla NO se teclea acá: se LEE de la migración. Un tercer lugar donde
// copiar las seis reglas sería estrenar el mismo espejo que esto viene a matar.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRACION = "supabase/migrations/20261205120000_reebok_rubro_categoria.sql";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMPRESA = "active_shoes";

const U = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

// El mapa que HOY tiene el código, copiado de `CATEGORIA_POR_MARCA` /
// `CATEGORIA_POR_RUBRO_BASE` (src/lib/reebok-clasificacion.ts). Es la RED.
const POR_MARCA = { FOOTWEAR: "footwear", APPAREL: "apparel", HARDWARE: "accessories" };
const POR_RUBRO_CODIGO = {
  SHOES: "footwear", APPAREL: "apparel", SHORTS: "apparel",
  SOCKS: "apparel", BAGS: "accessories", HEADWEAR: "accessories",
};

/** La semilla REAL de la migración, leída del .sql. */
function semillaDeLaMigracion() {
  const sql = fs.readFileSync(path.join(RAIZ, MIGRACION), "utf8");
  const mapa = {};
  for (const m of sql.matchAll(/\(\s*'([A-Z -]+)',\s*'(footwear|apparel|accessories)'/g)) {
    mapa[U(m[1])] = m[2];
  }
  return mapa;
}

// Los cuatro rubros del despacho de ropa del 17-sep que el catálogo no conoce.
const RUBROS_NUEVOS = { "T-SHIRTS": "apparel", TOPS: "apparel", BRA: "apparel", JACKETS: "apparel" };

/** La MARCA primero, siempre. El rubro es el plan B de una marca vacía. */
const categoria = (rubro, marca, porRubro) => POR_MARCA[U(marca)] ?? porRubro[U(rubro)] ?? null;

async function fichas() {
  const out = [];
  for (let p = 0; p < 20; p++) {
    const { data, error } = await db
      .from("switch_articulo_info")
      .select("codigo, rubro, subrubro, marca, ficha_at, descripcion, existencia")
      .eq("empresa_key", EMPRESA)
      .order("codigo", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const filas = await fichas();
const conFicha = filas.filter((f) => String(f.ficha_at ?? "").trim() !== "");
console.log(`switch_articulo_info · ${EMPRESA}: ${filas.length} artículos (${conFicha.length} con ficha traída)`);

// ── 1) La tabla sembrada reproduce el mapa del código ────────────────────────
const SEMILLA = semillaDeLaMigracion();
console.log(`\nSemilla leída de ${MIGRACION}: ${Object.keys(SEMILLA).length} reglas`);
const igualAlCodigo = JSON.stringify(SEMILLA) === JSON.stringify(POR_RUBRO_CODIGO);
console.log(`   ¿idéntica al mapa del código? ${igualAlCodigo ? "SÍ" : "NO ⚠️"}`);

let distintos = 0;
const ejemplos = [];
for (const f of filas) {
  const a = categoria(f.rubro, f.marca, POR_RUBRO_CODIGO);
  const b = categoria(f.rubro, f.marca, SEMILLA);
  if (a !== b) { distintos++; if (ejemplos.length < 10) ejemplos.push(`${f.codigo} ${a} → ${b}`); }
}
console.log(`\n1) tabla sembrada vs mapa del código → ${distintos} artículo(s) cambian de categoría`);
for (const e of ejemplos) console.log(`     ${e}`);
if (distintos > 0) console.log("   ⚠️ PARA: la tabla NO reproduce el mapa del código.");

// ── 2) Agregando T-SHIRTS · TOPS · BRA · JACKETS ─────────────────────────────
const CON_ROPA_NUEVA = { ...SEMILLA, ...RUBROS_NUEVOS };
const cambios = [];
for (const f of filas) {
  const antes = categoria(f.rubro, f.marca, SEMILLA);
  const despues = categoria(f.rubro, f.marca, CON_ROPA_NUEVA);
  if (antes !== despues) cambios.push({ ...f, antes, despues });
}
console.log(`\n2) agregando ${Object.keys(RUBROS_NUEVOS).join(" · ")} → ${cambios.length} artículo(s) cambian de cajón`);
const porRubro = new Map();
for (const c of cambios) {
  const k = `${U(c.rubro)} (marca «${U(c.marca) || "vacía"}»)  ${c.antes ?? "sin categoría"} → ${c.despues}`;
  porRubro.set(k, [...(porRubro.get(k) ?? []), c]);
}
for (const [k, lista] of [...porRubro.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const conEx = lista.filter((c) => Number(c.existencia ?? 0) > 0).length;
  console.log(`   · ${k}: ${lista.length} artículo(s), ${conEx} con existencia`);
  console.log(`     ${lista.slice(0, 12).map((c) => c.codigo).join(", ")}${lista.length > 12 ? "…" : ""}`);
}
// Por qué puede dar cero: si ninguno de esos rubros existe hoy en Switch, o si
// todos traen su Department, el camino PRIMARIO ya los resolvía.
const conRubroNuevo = filas.filter((f) => U(f.rubro) in RUBROS_NUEVOS);
console.log(`   artículos que HOY traen uno de esos cuatro rubros: ${conRubroNuevo.length}`);
const sinMarca = conRubroNuevo.filter((f) => !U(f.marca));
console.log(`   …de ellos, con el Department VACÍO (los únicos que mirarían el rubro): ${sinMarca.length}`);

// ── 3) Qué queda sin traducir, y por qué camino ──────────────────────────────
const sinCategoria = conFicha.filter((f) => categoria(f.rubro, f.marca, SEMILLA) === null);
console.log(`\n3) Hoy quedan sin categoría (con ficha traída): ${sinCategoria.length}`);
const rubrosSin = new Map();
for (const f of sinCategoria) {
  const k = `rubro «${U(f.rubro) || "(vacío)"}» · marca «${U(f.marca) || "(vacía)"}»`;
  rubrosSin.set(k, (rubrosSin.get(k) ?? 0) + 1);
}
for (const [r, n] of [...rubrosSin.entries()].sort((a, b) => b[1] - a[1])) console.log(`   · ${r}: ${n}`);

// Cuántos dependen HOY del rubro (o sea, del mapa que se vuelve tabla).
const dependenDelRubro = conFicha.filter((f) => !U(f.marca) && POR_RUBRO_CODIGO[U(f.rubro)]);
console.log(`\n   Artículos cuya categoría sale del RUBRO (Department vacío): ${dependenDelRubro.length}`);
console.log(`   Artículos cuya categoría sale de la MARCA (Department): ${conFicha.filter((f) => POR_MARCA[U(f.marca)]).length}`);
