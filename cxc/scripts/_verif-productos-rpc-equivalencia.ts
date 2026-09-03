/**
 * VERIFICACIÓN — mover la suma a Postgres NO CAMBIA NI UN CENTAVO.
 * SOLO LECTURA. Nunca escribe en producción.
 *
 * Reconstruye la respuesta ENTERA de /api/multifashion/productos por los DOS
 * caminos, con las MISMAS funciones puras que usa la ruta, y sobre las MISMAS
 * filas de producción:
 *
 *   CAMINO A — filas CRUDAS de `switch_articulo_diario`, como leía la ruta
 *              antes (20.483 filas en 21 páginas de PostgREST).
 *   CAMINO B — las mismas filas AGRUPADAS exactamente como las agrupa
 *              `multifashion_articulo_diario_agrupado_v1` (misma llave, mismas
 *              sumas SIN firmar, mismo orden por MIN(id)), pasadas por
 *              `periodoDesdeRpc`.
 *
 * Y compara las dos contra la RESPUESTA REAL capturada de producción, campo por
 * campo. Cualquier diferencia distinta de 0 es un fallo.
 *
 *   ANTES=/tmp/mf-antes/12m.json npx tsx scripts/_verif-productos-rpc-equivalencia.ts
 *
 * Sin `ANTES` compara solo A contra B (que es el corazón del asunto).
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  agregarRanking,
  rango12Meses,
  rangoComparativo,
  type FilaArticuloDiario,
  type RenglonRanking,
} from "../src/lib/multifashion/productos-ranking";
import { agregarProductos, type FilaMarca } from "../src/lib/multifashion/productos";
import {
  armarPorMarca,
  armarPorMarcaComparativo,
  departamentoCanonico,
  grupoDeDepartamento,
  mapaArticuloGrupo,
} from "../src/lib/multifashion/productos-marca";
import { periodoDesdeRpc } from "../src/lib/multifashion/productos-lectura";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMPRESA = "american_classic";
const TOP_N = 50;
const db = createClient(URL, KEY, { auth: { persistSession: false } });

interface FilaCruda extends FilaArticuloDiario {
  id: string;
}

async function leerCrudas(desde: string, hasta: string): Promise<FilaCruda[]> {
  const out: FilaCruda[] = [];
  for (let p = 0; p < 200; p += 1) {
    const { data, error } = await db
      .from("switch_articulo_diario")
      .select("id, articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total")
      .eq("empresa_key", EMPRESA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as FilaCruda[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function leerMarcas(): Promise<FilaMarca[]> {
  const out: FilaMarca[] = [];
  for (let p = 0; p < 200; p += 1) {
    const { data, error } = await db
      .from("switch_articulo_marca")
      .select("articulo_id, marca_id, marca_nombre")
      .eq("empresa_key", EMPRESA)
      .order("articulo_id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as FilaMarca[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** LA MISMA agregación que hace la migración 20260809140000, en TypeScript. */
const SEP = "\u0001";
const NULO = "\u0002";
function comoLaRpc(filas: readonly FilaCruda[]): { n: number; f: unknown[] } {
  interface G {
    a: number; c: string | null; d: string | null; t: string | null;
    q: number; v: number; k: number; n: number; orden: string;
  }
  const g = new Map<string, G>();
  for (const f of filas) {
    const llave = [f.articulo_id, f.codigo ?? NULO, f.descripcion ?? NULO, f.tipo ?? NULO].join(SEP);
    const num = (x: number | string | null) => Number(x ?? 0);
    const prev = g.get(llave);
    if (prev) {
      prev.q += num(f.cantidad_total);
      prev.v += num(f.venta_total);
      prev.k += num(f.costo_total);
      prev.n += 1;
      if (f.id < prev.orden) prev.orden = f.id;
    } else {
      g.set(llave, {
        a: f.articulo_id, c: f.codigo, d: f.descripcion, t: f.tipo,
        q: num(f.cantidad_total), v: num(f.venta_total), k: num(f.costo_total),
        n: 1, orden: f.id,
      });
    }
  }
  const ord = [...g.values()].sort((x, y) => (x.orden < y.orden ? -1 : x.orden > y.orden ? 1 : 0));
  return {
    n: filas.reduce((s, _f) => s + 1, 0),
    f: ord.map(x => ({ a: x.a, c: x.c, d: x.d, t: x.t, q: x.q, v: x.v, k: x.k })),
  };
}

/** El MISMO armado de la ruta, con las MISMAS funciones y en el MISMO orden. */
const aliviar = (filas: readonly RenglonRanking[]) =>
  filas.map(f => ({ clave: f.clave, unidades: f.unidades, venta: f.venta, utilidad: f.utilidad }));

function armarRespuesta(
  filas: readonly FilaArticuloDiario[],
  filasComp: readonly FilaArticuloDiario[],
  marcas: readonly FilaMarca[],
  filasLeidas: number,
  compLeidas: number,
) {
  const marcasCanon: FilaMarca[] = marcas.map(m => ({
    ...m,
    marca_nombre: m.marca_nombre == null ? m.marca_nombre : departamentoCanonico(m.marca_nombre),
  }));
  const resumen = agregarProductos(filas, marcasCanon, TOP_N);
  const porCategoria = agregarRanking(filas, "categoria");
  const porCodigo = agregarRanking(filas, "codigo");
  const compCategoria = agregarRanking(filasComp, "categoria");
  const compCodigo = agregarRanking(filasComp, "codigo");
  const mapaGrupo = mapaArticuloGrupo(marcasCanon);
  return {
    filasLeidas,
    marcaDisponible: marcasCanon.length > 0,
    ...resumen,
    marcas: resumen.marcas.map(m => ({ ...m, grupo: grupoDeDepartamento(m.marca).id })),
    porMarca: armarPorMarca(filas, mapaGrupo),
    ranking: {
      totales: porCategoria.totales,
      categorias: porCategoria.filas,
      codigos: porCodigo.filas,
    },
    comparativo: {
      filasLeidas: compLeidas,
      totales: compCategoria.totales,
      categorias: aliviar(compCategoria.filas),
      codigos: aliviar(compCodigo.filas),
      porMarca: armarPorMarcaComparativo(filasComp, mapaGrupo),
    },
  };
}

/** Compara dos estructuras y devuelve TODAS las diferencias, con su ruta. */
function diff(a: unknown, b: unknown, ruta = ""): string[] {
  if (a === b) return [];
  if (typeof a === "number" && typeof b === "number") {
    return a === b ? [] : [`${ruta}: ${a} ≠ ${b}  (dif ${(a - b).toFixed(6)})`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${ruta}: largo ${a.length} ≠ ${b.length}`];
    const out: string[] = [];
    for (let i = 0; i < a.length; i += 1) out.push(...diff(a[i], b[i], `${ruta}[${i}]`));
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join(",") !== kb.join(",")) return [`${ruta}: claves ${ka.join(",")} ≠ ${kb.join(",")}`];
    const out: string[] = [];
    for (const k of ka) {
      out.push(...diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${ruta}.${k}`));
    }
    return out;
  }
  return [`${ruta}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

function reportar(titulo: string, difs: string[]) {
  if (difs.length === 0) {
    console.log(`✅ ${titulo}: 0 diferencias`);
    return true;
  }
  console.log(`❌ ${titulo}: ${difs.length} diferencias`);
  for (const d of difs.slice(0, 25)) console.log(`     ${d}`);
  return false;
}

async function main() {
  const ahora = new Date();
  const ventana = rango12Meses(ahora);
  // `null` = sin dato de último día cargado: corta en hoy, como antes del
  // 3-sep-2026. Acá se verifica la equivalencia RPC/paginado, no el corte.
  const comp = rangoComparativo(ventana, ahora, null);
  console.log(`período     ${ventana.desde} → ${ventana.hasta}`);
  console.log(`comparativo ${comp.desde} → ${comp.hasta}\n`);

  const t0 = Date.now();
  const [crudas, crudasComp, marcas] = await Promise.all([
    leerCrudas(ventana.desde, ventana.hasta),
    leerCrudas(comp.desde, comp.hasta),
    leerMarcas(),
  ]);
  console.log(
    `leídas ${crudas.length} + ${crudasComp.length} filas crudas y ${marcas.length} de diccionario en ${Date.now() - t0} ms\n`,
  );

  const rpc = comoLaRpc(crudas);
  const rpcComp = comoLaRpc(crudasComp);
  console.log(`agrupadas: ${crudas.length} → ${rpc.f.length}  ·  comparativo ${crudasComp.length} → ${rpcComp.f.length}`);
  console.log(
    `peso del payload interno: crudo ${(JSON.stringify(crudas).length / 1024 / 1024).toFixed(2)} MB → agrupado ${(
      JSON.stringify(rpc).length / 1024 / 1024
    ).toFixed(2)} MB\n`,
  );

  const A = armarRespuesta(
    crudas.map(({ id: _i, ...r }) => r),
    crudasComp.map(({ id: _i, ...r }) => r),
    marcas,
    crudas.length,
    crudasComp.length,
  );
  const pB = periodoDesdeRpc(rpc, "periodo");
  const pBc = periodoDesdeRpc(rpcComp, "comparativo");
  const B = armarRespuesta(pB.filas, pBc.filas, marcas, pB.filasCrudas, pBc.filasCrudas);

  let ok = reportar("CAMINO A (filas crudas) vs CAMINO B (agrupadas por la RPC)", diff(A, B));

  const antes = process.env.ANTES;
  if (antes && fs.existsSync(antes)) {
    const prod = JSON.parse(fs.readFileSync(antes, "utf8"));
    // Solo los campos que la ruta calcula (se ignoran year/mes/periodo/fechas y
    // los campos nuevos de diagnóstico, que no son números de negocio).
    const recorte = (r: Record<string, unknown>) => ({
      filasLeidas: r.filasLeidas,
      marcaDisponible: r.marcaDisponible,
      totales: r.totales,
      articulos: r.articulos,
      marcas: r.marcas,
      sinMarca: r.sinMarca,
      porMarca: r.porMarca,
      ranking: r.ranking,
      comparativo: {
        filasLeidas: (r.comparativo as Record<string, unknown>).filasLeidas,
        totales: (r.comparativo as Record<string, unknown>).totales,
        categorias: (r.comparativo as Record<string, unknown>).categorias,
        codigos: (r.comparativo as Record<string, unknown>).codigos,
        porMarca: (r.comparativo as Record<string, unknown>).porMarca,
      },
    });
    ok = reportar("PRODUCCIÓN (antes) vs CAMINO A", diff(recorte(prod), recorte(A as never))) && ok;
    ok = reportar("PRODUCCIÓN (antes) vs CAMINO B", diff(recorte(prod), recorte(B as never))) && ok;
  }

  // Números de control que Daniel puede leer de un vistazo.
  const r = A.ranking.totales;
  console.log(`\nventa total ......... ${r.venta.toFixed(2)}   margen ${(r.margen! * 100).toFixed(1)}%`);
  let suma = 0;
  for (const g of A.porMarca.grupos) {
    suma += g.totales.venta;
    console.log(
      `  ${g.nombre.padEnd(18)} ${g.totales.venta.toFixed(2).padStart(12)}   ${
        g.totales.margen == null ? "—" : `${(g.totales.margen * 100).toFixed(1)}%`
      }`,
    );
  }
  const dif = Math.round((suma - r.venta) * 100) / 100;
  console.log(`  ${"SUMA de las 6".padEnd(18)} ${suma.toFixed(2).padStart(12)}   diferencia ${dif.toFixed(2)}`);
  if (dif !== 0) ok = false;

  console.log(ok ? "\n✅ TODO CUADRA — ningún número cambió." : "\n❌ HAY DIFERENCIAS.");
  process.exit(ok ? 0 : 1);

}

main();
