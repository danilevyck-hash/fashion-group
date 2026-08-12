// ============================================================================
// Marketing — los PERÍODOS de una marca, como SECCIONES con su detalle
// (12-ago-2026). Módulo PURO: sin base, sin I/O.
//
// Daniel, textual: *"quiero que dentro de cada marca aparezca 'periodo uno'
// periodo dos, y dentro de cada periodo la info… que este ordenado"*. El
// módulo alimenta los TRES NIVELES del rediseño:
//
//   /marketing                        → nivel 1 (marcas; usa los totales)
//   /marketing/calvin-klein           → nivel 2 (SUS períodos = estas secciones)
//   /marketing/calvin-klein/mid-2026  → nivel 3 (el detalle de UNA sección)
//
//   Período 2026 (abierto) · $5.840,00          [Cerrar] [Bajar ZIP]
//     Nova Lux, S.a. · 1 entrega · $1.040,00
//     General · 6 pagos de impulsadora · $4.800,00
//   mid 2026 (cerrado) · $46.462,14             [ZIP] [Excel]
//     …los proyectos con el monto que reportaron EN ese período…
//
// 🔴 LOS TOTALES NO SE CALCULAN ACÁ. Cada sección lleva el total que ya sumó
// `agregarPorBloques` (`bloques[].total` para el abierto, `cerrados[].total`
// para cada cerrado) — los MISMOS números de las tarjetas del inicio. Y el
// monto de cada proyecto sale de `resumen.detalle`, que el agregador acumula
// EN LAS MISMAS LÍNEAS que arman esos totales: por construcción, la suma del
// detalle de una sección ES el total de la sección. Escribir acá una segunda
// cuenta es la forma exacta en que este repo ya se quemó con los signos de
// las notas de crédito.
//
// 🔴 UN PROYECTO CON GASTO EN DOS PERÍODOS APARECE EN LAS DOS SECCIONES, cada
// una con SU monto — eso ES el orden que pidió Daniel. La línea "También
// reportó en …" del diseño anterior se retiró: la estructura ya lo muestra,
// y decirlo dos veces era ruido. `seccionDeProyecto` (el clasificador de
// "¿en qué única sección va?") se retiró con ella.
//
// 🔴 QUIÉN DECIDE a qué período va cada documento: el CLASIFICADOR único
// (`crearClasificadorPeriodos` en resumen-bloques.ts), vía el agregador. Un
// sello a un período ABIERTO (incluido el fantasma `pvh · abierto`) cuenta
// como actual, así que la pantalla se ve bien ANTES y DESPUÉS de que Daniel
// repare esos sellos.
// ============================================================================

import {
  SECCION_ABIERTO,
  claveDeSeccion,
  type BloqueResumen,
  type DetalleProyectoPeriodo,
  type PeriodoCerradoResumen,
} from "./resumen-bloques";
import { SLUG_PERIODO_ACTUAL, asignarSlugsDePeriodo } from "./slugs";

export { SECCION_ABIERTO, claveDeSeccion };

// ----------------------------------------------------------------------------
// La fila "GENERAL": impulsadoras y gastos SIN cliente de la marca.
//
// 🔴 Daniel: *"las impulsadoras… no las veo en tommy ni nada"*. Esos gastos
// eran INVISIBLES en la página de la marca. La fila General los muestra EN SU
// PERÍODO (el abierto o el cerrado al que estén sellados), con total y conteo,
// y abre el detalle.
//
// 🔴 NO DEPENDE DEL SELLO PARA LA MARCA: la porción de cada gasto sale de
// `mk_factura_marcas` (la marca REAL del gasto), nunca de la clave del sello.
// El sello se usa SOLO para decidir el PERÍODO — y un sello a un período
// abierto, sea de quien sea, deja el gasto en el actual.
// ----------------------------------------------------------------------------

export interface GastoGeneralItem {
  id: string;
  /** Fecha visible (fecha_factura si existe; si no, created_at). */
  fecha: string | null;
  /** Descripción para la lista: concepto, o proveedor, o el número. */
  descripcion: string;
  /** Porción de ESTA marca (total × % normalizado), a 2 decimales. */
  monto: number;
  esImpulsadora: boolean;
}

export interface GastoGeneral {
  count: number;
  total: number;
  items: GastoGeneralItem[];
}

/** Texto de un gasto suelto: lo primero que exista y diga algo. */
export function descripcionDeGastoSuelto(f: {
  concepto?: string | null;
  proveedor?: string | null;
  numero_factura?: string | null;
  esImpulsadora?: boolean;
}): string {
  const concepto = (f.concepto ?? "").trim();
  if (concepto) return concepto;
  const proveedor = (f.proveedor ?? "").trim();
  if (proveedor) return proveedor;
  const numero = (f.numero_factura ?? "").trim();
  if (numero) return `Factura ${numero}`;
  return f.esImpulsadora ? "Pago de impulsadora" : "Gasto sin detalle";
}

/** Suma y ordena los items (más nuevo primero) y redondea el total. */
export function armarGastoGeneral(
  items: ReadonlyArray<GastoGeneralItem>,
): GastoGeneral {
  const ordenados = [...items].sort((a, b) =>
    (b.fecha ?? "").localeCompare(a.fecha ?? ""),
  );
  const total = ordenados.reduce((s, x) => s + x.monto, 0);
  return {
    count: ordenados.length,
    total: Number(total.toFixed(2)),
    items: ordenados,
  };
}

// ----------------------------------------------------------------------------
// LAS SECCIONES: una por período, el abierto SIEMPRE primero.
// ----------------------------------------------------------------------------

export interface SeccionProyecto {
  id: string;
  /** Lo gastado por este proyecto EN este período, para esta marca. */
  monto: number;
  /** Facturas de este proyecto EN este período (para el subtítulo). */
  facturas: number;
  /** Entregas de muebles de este proyecto EN este período. */
  entregas: number;
}

export interface SeccionPeriodo {
  /** Clave estable (ver `claveDeSeccion`): "abierto" | id | legacy::nombre. */
  key: string;
  /** Segmento `[periodo]` de la URL (slug del nombre; ver lib/marketing/slugs). */
  slug: string;
  /** Id del período en `mk_periodos` (null = sin fila: abierto sin DDL o legacy). */
  id: string | null;
  nombre: string;
  estado: "abierto" | "cerrado";
  cerradoEn: string | null;
  /** El total del período — EL DEL AGREGADOR, nunca recalculado acá. */
  total: number;
  /** Los documentos del período (facturas/muebles), también del agregador. */
  docs: { facturas: number; muebles: number };
  /** Facturas $ y Mobiliario $ del período — el desglose que no se funde. */
  montos: { facturas: number; muebles: number };
  /** Solo el abierto, con período real y con gasto adentro. */
  puedeCerrar: boolean;
  proyectos: SeccionProyecto[];
  /** Impulsadoras y gastos sin cliente DE ESTE período, o null. */
  general: GastoGeneral | null;
}

export interface InsumosSecciones {
  /** Código de la marca (el bloque de la lista). */
  bloqueKey: string;
  /** El bloque del agregador para esa marca (`resumen.bloques`). */
  bloque: Pick<
    BloqueResumen,
    "periodoAbierto" | "total" | "facturas" | "muebles"
  > | null;
  /** `resumen.cerrados` ENTERO — acá se filtra por la marca. */
  cerrados: ReadonlyArray<
    Pick<
      PeriodoCerradoResumen,
      "id" | "nombre" | "cerradoEn" | "total" | "bloqueKey" | "facturas" | "muebles"
    >
  >;
  /** `resumen.detalle` ENTERO — acá se filtra por la marca. */
  detalle: ReadonlyArray<DetalleProyectoPeriodo>;
  /** El General de cada sección, por clave (lo arma la ruta con los items). */
  generales: ReadonlyMap<string, GastoGeneral>;
  conPeriodos: boolean;
  /** Orden maestro de proyectos (created_at desc): las filas salen así. */
  ordenProyectos: ReadonlyArray<string>;
}

/**
 * Arma las secciones de la página de una marca.
 *
 *  - El ABIERTO va SIEMPRE primero (aunque esté en cero: "Todavía no hay
 *    gasto en este período" es información).
 *  - Los cerrados van después, en el orden en que el agregador ya los trae
 *    (del más nuevo al más viejo; el legacy sin `cerradoEn` al final).
 *  - `total` es el del agregador. Los montos por proyecto vienen del detalle
 *    del agregador — la misma pasada que sumó el total.
 */
export function armarSecciones(i: InsumosSecciones): SeccionPeriodo[] {
  const orden = new Map(i.ordenProyectos.map((id, idx) => [String(id), idx]));

  const proyectosDe = (clave: string): SeccionPeriodo["proyectos"] =>
    i.detalle
      .filter(
        (d) =>
          d.bloqueKey === i.bloqueKey &&
          d.seccion === clave &&
          d.proyectoId !== null,
      )
      .map((d) => ({
        id: String(d.proyectoId),
        monto: Number(d.monto.toFixed(2)),
        facturas: d.facturas,
        entregas: d.entregas,
      }))
      .sort(
        (a, b) =>
          (orden.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orden.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );

  const out: Array<Omit<SeccionPeriodo, "slug">> = [];

  if (i.bloque) {
    const sinGasto =
      i.bloque.facturas.count === 0 && i.bloque.muebles.count === 0;
    out.push({
      key: SECCION_ABIERTO,
      id: i.bloque.periodoAbierto?.id ?? null,
      nombre: i.bloque.periodoAbierto?.nombre ?? "Período actual",
      estado: "abierto",
      cerradoEn: null,
      total: i.bloque.total,
      docs: {
        facturas: i.bloque.facturas.count,
        muebles: i.bloque.muebles.count,
      },
      montos: {
        facturas: i.bloque.facturas.total,
        muebles: i.bloque.muebles.total,
      },
      puedeCerrar: i.conPeriodos && !sinGasto && !!i.bloque.periodoAbierto?.id,
      proyectos: proyectosDe(SECCION_ABIERTO),
      general: i.generales.get(SECCION_ABIERTO) ?? null,
    });
  }

  for (const c of i.cerrados) {
    if (c.bloqueKey !== i.bloqueKey) continue;
    const clave = claveDeSeccion({ id: c.id, nombre: c.nombre });
    out.push({
      key: clave,
      id: c.id,
      nombre: c.nombre,
      estado: "cerrado",
      cerradoEn: c.cerradoEn,
      total: c.total,
      docs: { facturas: c.facturas.count, muebles: c.muebles.count },
      montos: { facturas: c.facturas.total, muebles: c.muebles.total },
      puedeCerrar: false,
      proyectos: proyectosDe(clave),
      general: i.generales.get(clave) ?? null,
    });
  }

  // El slug de la URL: el nombre del período, único dentro de la marca (el
  // abierto va primero, así que ante un nombre repetido se queda con el slug
  // limpio; ver lib/marketing/slugs.ts).
  return asignarSlugsDePeriodo(out);
}

/**
 * La sección que pide el segmento `[periodo]` de la URL.
 *
 * `actual` es el alias PERMANENTE del período abierto: sobrevive al cierre
 * (siempre apunta al abierto que haya hoy) y es a donde salta el nivel 2
 * cuando la marca tiene un solo período.
 */
export function seccionPorSlug(
  secciones: ReadonlyArray<SeccionPeriodo>,
  slug: string,
): SeccionPeriodo | null {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === SLUG_PERIODO_ACTUAL) {
    return secciones.find((x) => x.estado === "abierto") ?? null;
  }
  return secciones.find((x) => x.slug === s) ?? null;
}

/**
 * El subtítulo de la fila "General": si todos los gastos del período son
 * pagos de impulsadora lo dice con esas palabras (el caso real del mockup);
 * si hay mezcla, la descripción genérica de siempre.
 */
export function descripcionGeneral(g: GastoGeneral): string {
  const n = g.count;
  if (n > 0 && g.items.every((it) => it.esImpulsadora)) {
    return `${n} ${n === 1 ? "pago" : "pagos"} de impulsadora`;
  }
  return `${n} ${n === 1 ? "gasto" : "gastos"} · impulsadoras y gastos sin cliente`;
}
