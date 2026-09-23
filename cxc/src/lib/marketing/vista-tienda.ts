// ============================================================================
// Marketing — LA VISTA DE UNA TIENDA. Módulo PURO (sin React, sin Supabase).
//
// Daniel (22-sep-2026): *«debería estar organizado: ver por cliente, busco el
// cliente o proyecto y ver adentro la info (por marca etc.)»*.
//
// Hoy, para llegar a un gasto hay que ir Marca → Período → Proyecto. Acá se
// entra por la TIENDA y adentro está TODO lo suyo agrupado POR MARCA: las
// facturas del proveedor, los muebles que salieron de la bodega y los pagos de
// impulsadora, cada uno con su tipo, su proveedor, su monto, su fecha, si se
// reporta o no, y en qué estado está el período al que quedó sellado.
//
// 🔴 EL TOTAL ES SOLO DE LO REPORTADO. Lo apagado se VE —en gris, con su
// rótulo— y NO suma: la regla sale de `periodo-estado.ts › totalesDelPeriodo`,
// que es la única que dice qué suma. Acá no hay una segunda definición.
//
// 🔴 LAS MARCAS NUNCA SE SUMAN ENTRE SÍ en un total del grupo… salvo el total
// de ESTA TIENDA, que es lo que Daniel pidió ver: cuánto se ha gastado en esa
// tienda. Es la suma de sus marcas y se dice que lo es (`totalDeLaTienda`).
//
// 🔴 LA TIENDA SE RESUELVE POR CÓDIGO (`clientes_master.codigo`, D-25), NUNCA
// por nombre — la misma regla del CXC y del Directorio. El nombre es solo lo
// que se dibuja. El cajón sin tienda es «General» (`TIENDA_GENERAL`).
// ============================================================================

import {
  ROTULO_DE_TIPO,
  TIENDA_GENERAL,
  type TipoGasto,
} from "./gasto";
import { totalesDelPeriodo, type TotalesDelPeriodo } from "./periodo-estado";

/**
 * 🔴 EL INTERRUPTOR. En `true` se dibuja la vista de tienda, el resultado de
 * Marketing aparece en la búsqueda global y el buscador de proyectos compara
 * por palabra. En `false` NADA cambia: no hay pantalla nueva, el buscador
 * global no ofrece Marketing y el de proyectos vuelve a su `includes`.
 *
 * Daniel prueba en producción con su secretaria; apagarlo es una línea.
 */
export const VISTA_TIENDA = true;

/** El código con el que se pide el cajón «General» en la dirección. */
export const CODIGO_GENERAL = "general";

/** ¿Este código de la URL es el cajón «General»? Igualdad, no parecido. */
export function esCodigoGeneral(codigo: unknown): boolean {
  return String(codigo ?? "").trim().toLowerCase() === CODIGO_GENERAL;
}

/**
 * 🔴 LA DIRECCIÓN DE UNA TIENDA, UNA SOLA VEZ. La usan la pantalla, la
 * búsqueda global (⌘K) y los candados. Sin tienda → el cajón «General».
 */
export function hrefDeTienda(codigo: string | null | undefined): string {
  const c = String(codigo ?? "").trim();
  const destino = c.length > 0 ? c : CODIGO_GENERAL;
  return `/marketing/tienda/${encodeURIComponent(destino)}`;
}

/** El nombre que se dibuja arriba: el del directorio, si no el código. */
export function rotuloDeLaTienda(args: {
  codigo: string | null;
  nombre?: string | null;
}): string {
  const nombre = String(args.nombre ?? "").trim();
  if (nombre.length > 0) return nombre;
  const codigo = String(args.codigo ?? "").trim();
  return codigo.length > 0 ? codigo : TIENDA_GENERAL;
}

// ─── LAS FILAS ───────────────────────────────────────────────────────────────

/** Un gasto de la tienda, tal como se dibuja en su renglón. */
export interface FilaDeTienda {
  id: string;
  tipo: TipoGasto;
  /** Código de la marca (TH · CK · KL · RBK · J). UNA por gasto. */
  marcaCodigo: string;
  /** Nombre de la marca para mostrar. */
  marcaNombre: string;
  /** Quien facturó. Vacío en un mueble. */
  proveedor: string;
  /** Qué fue: el concepto de la factura o la nota del gasto. */
  detalle: string;
  monto: number;
  /** "YYYY-MM-DD". */
  fecha: string;
  seReporta: boolean;
  /** "abierto" · "cerrado" · `null` cuando el gasto no quedó sellado. */
  estadoPeriodo: "abierto" | "cerrado" | null;
  /** Nombre del período al que quedó sellado, si se sabe. */
  periodoNombre: string | null;
  // ── Lo que la ficha como UNA lista necesita de más (23-sep-2026). Todo
  //    OPCIONAL: la vista de antes no lo lee y la ruta lo llena solo con el
  //    interruptor `MARKETING_TIENDAS_Y_MARCAS` prendido. ──
  /** N° de la factura, tal como lo escribió el proveedor. */
  numero?: string;
  subtotal?: number;
  itbms?: number;
  /** El concepto crudo de la factura (o las notas del mueble). */
  concepto?: string;
  /** La nota libre del gasto (`nota`). */
  nota?: string;
  /** Mes cubierto por un pago de impulsadora, ya escrito para la pantalla. */
  mes?: string;
  /** `true` = tiene su PDF (o foto) de factura adjunto. */
  tienePdf?: boolean;
  /** Anulada: se ve plegada, nunca suma. */
  anulada?: boolean;
  anuladoMotivo?: string;
  /** Solo un mueble: el proyecto viejo al que quedó atado, si lo hay. */
  proyectoId?: string | null;
}

/** El rótulo del tipo, para la columna «Tipo». Una sola fuente: `gasto.ts`. */
export function rotuloDeFila(fila: Pick<FilaDeTienda, "tipo">): string {
  return ROTULO_DE_TIPO[fila.tipo];
}

/** Lo que se dice del estado del período de una fila. */
export function rotuloDelPeriodo(fila: Pick<FilaDeTienda, "estadoPeriodo" | "periodoNombre">): string {
  if (fila.estadoPeriodo === null) return "Sin período";
  const estado = fila.estadoPeriodo === "abierto" ? "Abierto" : "Cerrado";
  const nombre = String(fila.periodoNombre ?? "").trim();
  return nombre.length > 0 ? `${nombre} · ${estado}` : estado;
}

// ─── AGRUPAR POR MARCA ───────────────────────────────────────────────────────

export interface GrupoPorMarca {
  marcaCodigo: string;
  marcaNombre: string;
  filas: FilaDeTienda[];
  totales: TotalesDelPeriodo;
}

/**
 * Agrupa las filas de la tienda POR MARCA. Las marcas van de mayor a menor
 * total reportado (empate: por nombre). Adentro, lo más nuevo primero, y el
 * empate se rompe por `id` para que el orden no baile entre dos cargas.
 */
export function agruparPorMarca(
  filas: ReadonlyArray<FilaDeTienda>,
): GrupoPorMarca[] {
  const grupos = new Map<string, { marcaCodigo: string; marcaNombre: string; filas: FilaDeTienda[] }>();
  for (const f of filas) {
    const codigo = String(f.marcaCodigo ?? "").trim().toUpperCase() || "—";
    let g = grupos.get(codigo);
    if (!g) {
      g = { marcaCodigo: codigo, marcaNombre: String(f.marcaNombre ?? "").trim() || codigo, filas: [] };
      grupos.set(codigo, g);
    }
    g.filas.push(f);
  }
  const lista: GrupoPorMarca[] = [...grupos.values()].map((g) => ({
    marcaCodigo: g.marcaCodigo,
    marcaNombre: g.marcaNombre,
    filas: [...g.filas].sort(
      (a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id),
    ),
    totales: totalesDelPeriodo(g.filas.map((f) => ({ monto: f.monto, seReporta: f.seReporta }))),
  }));
  lista.sort(
    (a, b) =>
      b.totales.reportado - a.totales.reportado ||
      a.marcaNombre.localeCompare(b.marcaNombre, "es"),
  );
  return lista;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 🔴 EL TOTAL DE LA TIENDA: la suma de lo REPORTADO de sus marcas. Lo apagado
 * viaja aparte en `noReportado` y nunca se le suma.
 */
export function totalDeLaTienda(grupos: ReadonlyArray<GrupoPorMarca>): TotalesDelPeriodo {
  let reportado = 0;
  let noReportado = 0;
  let cantidadReportada = 0;
  let cantidadNoReportada = 0;
  for (const g of grupos) {
    reportado += g.totales.reportado;
    noReportado += g.totales.noReportado;
    cantidadReportada += g.totales.cantidadReportada;
    cantidadNoReportada += g.totales.cantidadNoReportada;
  }
  return {
    reportado: round2(reportado),
    noReportado: round2(noReportado),
    cantidadReportada,
    cantidadNoReportada,
  };
}
