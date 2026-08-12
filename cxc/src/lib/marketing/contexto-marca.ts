// ============================================================================
// Marketing — el CONTEXTO DE MARCA del overlay del proyecto (12-ago-2026).
// Módulo PURO: sin base, sin I/O.
//
// Daniel, textual: *"si me gustaria entrar a un projecto y ver ambas marcas"*.
// Un proyecto es del CLIENTE y puede trabajar varias marcas; al abrirlo DESDE
// el período de UNA marca, el total del overlay (todas las marcas) no coincide
// con el monto de la tarjeta que se tocó (solo esa marca en ese período). El
// contexto EXPLICA ese salto en una línea — no esconde nada, Daniel quiere
// seguir viendo ambas marcas en el proyecto:
//
//   "En Calvin Klein · Período 2026: $2,600.00 — este proyecto también tiene
//    $2,470.00 de Tommy Hilfiger"
//
// 🔴 NADA SE RECALCULA CONTRA LA BASE. Los insumos ya viven en el overlay:
//   - el monto de la marca/período viene de la PÁGINA (seccion.proyectos, que
//     lo trae del agregador único — la misma cifra de la tarjeta tocada);
//   - lo de las otras marcas sale de las facturas (reparto por porcentaje
//     NORMALIZADO, la MISMA fórmula de `resumen-inicio.ts` — porcentaje/sumPct,
//     nunca /100: es como el agregador reparte una factura entre sus marcas)
//     y de las entregas (`total_por_marca`, que ya ES plata por marca).
// ============================================================================

import { formatearMonto } from "./normalizar";

export interface FacturaParaContexto {
  total: number;
  anulado_en: string | null;
  marcas?: Array<{ marca: { id: string }; porcentaje: number }> | null;
}

export interface EntregaParaContexto {
  total_por_marca?: Record<string, number> | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Plata del proyecto por marca (todas sus marcas, todos sus períodos), con
 * los datos que el overlay YA cargó. Facturas anuladas no cuentan.
 */
export function totalesPorMarcaDeProyecto(
  facturas: ReadonlyArray<FacturaParaContexto>,
  entregas: ReadonlyArray<EntregaParaContexto>,
): Map<string, number> {
  const acc = new Map<string, number>();
  const bump = (mid: string, monto: number) => {
    acc.set(mid, (acc.get(mid) ?? 0) + monto);
  };

  for (const f of facturas) {
    if (f.anulado_en) continue;
    const rows = f.marcas ?? [];
    if (rows.length === 0) continue;
    // Misma normalización que `agregarResumenInicio`: la porción de cada
    // marca es porcentaje/Σporcentajes de ESA factura (no /100).
    const sumPct = rows.reduce((s, r) => s + num(r.porcentaje), 0) || 1;
    for (const r of rows) {
      bump(String(r.marca.id), num(f.total) * (num(r.porcentaje) / sumPct));
    }
  }

  for (const e of entregas) {
    for (const [mid, monto] of Object.entries(e.total_por_marca ?? {})) {
      const n = num(monto);
      if (n > 0) bump(String(mid), n);
    }
  }

  const out = new Map<string, number>();
  for (const [mid, monto] of acc) out.set(mid, Number(monto.toFixed(2)));
  return out;
}

export interface ContextoMarcaInput {
  /** La marca desde cuyo período se abrió el overlay. */
  marcaId: string;
  marcaNombre: string;
  /** Nombre del período (ej. "Período 2026"). Opcional. */
  periodoNombre?: string | null;
  /**
   * Lo del proyecto EN esa marca y período — la cifra del agregador que la
   * página ya tiene (la de la tarjeta que se tocó). null = no se conoce.
   */
  montoEnPeriodo?: number | null;
  /** Salida de `totalesPorMarcaDeProyecto`. */
  totales: ReadonlyMap<string, number>;
  /** marca_id → nombre (catálogo + marcas del proyecto). */
  nombres: ReadonlyMap<string, string>;
}

/**
 * La línea de contexto, o `null` cuando no hay nada que explicar (el proyecto
 * no tiene plata de OTRAS marcas — ahí el total del overlay ya coincide con
 * la tarjeta y la línea sería ruido).
 *
 * Una marca sin nombre resoluble se omite de la lista (mismo criterio que los
 * chips de EntregasSection: sin nombre no hay nada legible que decir).
 */
export function lineaContextoMarca(i: ContextoMarcaInput): string | null {
  const otras = [...i.totales.entries()]
    .filter(([mid, monto]) => mid !== i.marcaId && monto >= 0.005)
    .map(([mid, monto]) => ({ nombre: i.nombres.get(mid), monto }))
    .filter((x): x is { nombre: string; monto: number } => !!x.nombre)
    .sort((a, b) => b.monto - a.monto);
  if (otras.length === 0) return null;

  const donde = i.periodoNombre?.trim()
    ? `${i.marcaNombre} · ${i.periodoNombre.trim()}`
    : i.marcaNombre;
  const monto =
    typeof i.montoEnPeriodo === "number" && Number.isFinite(i.montoEnPeriodo)
      ? `: ${formatearMonto(i.montoEnPeriodo)}`
      : "";

  const partes = otras.map((o) => `${formatearMonto(o.monto)} de ${o.nombre}`);
  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;

  return `En ${donde}${monto} — este proyecto también tiene ${lista}`;
}
