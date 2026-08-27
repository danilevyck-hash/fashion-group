// Barrido READ-ONLY contra producción: ¿a cuántos códigos les cambian las
// celdas VENDIDO · MESES del tab Ventas › Referencia?
//
// Corre los MISMOS módulos puros que la pantalla (`armarArticulo` +
// `armarFicha` + `medirVendidoMeses`) código por código y VUELCA el resultado a
// un JSON. Se corre DOS veces —antes y después del cambio— y la segunda compara
// contra la primera, así el "antes/después" sale del código real y no de una
// segunda implementación que podría equivocarse igual.
//
// 🔴 LA LECTURA DE LA BASE SE CACHEA en `.diag-cache/` (crudo, tal como vino):
// la segunda corrida NO vuelve a pegarle a Supabase. Una auditoría no es motivo
// para saturar la base.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_diag-vendido-meses-referencia.ts [empresa] [etiqueta]
//   (default: vistana · etiqueta `antes`; después correr con `despues` y
//    compara solo)

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { armarArticulo, type FilaIngreso } from "../src/lib/ventas/compras";
import {
  armarFicha,
  medirVendidoMeses,
  textoMesesCelda,
  textoVendidoCelda,
} from "../src/lib/ventas/resumen-articulo";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const EMPRESA = process.argv[2] ?? "vistana";
const ETIQUETA = process.argv[3] ?? "antes";
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const HOY_MES = HOY.slice(0, 7);
const DIR = ".diag-cache";
const CRUDO = `${DIR}/referencia-${EMPRESA}-${HOY}.json`;
const SALIDA = `${DIR}/vendido-meses-${EMPRESA}-${ETIQUETA}.json`;
const ANTES = `${DIR}/vendido-meses-${EMPRESA}-antes.json`;

/** Lee TODO paginado con orden estable — db-max-rows=1000 corta en silencio. */
async function leerTodo<T>(tabla: string, columnas: string, orden: string[]): Promise<T[]> {
  const out: T[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = db.from(tabla).select(columnas).eq("empresa_key", EMPRESA);
    for (const o of orden) q = q.order(o);
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return out;
}

interface Crudo {
  ing: FilaIngreso[];
  ven: { fecha: string; codigo: string; tipo: string; cantidad_total: number; venta_total: number }[];
  inf: { codigo: string; existencia: number | null }[];
}

async function leerCrudo(): Promise<Crudo> {
  mkdirSync(DIR, { recursive: true });
  if (existsSync(CRUDO)) {
    console.log(`(cache) ${CRUDO}`);
    return JSON.parse(readFileSync(CRUDO, "utf8")) as Crudo;
  }
  const ing = await leerTodo<FilaIngreso>(
    "switch_ingresos_mercancia",
    "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, costo_promedio, fob_confiable",
    ["fecha", "n_interno", "linea"],
  );
  const ven = await leerTodo<Crudo["ven"][number]>(
    "switch_articulo_diario",
    "fecha, codigo, tipo, cantidad_total, venta_total",
    ["id"],
  );
  const inf = await leerTodo<Crudo["inf"][number]>("switch_articulo_info", "codigo, existencia", ["codigo"]);
  const crudo: Crudo = { ing, ven, inf };
  writeFileSync(CRUDO, JSON.stringify(crudo));
  console.log(`(leído de producción y cacheado) ${CRUDO}`);
  return crudo;
}

async function main() {
  console.log(`empresa=${EMPRESA} · etiqueta=${ETIQUETA} · hoy (Panamá)=${HOY}\n`);
  const { ing, ven, inf } = await leerCrudo();
  console.log(`ingresos ${ing.length} · ventas ${ven.length} · catálogo ${inf.length}\n`);

  const ingPor = new Map<string, FilaIngreso[]>();
  for (const r of ing) {
    const l = ingPor.get(r.codigo_articulo) ?? [];
    l.push(r);
    ingPor.set(r.codigo_articulo, l);
  }
  const venPor = new Map<string, Crudo["ven"]>();
  for (const r of ven) {
    const l = venPor.get(r.codigo) ?? [];
    l.push(r);
    venPor.set(r.codigo, l);
  }
  const exisPor = new Map(inf.map((r) => [r.codigo, r.existencia == null ? null : Number(r.existencia)]));

  const codigos = [...new Set([...ingPor.keys(), ...venPor.keys()])].sort();
  const filas: Record<string, string> = {};
  let sinExistencia = 0;
  for (const codigo of codigos) {
    const art = armarArticulo(
      {
        empresa: EMPRESA,
        codigo,
        descripcion: "",
        ingresos: ingPor.get(codigo) ?? [],
        ventas: venPor.get(codigo) ?? [],
        existencia: exisPor.get(codigo) ?? null,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    if (art.existencia == null) sinExistencia += 1;
    const f = armarFicha(art, HOY_MES);
    const vm = medirVendidoMeses(f);
    // Compré · Vendí · Stock · VENDIDO · MESES · estado — la fila tal cual se lee.
    filas[codigo] = [
      f.grandes.comprado ?? "—",
      f.grandes.vendido,
      f.grandes.quedan ?? "—",
      textoVendidoCelda(vm),
      textoMesesCelda(vm),
      vm.terminado ? "cerrado" : "vivo",
    ].join("|");
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(filas, null, 0));
  console.log(`códigos: ${codigos.length} · sin existencia en el catálogo: ${sinExistencia}`);
  console.log(`escrito ${SALIDA}\n`);

  if (ETIQUETA !== "antes" && existsSync(ANTES)) {
    const antes = JSON.parse(readFileSync(ANTES, "utf8")) as Record<string, string>;
    const cambios: { codigo: string; antes: string; ahora: string }[] = [];
    let soloVendido = 0;
    let soloMeses = 0;
    let ambos = 0;
    for (const codigo of codigos) {
      const a = antes[codigo];
      const b = filas[codigo];
      if (a == null || a === b) continue;
      cambios.push({ codigo, antes: a, ahora: b });
      const pa = a.split("|");
      const pb = b.split("|");
      const dV = pa[3] !== pb[3];
      const dM = pa[4] !== pb[4];
      if (dV && dM) ambos += 1;
      else if (dV) soloVendido += 1;
      else if (dM) soloMeses += 1;
    }
    console.log(`CAMBIOS: ${cambios.length} de ${codigos.length}`);
    console.log(`  solo VENDIDO: ${soloVendido} · solo MESES: ${soloMeses} · los dos: ${ambos}`);
    console.log(`  sin cambio: ${codigos.length - cambios.length}\n`);
    console.log("ejemplos (primeros 25) — Compré|Vendí|Stock|VENDIDO|MESES|estado:");
    for (const c of cambios.slice(0, 25)) console.log(`  ${c.codigo}\n     antes ${c.antes}\n     ahora ${c.ahora}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
