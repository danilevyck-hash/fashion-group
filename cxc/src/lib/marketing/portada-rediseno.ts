// ============================================================================
// Marketing — LA PORTADA ABIERTOS | CERRADOS (pieza C del rediseño, 22-sep-2026).
// Módulo PURO: sin React, sin Supabase, sin fetch.
//
// Lo que Daniel definió ese día, en sus palabras:
//   · *«no quiero pipeline, cuando lo cierro es porque lo cobré»* → DOS estados
//     y la portada se parte en DOS pestañas: Abiertos | Cerrados. No hay una
//     tercera. Daniel: *«Lo cerrado no debería estar como aparte?»*.
//   · Al cerrar le pone EL NOMBRE ÉL (`nombre_al_cerrar`) y una nota de
//     crédito como TEXTO, sin cálculo. En Cerrados se ve ese nombre, la fecha
//     de cierre y la nota si la hay.
//   · *«Multifashion deja de ser tarjeta de marca»*: es una TIENDA (D-108).
//     Acá no se dibuja como marca. ⚠️ Su plata NO se mueve de bucket (eso lo
//     decide Daniel): sigue en su tienda, y la portada la enlaza aparte.
//   · Cada marca muestra SOLO lo que se reporta; lo apagado va en gris, sin
//     sumar. Y *«los gastos de las marcas NUNCA se suman entre sí»*: acá no
//     existe un total del grupo, con candado.
//
// 🔴 EL INTERRUPTOR. `true` = la portada nueva, el cierre con nombre y los
// reportes solo con lo reportado. `false` = la pantalla de antes, INTACTA
// (Daniel prueba en producción con su secretaria). Nada de lo que se guarda
// cambia de forma con el interruptor: solo qué se dibuja y qué se pide.
// ============================================================================

import { MULTIFASHION_KEY, SIN_BLOQUE } from "./bloques";

/** 🔴 El interruptor de la pieza C. `false` = la portada, el cierre y los reportes de antes. */
export const MARKETING_PORTADA_REDISENO = true;

/** Las dos pestañas de la portada. Lista CERRADA: no hay «en proceso». */
export const PESTANAS_PORTADA = ["abiertos", "cerrados"] as const;
export type PestanaPortada = (typeof PESTANAS_PORTADA)[number];

export function esPestanaPortada(v: unknown): v is PestanaPortada {
  return v === "abiertos" || v === "cerrados";
}

/** Un conteo con su monto, como lo manda `/api/marketing/inicio`. */
export interface MontoPortada {
  count: number;
  total: number;
}

/** Lo que la portada necesita de cada bloque del agregador. */
export interface BloquePortada {
  key: string;
  nombre: string;
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: MontoPortada;
  muebles: MontoPortada;
  total: number;
  /** Lo apagado con «¿Se reporta a la marca?». Ausente = cero (la ruta de antes). */
  noReportado?: MontoPortada | null;
}

/** Lo que la portada necesita de cada período cerrado del agregador. */
export interface CerradoPortada {
  id: string | null;
  bloqueKey: string;
  bloqueNombre: string;
  nombre: string;
  cerradoEn: string | null;
  total: number;
  noReportado?: MontoPortada | null;
}

/** Las columnas nuevas de `mk_periodos`, por id, completadas por `completarPeriodo`. */
export interface PeriodoMeta {
  abiertoEn: string | null;
  nombreAlCerrar: string | null;
  notaCredito: string | null;
  /**
   * `mk_periodos.proveedor_key`: el código de marca en los períodos nuevos, y
   * la casa (`'pvh'`) en el cierre viejo que comparten Tommy y Calvin.
   * Opcional: sin él la fila se dibuja como siempre.
   */
  proveedorKey?: string | null;
}

export interface FilaAbierta {
  key: string;
  nombre: string;
  periodoId: string | null;
  periodoNombre: string;
  /** El ÚNICO total que se le muestra: lo que se reporta. */
  reportado: number;
  cantidadReportada: number;
  /** Lo apagado: se dice en gris, nunca se suma. */
  noReportado: number;
  cantidadNoReportada: number;
  /** Días enteros desde que abrió, contra el «hoy» de Panamá. `null` sin fecha. */
  diasAbierto: number | null;
  /** `true` = «Sin marca asignada»: no es una marca, es una decisión pendiente. */
  sinMarca: boolean;
}

export interface FilaCerrada {
  id: string;
  bloqueKey: string;
  marcaNombre: string;
  /** El nombre que se le puso al cerrar; si el cierre es viejo, el de siempre. */
  nombre: string;
  cerradoEn: string | null;
  notaCredito: string | null;
  total: number;
  noReportado: number;
  /** La casa del período (`proveedor_key`); la usa `cerrados-por-periodo.ts`. */
  proveedorKey: string | null;
}

/** Fecha (YYYY-MM-DD) de Panamá de un instante ISO; `null` si no se puede leer. */
export function fechaPanamaDeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - 5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Días enteros entre un instante y el «hoy» de Panamá (que llega de afuera:
 * este módulo no mira el reloj). Nunca negativo; `null` sin fecha.
 */
export function diasDesde(iso: string | null | undefined, hoyPanama: string): number | null {
  const desde = fechaPanamaDeIso(iso);
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(hoyPanama)) return null;
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hoyPanama.slice(0, 4), +hoyPanama.slice(5, 7) - 1, +hoyPanama.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** «Abrió hoy» · «1 día abierto» · «41 días abierto». Vacío sin fecha. */
export function textoDiasAbierto(dias: number | null): string {
  if (dias === null) return "";
  if (dias === 0) return "Abrió hoy";
  return dias === 1 ? "1 día abierto" : `${dias} días abierto`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Las filas de la pestaña ABIERTOS: una por marca, en el orden del agregador.
 * 🔴 Multifashion NO sale: es una tienda. «Sin marca asignada» SÍ sale si
 * trae algo — es plata esperando una decisión, y esconderla es peor.
 */
export function filasAbiertas(
  bloques: ReadonlyArray<BloquePortada>,
  meta: Readonly<Record<string, PeriodoMeta>>,
  hoyPanama: string,
): FilaAbierta[] {
  const filas: FilaAbierta[] = [];
  for (const b of bloques) {
    if (b.key === MULTIFASHION_KEY) continue;
    const periodoId = b.periodoAbierto?.id ?? null;
    const m = periodoId ? meta[periodoId] : undefined;
    filas.push({
      key: b.key,
      nombre: b.nombre,
      periodoId,
      periodoNombre: b.periodoAbierto?.nombre ?? "Período actual",
      reportado: round2(Number(b.total) || 0),
      cantidadReportada: (b.facturas?.count ?? 0) + (b.muebles?.count ?? 0),
      noReportado: round2(Number(b.noReportado?.total) || 0),
      cantidadNoReportada: b.noReportado?.count ?? 0,
      diasAbierto: diasDesde(m?.abiertoEn ?? null, hoyPanama),
      sinMarca: b.key === SIN_BLOQUE,
    });
  }
  return filas;
}

/**
 * Las filas de la pestaña CERRADOS, la más reciente primero. El nombre es el
 * que Daniel le puso al cerrar; un cierre de antes del rediseño («mid 2026»)
 * conserva el suyo. Un archivo legacy sin fila propia (`id` null) no sale:
 * no tiene cierre que mostrar.
 */
export function filasCerradas(
  cerrados: ReadonlyArray<CerradoPortada>,
  meta: Readonly<Record<string, PeriodoMeta>>,
): FilaCerrada[] {
  const filas: FilaCerrada[] = [];
  for (const c of cerrados) {
    if (!c.id) continue;
    const m = meta[c.id];
    const nombreAlCerrar = String(m?.nombreAlCerrar ?? "").trim();
    filas.push({
      id: c.id,
      bloqueKey: c.bloqueKey,
      marcaNombre: c.bloqueNombre,
      nombre: nombreAlCerrar.length > 0 ? nombreAlCerrar : c.nombre,
      cerradoEn: c.cerradoEn ?? null,
      notaCredito: String(m?.notaCredito ?? "").trim() || null,
      total: round2(Number(c.total) || 0),
      noReportado: round2(Number(c.noReportado?.total) || 0),
      proveedorKey: m?.proveedorKey ?? null,
    });
  }
  filas.sort(
    (a, b) =>
      (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? "") ||
      a.marcaNombre.localeCompare(b.marcaNombre, "es"),
  );
  return filas;
}

/**
 * La tienda propia, para enlazarla APARTE de las marcas. `null` si el
 * agregador no trajo el bucket o está en cero: sin plata no hay qué enlazar.
 */
export function filaTiendaMultifashion(
  bloques: ReadonlyArray<BloquePortada>,
): { key: string; nombre: string; total: number; cantidad: number } | null {
  const b = bloques.find((x) => x.key === MULTIFASHION_KEY);
  if (!b) return null;
  const cantidad = (b.facturas?.count ?? 0) + (b.muebles?.count ?? 0);
  if (cantidad === 0) return null;
  return { key: b.key, nombre: b.nombre, total: round2(Number(b.total) || 0), cantidad };
}
