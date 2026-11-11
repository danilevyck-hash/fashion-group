// Cambiar el vendedor de UNA factura — la parte que TOCA LA BASE.
// Molde: `exclusiones-server.ts`. 🔴 NUNCA DELETE: devolver = `activa = false`
// firmado (historial de decisiones sobre plata; barrido en el candado).

import { supabaseServer } from "@/lib/supabase-server";
import { claveDeFactura, type CambioDeVendedor } from "./cambiar-vendedor";

export const TABLA_FACTURA_VENDEDOR = "comision_factura_vendedor";

const sinTabla = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || /relation .* does not exist|PGRST205|schema cache/i.test(e.message ?? "");

/**
 * Los cambios ACTIVOS de estas empresas como mapa `empresa|id → vendedor`,
 * FALLANDO ABIERTO (sin tabla o sin red → vacío): quien suma es la RPC; esto
 * es para que lo que agrupa Node llegue al mismo nombre.
 */
export async function leerCambiosActivosOVacio(empresas: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (empresas.length === 0) return out;
  try {
    const { data, error } = await supabaseServer
      .from(TABLA_FACTURA_VENDEDOR)
      .select("empresa_key, switch_factura_id, vendedor")
      .in("empresa_key", empresas)
      .eq("activa", true);
    if (error) return out;
    for (const f of (data ?? []) as { empresa_key: string; switch_factura_id: number; vendedor: string }[]) {
      out.set(claveDeFactura(f.empresa_key, Number(f.switch_factura_id)), f.vendedor);
    }
  } catch {
    /* falla abierto */
  }
  return out;
}

export type ResultadoCambio =
  | { ok: true; id: number }
  | { ok: false; status: 500 | 503; error: string };

/**
 * Pasa la factura a otro vendedor. Si ya había un cambio activo, se desactiva
 * (firmado) antes de insertar el nuevo: una sola ACTIVA por factura, y el
 * historial se queda.
 */
export async function cambiarVendedorFactura(valor: CambioDeVendedor, quien: string): Promise<ResultadoCambio> {
  const baja = await devolverVendedorFactura(valor.empresa_key, valor.switch_factura_id, quien);
  if (!baja.ok && baja.status !== 404) return { ok: false, status: baja.status, error: baja.error };
  const { data, error } = await supabaseServer
    .from(TABLA_FACTURA_VENDEDOR)
    .insert({ ...valor, creado_por: quien })
    .select("id")
    .single();
  if (error) {
    if (sinTabla(error)) return { ok: false, status: 503, error: "Falta correr la migración de comision_factura_vendedor" };
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  return { ok: true, id: Number((data as { id: number }).id) };
}

export type ResultadoDevolucion =
  | { ok: true }
  | { ok: false; status: 404 | 500 | 503; error: string };

/** Devuelve la factura al vendedor de Switch: soft delete firmado de la fila ACTIVA. */
export async function devolverVendedorFactura(empresa: string, switchFacturaId: number, quien: string): Promise<ResultadoDevolucion> {
  const { data, error } = await supabaseServer
    .from(TABLA_FACTURA_VENDEDOR)
    .update({ activa: false, desactivado_por: quien, desactivado_en: new Date().toISOString() })
    .eq("empresa_key", empresa)
    .eq("switch_factura_id", switchFacturaId)
    .eq("activa", true)
    .select("id");
  if (error) {
    if (sinTabla(error)) return { ok: false, status: 503, error: "Falta correr la migración de comision_factura_vendedor" };
    return { ok: false, status: 500, error: "No se pudo guardar. Intenta de nuevo en unos segundos." };
  }
  if (!data || data.length === 0) return { ok: false, status: 404, error: "Esa factura ya está con el vendedor de Switch" };
  return { ok: true };
}
