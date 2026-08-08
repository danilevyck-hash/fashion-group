// ─────────────────────────────────────────────────────────────────────────────
// EL FILTRO DE MARCA DE "MULTIFASHION › PRODUCTOS", DEL LADO DE LOS DATOS.
//
// Daniel: *"y si quiero ver mis articulos top sellers? o descripciones top
// seller?"* — el agrupador obligaba a bajar nivel por nivel (marca → categoría →
// artículo). Lo aprobado es un filtro de MARCA arriba que filtra TODO lo de
// abajo: **un toque, no cuatro.**
//
// Este módulo es PURO. Reparte las filas del período en las cinco marcas reales
// (+ "Otros") y prepara el viaje al navegador.
//
// ── LAS TRES COSAS QUE ACÁ NO SE PUEDEN HACER MAL ───────────────────────────
//
// 1. **NINGÚN NÚMERO CAMBIA, Y NO SE RECALCULA NADA A MANO.** Cada partición se
//    agrega con `agregarRanking`, la MISMA función que produce los números que
//    la pantalla ya mostraba. Las notas de crédito siguen restando, el margen
//    sigue saliendo del agregado y los "—" siguen siendo "—". Si el filtro
//    tuviera su propia matemática, "Tommy" y "Todas" podrían no cerrar entre
//    ellos y no habría forma de saber cuál miente.
//    · Verificado contra producción el 8-ago-2026: la suma de las 6 particiones
//      da **$690.034,75**, exactamente el total sin filtrar (diferencia $0,00).
//
// 2. **EL FILTRO NO PUEDE COSTAR UNA CONSULTA.** Si cada toque pidiera el
//    período de nuevo, "un toque" serían 2 s de espera y otra lectura de 20.445
//    filas contra Supabase (la base que ya se cayó 3 veces en 5 días por
//    saturación — CLAUDE.md). Las particiones viajan CON el payload y el filtro
//    es instantáneo, sin red.
//
// 3. **LAS FILAS PARTICIONADAS VIAJAN LIVIANAS.** Medido: los dos arreglos que
//    la pantalla ya bajaba pesan 768 KB crudos (570 categorías + 3.928 códigos);
//    las 6 particiones en formato liviano suman 268 KB (+35%), contra los ~700 KB
//    que costaría repetir el renglón completo. Se manda lo que NO se puede
//    derivar (unidades, venta, costo) y el navegador rearma el resto con las
//    MISMAS funciones del servidor — `utilidad = venta − costo` y `margenDe`—,
//    así que rearmar no es recalcular: es la misma cuenta, una sola vez escrita.
//
// ⚠️ **La marca de un artículo sale del diccionario `switch_articulo_marca`.** Un
// artículo que el diccionario todavía no conoce cae en "Otros", no en una marca
// adivinada (ver marcas-grupo.ts). Medido el 8-ago-2026: 0 filas del período sin
// entrada en el diccionario.
// ─────────────────────────────────────────────────────────────────────────────

import {
  agregarRanking,
  margenDe,
  type FilaArticuloDiario,
  type ModoRanking,
  type RenglonRanking,
  type TotalesRanking,
} from "./productos-ranking";
import type { RenglonComparativo } from "./productos-resumen";
import {
  GRUPO_OTROS,
  ORDEN_GRUPOS,
  departamentoCanonico,
  grupoDeDepartamento,
  nombreDeGrupo,
  type GrupoMarcaId,
} from "./marcas-grupo";

/** Una entrada del diccionario articulo_id → marca (`switch_articulo_marca`). */
export interface FilaDiccionarioMarca {
  articulo_id: number;
  marca_id?: number | null;
  marca_nombre: string | null;
}

/** Fila particionada, en formato de viaje. Nombres de un carácter porque se
 *  repiten ~4.600 veces: `grupo`/`clave`/`unidades`/`venta`/`costo` como claves
 *  costaban 40 KB de puro nombre de campo. */
export interface FilaLigera {
  /** Grupo de marca. */
  g: GrupoMarcaId;
  /** Clave de agrupación (categoría o código) — la misma de `RenglonRanking`. */
  c: string;
  /** Unidades. */
  u: number;
  /** Venta neta. */
  v: number;
  /** Costo. */
  k: number;
  /** Códigos distintos que aportaron (solo tiene sentido por categoría). */
  a: number;
}

/** Fila particionada del período de COMPARACIÓN. Ya viajaba aliviada (la
 *  pantalla solo parea por clave y resta); acá solo suma el grupo. */
export interface FilaLigeraComparativa {
  g: GrupoMarcaId;
  c: string;
  u: number;
  v: number;
  /** Utilidad. */
  t: number;
}

/** Totales de una marca en el período. Es lo que dibuja el selector. */
export interface TotalesMarca {
  id: GrupoMarcaId;
  nombre: string;
  totales: TotalesRanking;
}

export interface PorMarca {
  grupos: TotalesMarca[];
  categorias: FilaLigera[];
  codigos: FilaLigera[];
}

export interface PorMarcaComparativo {
  grupos: { id: GrupoMarcaId; totales: TotalesRanking }[];
  categorias: FilaLigeraComparativa[];
  codigos: FilaLigeraComparativa[];
}

/** Redondeo a centavos — la MISMA función que usa `agregarRanking`. */
const centavos = (n: number): number => Math.round(n * 100) / 100;

/**
 * `articulo_id` → grupo de marca, a partir del diccionario del catálogo.
 *
 * El nombre del departamento se canoniza ANTES de mirar la marca, así las dos
 * escrituras de un mismo departamento (`TH ACCESORIES` / `TH ACCESSORIES`)
 * terminan en el mismo grupo aunque la equivalencia no cambiara de marca.
 */
export function mapaArticuloGrupo(
  dicc: readonly FilaDiccionarioMarca[],
): Map<number, GrupoMarcaId> {
  const out = new Map<number, GrupoMarcaId>();
  for (const d of dicc) {
    out.set(d.articulo_id, grupoDeDepartamento(d.marca_nombre).id);
  }
  return out;
}

/**
 * Reparte las filas del período por marca.
 *
 * Un `articulo_id` que el diccionario no conoce cae en `OTROS` — nunca se
 * descarta: descartarlo haría que la suma de las marcas no diera el total, y un
 * informe cuyas partes no suman el todo es un informe que nadie puede cuadrar.
 */
export function particionarPorGrupo<T extends { articulo_id: number }>(
  filas: readonly T[],
  mapa: ReadonlyMap<number, GrupoMarcaId>,
): Map<GrupoMarcaId, T[]> {
  const out = new Map<GrupoMarcaId, T[]>();
  for (const f of filas) {
    const g = mapa.get(f.articulo_id) ?? GRUPO_OTROS.id;
    const arr = out.get(g);
    if (arr) arr.push(f);
    else out.set(g, [f]);
  }
  return out;
}

/** Renglones agregados → formato de viaje. */
export function aligerar(g: GrupoMarcaId, filas: readonly RenglonRanking[]): FilaLigera[] {
  return filas.map(f => ({ g, c: f.clave, u: f.unidades, v: f.venta, k: f.costo, a: f.articulos }));
}

export function aligerarComparativo(
  g: GrupoMarcaId,
  filas: readonly RenglonRanking[],
): FilaLigeraComparativa[] {
  return filas.map(f => ({ g, c: f.clave, u: f.unidades, v: f.venta, t: f.utilidad }));
}

/**
 * Todo lo que el navegador necesita para filtrar por marca sin pedir nada.
 *
 * Recorre los grupos en un orden FIJO (`ORDEN_GRUPOS`): un `Map` conserva el
 * orden de inserción, o sea el orden en que aparecieron las filas — y entonces
 * el payload cambiaría de forma entre dos corridas con los mismos datos.
 */
export function armarPorMarca(
  filas: readonly FilaArticuloDiario[],
  mapa: ReadonlyMap<number, GrupoMarcaId>,
): PorMarca {
  const particion = particionarPorGrupo(filas, mapa);
  const grupos: TotalesMarca[] = [];
  const categorias: FilaLigera[] = [];
  const codigos: FilaLigera[] = [];

  for (const id of ORDEN_GRUPOS) {
    const suyas = particion.get(id);
    if (!suyas || suyas.length === 0) continue;
    const porCategoria = agregarRanking(suyas, "categoria");
    const porCodigo = agregarRanking(suyas, "codigo");
    // Una marca que vendió y devolvió TODO dentro del período queda sin
    // renglones: no es una marca del período, es un no-evento (mismo criterio
    // que `agregarRanking` con sus grupos en cero neto).
    if (porCategoria.filas.length === 0 && porCodigo.filas.length === 0) continue;
    grupos.push({ id, nombre: nombreDeGrupo(id), totales: porCategoria.totales });
    categorias.push(...aligerar(id, porCategoria.filas));
    codigos.push(...aligerar(id, porCodigo.filas));
  }

  return { grupos, categorias, codigos };
}

/** Lo mismo para el período de comparación, en formato aliviado. */
export function armarPorMarcaComparativo(
  filas: readonly FilaArticuloDiario[],
  mapa: ReadonlyMap<number, GrupoMarcaId>,
): PorMarcaComparativo {
  const particion = particionarPorGrupo(filas, mapa);
  const grupos: { id: GrupoMarcaId; totales: TotalesRanking }[] = [];
  const categorias: FilaLigeraComparativa[] = [];
  const codigos: FilaLigeraComparativa[] = [];

  for (const id of ORDEN_GRUPOS) {
    const suyas = particion.get(id);
    if (!suyas || suyas.length === 0) continue;
    const porCategoria = agregarRanking(suyas, "categoria");
    const porCodigo = agregarRanking(suyas, "codigo");
    grupos.push({ id, totales: porCategoria.totales });
    categorias.push(...aligerarComparativo(id, porCategoria.filas));
    codigos.push(...aligerarComparativo(id, porCodigo.filas));
  }

  return { grupos, categorias, codigos };
}

/**
 * Formato de viaje → renglones completos, los que la pantalla ya sabe dibujar.
 *
 * 🩸 **`utilidad` y `margen` NO se mandan: se rearman con la MISMA cuenta del
 * servidor** (`utilidad = venta − costo` redondeado a centavos, y `margenDe`
 * para el margen, que es lo que devuelve "—" cuando la venta no es positiva).
 * Escribir acá una división a mano sería una segunda definición de margen, y dos
 * definiciones de margen en la misma pantalla es un margen que no se puede
 * verificar.
 *
 * @param detalles clave → segunda línea (la descripción del artículo). Sale del
 *                 arreglo COMPLETO que ya viajaba: mandarla otra vez por marca
 *                 sería repetir el texto más largo del payload.
 */
export function rehidratar(
  ligeras: readonly FilaLigera[],
  detalles?: ReadonlyMap<string, string>,
): RenglonRanking[] {
  return ligeras.map(f => {
    const utilidad = centavos(f.v - f.k);
    return {
      clave: f.c,
      etiqueta: f.c,
      detalle: detalles?.get(f.c) ?? "",
      unidades: f.u,
      venta: f.v,
      costo: f.k,
      utilidad,
      margen: margenDe(f.v, utilidad),
      articulos: f.a,
    };
  });
}

export function rehidratarComparativo(
  ligeras: readonly FilaLigeraComparativa[],
): RenglonComparativo[] {
  return ligeras.map(f => ({ clave: f.c, unidades: f.u, venta: f.v, utilidad: f.t }));
}

/** Índice clave → renglones de esa marca, para que el navegador filtre sin
 *  recorrer los 4.600 renglones en cada render. */
export function indexarPorGrupo<T extends { g: GrupoMarcaId }>(
  filas: readonly T[],
): Map<GrupoMarcaId, T[]> {
  const out = new Map<GrupoMarcaId, T[]>();
  for (const f of filas) {
    const arr = out.get(f.g);
    if (arr) arr.push(f);
    else out.set(f.g, [f]);
  }
  return out;
}

/** Las descripciones que ya viajaban en el arreglo completo, para rehidratar. */
export function mapaDetalles(filas: readonly RenglonRanking[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of filas) if (f.detalle) out.set(f.clave, f.detalle);
  return out;
}

/** El departamento canónico de un renglón del agrupador "por departamento",
 *  reexportado acá para que la ruta importe de un solo lugar. */
export { departamentoCanonico, grupoDeDepartamento, nombreDeGrupo };
export type { ModoRanking };
