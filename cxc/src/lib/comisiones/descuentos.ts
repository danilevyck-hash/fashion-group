// ─────────────────────────────────────────────────────────────────────────────
// Descuentos fijos de comisión — la lectura vive en UN solo lugar.
//
// 🩸 POR QUÉ (12-ago-2026). La pantalla "Todas las empresas" pedía los
// descuentos **una vez por empresa** (5 llamadas HTTP, 10 consultas), y cada una
// filtraba por `empresa_key` sobre las MISMAS dos tablas chicas. Medido contra
// el build de producción: una sola apertura de /comisiones disparaba
// `/api/ventas/comisiones` ×5 y `/api/ventas/comisiones/descuentos` ×5 — 10
// peticiones donde alcanzaban 2.
//
// `empresa_key` acá es solo un `.eq()` de filtro: nada obligaba a partirlo en
// cinco. Pedir las 5 empresas de una son **2 consultas fijas**, no 10.
//
// ⚠️ LA REGLA DEL `activo` EFECTIVO NO SE TOCA Y NO SE COPIA: es la de siempre
// —la excepción del mes si existe, y si no el `activo` por defecto— y la aplica
// esta función para los dos consumidores (el endpoint por empresa y el
// consolidado). Dos copias de esta regla serían dos totales de comisión
// posibles para el mismo mes.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";

export interface DescuentoEfectivo {
  id: string;
  empresa_key: string;
  concepto: string;
  monto: number;
  /** `activo` EFECTIVO del mes: excepción si existe, si no el del catálogo. */
  activo: boolean;
  vendedor: string;
}

/** El mes se guarda como el día 1 (columna `date`). */
export function mesISO(year: number, mes: number): string {
  return `${year}-${String(mes).padStart(2, "0")}-01`;
}

/**
 * Descuentos fijos con su `activo` efectivo del mes, para UNA o VARIAS empresas.
 *
 * Cuesta 2 consultas sin importar cuántas empresas se pidan.
 */
export async function leerDescuentosEfectivos(
  empresas: readonly string[],
  year: number,
  mes: number,
  vendedor = "",
): Promise<DescuentoEfectivo[]> {
  let q = supabaseServer
    .from("comision_descuentos_fijos")
    .select("id, empresa_key, concepto, monto, vendedor_nombre")
    .in("empresa_key", empresas as string[])
    .eq("activo", true);
  if (vendedor) q = q.eq("vendedor_nombre", vendedor);
  const { data: fijos, error } = await q.order("concepto", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (fijos ?? []).map((f) => String(f.id));
  const excById = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: exc, error: e2 } = await supabaseServer
      .from("comision_descuento_excepciones")
      .select("descuento_id, activo")
      .in("descuento_id", ids)
      .eq("mes", mesISO(year, mes));
    if (e2) throw new Error(e2.message);
    for (const x of exc ?? []) excById.set(String(x.descuento_id), Boolean(x.activo));
  }

  return (fijos ?? []).map((f) => {
    const id = String(f.id);
    // Efectivo: excepción del mes si existe; si no, activo por defecto.
    const activo = excById.has(id) ? excById.get(id)! : true;
    return {
      id,
      empresa_key: String((f as { empresa_key?: string }).empresa_key ?? ""),
      concepto: String(f.concepto),
      monto: Number(f.monto),
      activo,
      vendedor: String((f as { vendedor_nombre?: string }).vendedor_nombre ?? ""),
    };
  });
}

/**
 * Total ACTIVO por vendedor, de UNA empresa. Es lo único que la tabla
 * consolidada necesita para mostrar el neto.
 */
export function totalPorVendedor(
  descuentos: readonly DescuentoEfectivo[],
  empresaKey?: string,
): Record<string, number> {
  const porVendedor: Record<string, number> = {};
  for (const d of descuentos) {
    if (!d.activo || !d.vendedor) continue;
    if (empresaKey && d.empresa_key !== empresaKey) continue;
    porVendedor[d.vendedor] =
      Math.round(((porVendedor[d.vendedor] ?? 0) + d.monto) * 100) / 100;
  }
  return porVendedor;
}
