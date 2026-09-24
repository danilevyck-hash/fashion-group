// ============================================================================
// Marketing — LOS REPORTES POR MARCA Y POR TIENDA (pieza C, 22-sep-2026).
// Módulo PURO: sin React, sin Supabase, sin fetch. Recibe GASTOS ya leídos.
//
// Daniel: *«Reportes: UN total, solo lo reportado; por marca / por tienda;
// "Por proyecto" se va; "Exportar Excel" se va. Los gastos de las marcas
// NUNCA se suman entre sí en un total del grupo.»*
//
//   · UN total por fila: lo que se reporta. Lo apagado se dice aparte y no
//     entra (`sumaEnElPeriodo`, del cimiento).
//   · La MARCA es la del gasto y es UNA (`exigirUnaMarca`): 100 % del monto,
//     sin el reparto `pct / sumPct` de antes. ⚠️ Si una fila vieja llegara con
//     dos marcas (medido: 0 de 108), se reparte a partes iguales y se avisa —
//     un reporte que se cae es peor que uno que dice cómo repartió.
//   · La TIENDA es la del gasto (`agruparPorTienda`): «General» junta lo que
//     no es de ninguna y va al final. Multifashion es una TIENDA (D-108): sale
//     como fila por tienda, NUNCA como marca.
//   · Por marca salen las CINCO de `MARCAS_BLOQUE`, en su orden, aunque estén
//     en cero (una marca sin gasto sigue siendo alguien a quien se le reporta).
//     🔴 No hay un total al pie: sería sumar marcas entre sí.
// ============================================================================

import { agruparPorTienda, type GastoAgrupable } from "./agrupar-por-tienda";
import { MARCAS_BLOQUE, SIN_BLOQUE, bloqueDeCodigo } from "./bloques";
import { ErrorMarcaRepartida, exigirUnaMarca, type TipoGasto } from "./gasto";
import { sumaEnElPeriodo } from "./periodo-estado";
import type { PeriodoDelGasto } from "./periodo-manda";

/** Un gasto tal como lo necesita el reporte: ya con su marca y su tienda. */
export interface GastoParaReporte {
  id: string;
  tipo: TipoGasto;
  /** Código de `mk_marcas` (TH · CK · …). Vacío = sin marca. */
  marcaCodigo: string | null;
  /** Código del directorio (D-25). `null` = «General». */
  tiendaCodigo: string | null;
  tiendaNombre?: string | null;
  monto: number;
  seReporta?: boolean | null;
  /** "YYYY-MM-DD": la del documento, para el filtro por año. */
  fecha: string | null;
  /**
   * 🔴 `true` = es de la TIENDA PROPIA del grupo (D-108, o su proyecto). Por
   * tienda sale como una fila más; por MARCA no se le cobra a nadie (Daniel,
   * 22-sep-2026: *«nunca se le cobran a una marca»*). Lo pone la lectura con
   * la regla única de `tiendas-y-marcas.ts`; ausente = no lo es. Este módulo
   * no sabe cuál es esa tienda a propósito: solo respeta la marca.
   */
  esTiendaPropia?: boolean | null;
  /**
   * 🔴 EL PERÍODO MANDA (23-sep-2026): el período CERRADO al que quedó sellado
   * el gasto, o `null` si sigue abierto. Lo pone la lectura solo con
   * `MARKETING_TIENDAS_Y_MARCAS`; el reporte por tienda no lo mira — la
   * portada lo parte por período ANTES de llamarlo (`periodo-manda.ts`).
   */
  periodo?: PeriodoDelGasto | null;
}

/** Nombre visible de cada marca, por código. */
export type NombresDeMarca = Readonly<Record<string, string>>;

export interface ReporteMarcaFila {
  codigo: string;
  nombre: string;
  /** El ÚNICO total: lo reportado. */
  reportado: number;
  cantidad: number;
  /** Lo apagado: se dice, no se suma. */
  noReportado: number;
  cantidadNoReportada: number;
}

export interface ReporteTiendaFila {
  tiendaCodigo: string | null;
  tienda: string;
  /** Reportado por marca, por NOMBRE de marca (columnas de la tabla). */
  porMarca: Record<string, number>;
  /** El total de la tienda: la suma de sus marcas REPORTADAS. */
  total: number;
  noReportado: number;
  cantidad: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ¿La fecha cae en el año? Sin año, todo entra; sin fecha, nada. */
export function enElAnio(fecha: string | null | undefined, anio?: number): boolean {
  if (!anio) return true;
  const f = String(fecha ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(f) && Number(f.slice(0, 4)) === anio;
}

/** Marca de un gasto, como la pide el reporte: la UNA, o `null` si no hay. */
export function marcaUnica(marcas: ReadonlyArray<{ marcaId: string }>): string | null {
  try {
    return exigirUnaMarca(marcas).marcaId;
  } catch (err) {
    if (err instanceof ErrorMarcaRepartida && err.marcas === 0) return null;
    throw err;
  }
}

/**
 * 🔴 Reparte el monto de un gasto entre sus marcas: con UNA, el 100 %. Con
 * dos o más (una fila vieja) a partes iguales, y `repartido: true` para que
 * quien lea avise. Nunca `pct / sumPct`.
 */
export function partesPorMarca(
  monto: number,
  marcas: ReadonlyArray<{ marcaId: string }>,
): { partes: Array<{ marcaId: string; monto: number }>; repartido: boolean } {
  const distintas = [...new Set(marcas.map((m) => String(m.marcaId ?? "").trim()).filter(Boolean))];
  if (distintas.length === 0) return { partes: [], repartido: false };
  if (distintas.length === 1) return { partes: [{ marcaId: distintas[0], monto }], repartido: false };
  const cada = round2(monto / distintas.length);
  return { partes: distintas.map((marcaId) => ({ marcaId, monto: cada })), repartido: true };
}

/**
 * Por MARCA: las cinco del módulo, en su orden, con lo reportado y lo apagado.
 * Un gasto sin marca conocida (`SIN_BLOQUE`) no se le reporta a nadie: no
 * entra en ninguna fila. 🔴 No hay total al pie a propósito.
 */
export function reportePorMarcaDe(
  gastos: ReadonlyArray<GastoParaReporte>,
  nombres: NombresDeMarca,
  anio?: number,
): ReporteMarcaFila[] {
  const filas = new Map<string, ReporteMarcaFila>(
    MARCAS_BLOQUE.map((m) => [
      m.key,
      {
        codigo: m.key,
        nombre: nombres[m.key] ?? m.nombreFallback,
        reportado: 0,
        cantidad: 0,
        noReportado: 0,
        cantidadNoReportada: 0,
      },
    ]),
  );
  for (const g of gastos) {
    if (!enElAnio(g.fecha, anio)) continue;
    const k = bloqueDeCodigo(g.marcaCodigo);
    if (k === SIN_BLOQUE) continue;
    const fila = filas.get(k);
    if (!fila) continue;
    const monto = Number(g.monto);
    if (!Number.isFinite(monto)) continue;
    if (sumaEnElPeriodo({ seReporta: g.seReporta })) {
      fila.reportado += monto;
      fila.cantidad += 1;
    } else {
      fila.noReportado += monto;
      fila.cantidadNoReportada += 1;
    }
  }
  return [...filas.values()].map((f) => ({
    ...f,
    reportado: round2(f.reportado),
    noReportado: round2(f.noReportado),
  }));
}

/**
 * Por TIENDA: una fila por tienda del directorio, con una columna por marca
 * y «General» al final. El total de la fila es la suma de lo REPORTADO de sus
 * marcas; lo apagado va aparte. Multifashion (D-108) es una fila más.
 */
export function reportePorTiendaDe(
  gastos: ReadonlyArray<GastoParaReporte>,
  nombres: NombresDeMarca,
  anio?: number,
): ReporteTiendaFila[] {
  const delAnio = gastos.filter((g) => enElAnio(g.fecha, anio));
  const grupos = agruparPorTienda<GastoAgrupable & { marcaCodigo: string | null }>(
    delAnio.map((g) => ({
      id: g.id,
      tiendaCodigo: g.tiendaCodigo,
      tiendaNombre: g.tiendaNombre ?? null,
      monto: g.monto,
      seReporta: g.seReporta,
      marcaCodigo: g.marcaCodigo,
    })),
  );
  return grupos.map((gr) => {
    const porMarca: Record<string, number> = {};
    for (const g of gr.gastos) {
      if (!sumaEnElPeriodo({ seReporta: g.seReporta })) continue;
      const monto = Number(g.monto);
      if (!Number.isFinite(monto)) continue;
      const k = bloqueDeCodigo(g.marcaCodigo);
      const nombre =
        k === SIN_BLOQUE
          ? "Sin marca"
          : (nombres[k] ?? MARCAS_BLOQUE.find((m) => m.key === k)?.nombreFallback ?? k);
      porMarca[nombre] = round2((porMarca[nombre] ?? 0) + monto);
    }
    return {
      tiendaCodigo: gr.tiendaCodigo,
      tienda: gr.rotulo,
      porMarca,
      total: gr.totalReportado,
      noReportado: gr.totalNoReportado,
      cantidad: gr.cantidadReportada,
    };
  });
}
