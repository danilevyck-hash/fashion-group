// ─────────────────────────────────────────────────────────────────────────────
// AGREGACIÓN de los artículos más vendidos de Multifashion (american_classic).
//
// Módulo PURO: recibe las filas ya leídas y devuelve los dos agrupadores
// (artículo / marca) con unidades, monto y % del total. No toca base ni red,
// así que el candado puede probar la matemática con filas escritas a mano.
//
// ── POR QUÉ EXISTE ESTE MÓDULO EN VEZ DE UN `SUM()` EN LA CONSULTA ──────────
// Dos razones, y las dos son de correctitud, no de estilo:
//
//  1. EL SIGNO NO ESTÁ EN LOS DATOS. `switch_articulo_diario` guarda
//     `venta_total` y `cantidad_total` como MAGNITUD POSITIVA, tal como los
//     manda `/apireporte/ventasucursal` — las notas de crédito incluidas. El
//     signo contable lo pone la LECTURA, mirando la columna `tipo`. Sumar sin
//     mirarla no "se queda corto": INFLA las ventas, porque cada devolución se
//     cuenta como si fuera una venta más. Medido en american_classic: 1.690
//     filas NC sobre 44.343 (3,8%).
//
//     🩸 La firma de este error, ya pagada en este repo (ver CLAUDE.md,
//     "Signos contables"): la diferencia contra la fuente da EXACTAMENTE EL
//     DOBLE de las notas de crédito. Si al comparar contra Switch aparece esa
//     proporción, el bug es éste y no otro.
//
//  2. EL % ES SOBRE EL TOTAL, NO SOBRE LO QUE SE MUESTRA. El porcentaje de
//     cada artículo se calcula contra la venta neta de TODOS los artículos del
//     período, no contra la suma del top que se dibuja. Por eso primero se
//     agrega todo y recién después se corta el top N: al revés, los porcentajes
//     sumarían 100% siempre y no dirían nada.
// ─────────────────────────────────────────────────────────────────────────────

/** Fila cruda de `switch_articulo_diario` — solo las columnas que se usan. */
export interface FilaArticuloDiario {
  articulo_id: number;
  codigo: string | null;
  descripcion: string | null;
  /** FA | NC | CNF | … — SOLO 'NC' resta (ver encabezado). */
  tipo: string | null;
  cantidad_total: number | string | null;
  venta_total: number | string | null;
}

/** Una entrada del diccionario articulo_id → marca (tabla switch_articulo_marca). */
export interface FilaMarca {
  articulo_id: number;
  marca_id: number | null;
  marca_nombre: string | null;
}

export interface RenglonArticulo {
  articuloId: number;
  codigo: string;
  descripcion: string;
  unidades: number;
  venta: number;
  /** Fracción 0..1 de la venta neta del período. `null` si el total no es > 0. */
  pct: number | null;
}

export interface RenglonMarca {
  marcaId: number | null;
  marca: string;
  unidades: number;
  venta: number;
  pct: number | null;
  /** Cuántos artículos distintos aportaron a esta marca. */
  articulos: number;
}

export interface ResumenProductos {
  totales: { unidades: number; venta: number; articulos: number };
  articulos: RenglonArticulo[];
  marcas: RenglonMarca[];
  /** Artículos vendidos que el diccionario de marcas todavía no conoce. */
  sinMarca: { articulos: number; venta: number };
}

/** Etiqueta de los artículos que el diccionario todavía no cubre. */
export const MARCA_DESCONOCIDA = "Sin marca";

/** El ÚNICO tipo que resta. Constante y no un literal suelto: es la regla. */
export const TIPO_QUE_RESTA = "NC";

/** Los montos llegan de PostgREST como string (`numeric`). Nunca `NaN`. */
function num(x: number | string | null | undefined): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = parseFloat(String(x ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Signo contable de una fila. `NC` resta; todo lo demás suma.
 *
 * La comparación es sobre el tipo NORMALIZADO (trim + mayúsculas): un `" nc "`
 * que se colara desde Switch se leería como "no es NC" y sumaría una devolución
 * — el error caro con la cara de un detalle de formato.
 */
export function signoDeTipo(tipo: string | null | undefined): 1 | -1 {
  return String(tipo ?? "").trim().toUpperCase() === TIPO_QUE_RESTA ? -1 : 1;
}

/** Redondeo a centavos: evita que la suma de floats saque un `-0.0000001`. */
const centavos = (n: number): number => Math.round(n * 100) / 100;

/** Redondeo a 4 decimales para las unidades (la columna es numeric(14,4)). */
const unidades4 = (n: number): number => Math.round(n * 10000) / 10000;

interface AcumArticulo {
  articuloId: number;
  codigo: string;
  descripcion: string;
  unidades: number;
  venta: number;
}

/**
 * Agrega las filas del período en los dos agrupadores.
 *
 * @param filas   TODAS las filas del período (ya paginadas — ver la nota de
 *                `leerTodoPaginado`: leer 1.000 de 5.321 no da error, da un
 *                número equivocado).
 * @param marcas  Diccionario articulo_id → marca. Vacío = no se pudo cargar;
 *                el agrupador por marca queda con todo en "Sin marca" y el
 *                llamador lo reporta como tal, en vez de inventar la marca.
 * @param topN    Cuántos renglones devolver por agrupador (el % ya se calculó
 *                contra el total completo antes de cortar).
 */
export function agregarProductos(
  filas: readonly FilaArticuloDiario[],
  marcas: readonly FilaMarca[] = [],
  topN = 50,
): ResumenProductos {
  const porArticulo = new Map<number, AcumArticulo>();
  let totalUnidades = 0;
  let totalVenta = 0;

  for (const f of filas) {
    const signo = signoDeTipo(f.tipo);
    const u = num(f.cantidad_total) * signo;
    const v = num(f.venta_total) * signo;
    totalUnidades += u;
    totalVenta += v;

    const prev = porArticulo.get(f.articulo_id);
    if (prev) {
      prev.unidades += u;
      prev.venta += v;
      // La descripción/código se conservan de la PRIMERA fila no vacía: si
      // alguien renombró el artículo en Switch a mitad de mes, quedan las dos
      // en la tabla y hay que elegir una — no promediar texto.
      if (!prev.codigo && f.codigo) prev.codigo = f.codigo;
      if (!prev.descripcion && f.descripcion) prev.descripcion = f.descripcion;
    } else {
      porArticulo.set(f.articulo_id, {
        articuloId: f.articulo_id,
        codigo: f.codigo ?? "",
        descripcion: f.descripcion ?? "",
        unidades: u,
        venta: v,
      });
    }
  }

  totalUnidades = unidades4(totalUnidades);
  totalVenta = centavos(totalVenta);
  const pctDe = (v: number): number | null => (totalVenta > 0 ? v / totalVenta : null);

  // ── Agrupador ARTÍCULO ────────────────────────────────────────────────────
  // Se descartan los artículos que quedaron en cero NETO (vendido y devuelto
  // dentro del mismo período): no son un renglón, son un no-evento. Los que
  // quedan NEGATIVOS sí se conservan — una devolución neta es información real.
  const articulosTodos = [...porArticulo.values()]
    .map(a => ({ ...a, unidades: unidades4(a.unidades), venta: centavos(a.venta) }))
    .filter(a => a.venta !== 0 || a.unidades !== 0)
    .sort((a, b) => b.venta - a.venta || a.codigo.localeCompare(b.codigo));

  const articulos: RenglonArticulo[] = articulosTodos.slice(0, topN).map(a => ({
    articuloId: a.articuloId,
    codigo: a.codigo,
    descripcion: a.descripcion,
    unidades: a.unidades,
    venta: a.venta,
    pct: pctDe(a.venta),
  }));

  // ── Agrupador MARCA ───────────────────────────────────────────────────────
  const dicc = new Map<number, FilaMarca>();
  for (const m of marcas) dicc.set(m.articulo_id, m);

  interface AcumMarca { marcaId: number | null; marca: string; unidades: number; venta: number; articulos: number }
  const porMarca = new Map<string, AcumMarca>();
  let sinMarcaArticulos = 0;
  let sinMarcaVenta = 0;

  for (const a of articulosTodos) {
    const m = dicc.get(a.articuloId);
    const marcaId = m?.marca_id ?? null;
    const nombre = (m?.marca_nombre ?? "").trim() || MARCA_DESCONOCIDA;
    if (nombre === MARCA_DESCONOCIDA) {
      sinMarcaArticulos += 1;
      sinMarcaVenta += a.venta;
    }
    // La clave es el NOMBRE, no el id: dos marcaId con el mismo nombre son la
    // misma marca para quien lee el informe.
    const acc = porMarca.get(nombre);
    if (acc) {
      acc.unidades += a.unidades;
      acc.venta += a.venta;
      acc.articulos += 1;
      if (acc.marcaId !== marcaId) acc.marcaId = acc.marcaId ?? marcaId;
    } else {
      porMarca.set(nombre, { marcaId, marca: nombre, unidades: a.unidades, venta: a.venta, articulos: 1 });
    }
  }

  const marcasOut: RenglonMarca[] = [...porMarca.values()]
    .map(m => ({
      marcaId: m.marcaId,
      marca: m.marca,
      unidades: unidades4(m.unidades),
      venta: centavos(m.venta),
      articulos: m.articulos,
      pct: pctDe(centavos(m.venta)),
    }))
    .sort((a, b) => b.venta - a.venta || a.marca.localeCompare(b.marca))
    .slice(0, topN);

  return {
    totales: { unidades: totalUnidades, venta: totalVenta, articulos: articulosTodos.length },
    articulos,
    marcas: marcasOut,
    sinMarca: { articulos: sinMarcaArticulos, venta: centavos(sinMarcaVenta) },
  };
}
