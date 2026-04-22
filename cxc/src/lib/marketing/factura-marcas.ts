// ============================================================================
// Marketing — helpers para % de marcas a nivel FACTURA (Fase 1 del refactor)
// ============================================================================
// Lee/escribe en la tabla mk_factura_marcas.
//
// Reglas de negocio (vigentes desde la nueva regla 50/50):
//   - Cada marca asignada a una factura cubre SIEMPRE 50% (regla fija, no
//     editable). El resto se asume Fashion Group.
//   - Cobrable por marca = factura.total × 50 / 100 = factura.total × 0.5.
//   - El campo `porcentaje` se preserva en la DB para no romper consultas
//     históricas, pero al escribir se fuerza 50.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import type { MarcaConPorcentaje, MkMarca } from "./types";

// Regla 50/50: cada marca asignada a una factura recibe siempre 50%.
export const PORCENTAJE_MARCA_FIJO = 50;

interface MarcaPorcentajeInput {
  marcaId: string;
  porcentaje?: number; // ignorado: siempre se persiste 50.
}

function mapMarca(row: Record<string, unknown>): MkMarca {
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    codigo: String(row.codigo ?? ""),
    empresa_codigo: String(row.empresa_codigo ?? "") as MkMarca["empresa_codigo"],
    activo: Boolean(row.activo ?? true),
    created_at: String(row.created_at ?? ""),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lee las marcas con su porcentaje para una factura.
 * Ordena por porcentaje descendente.
 */
export async function getMarcasDeFactura(
  facturaId: string,
): Promise<MarcaConPorcentaje[]> {
  if (!facturaId) throw new Error("facturaId requerido");
  const { data, error } = await supabaseServer
    .from("mk_factura_marcas")
    .select("porcentaje, marca:mk_marcas(*)")
    .eq("factura_id", facturaId)
    .order("porcentaje", { ascending: false });
  if (error) {
    throw new Error(`getMarcasDeFactura: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{
    porcentaje: number;
    marca: Record<string, unknown> | Array<Record<string, unknown>> | null;
  }>;
  return rows
    .map((r) => {
      // Supabase FK embedding puede devolver objeto o array según el schema.
      const marcaRaw = Array.isArray(r.marca) ? r.marca[0] : r.marca;
      if (!marcaRaw) return null;
      return {
        marca: mapMarca(marcaRaw),
        porcentaje: Number(r.porcentaje ?? 0),
      };
    })
    .filter((x): x is MarcaConPorcentaje => x !== null);
}

/**
 * Reemplaza todas las marcas de una factura.
 *   1. Valida marcaIds únicas y >= 1 entrada.
 *   2. Borra filas existentes de mk_factura_marcas para esa factura.
 *   3. Inserta las nuevas filas con porcentaje = PORCENTAJE_MARCA_FIJO (50).
 *
 * Cualquier `porcentaje` que llegue en `marcas` se ignora — la regla 50/50
 * es fija a nivel de negocio.
 */
export async function setMarcasDeFactura(
  facturaId: string,
  marcas: ReadonlyArray<MarcaPorcentajeInput>,
): Promise<void> {
  if (!facturaId) throw new Error("facturaId requerido");
  if (!Array.isArray(marcas) || marcas.length === 0) {
    throw new Error("Debe especificar al menos una marca");
  }

  // Validación: marcaIds únicas y no vacías
  const ids = new Set<string>();
  for (const m of marcas) {
    if (!m.marcaId) throw new Error("marcaId vacío en alguna entrada");
    if (ids.has(m.marcaId)) {
      throw new Error(`Marca duplicada en el input: ${m.marcaId}`);
    }
    ids.add(m.marcaId);
  }

  // Borrar filas existentes
  const { error: delError } = await supabaseServer
    .from("mk_factura_marcas")
    .delete()
    .eq("factura_id", facturaId);
  if (delError) {
    throw new Error(`setMarcasDeFactura[delete]: ${delError.message}`);
  }

  // Insertar nuevas — porcentaje siempre 50, ignoramos el input.
  const payload = marcas.map((m) => ({
    factura_id: facturaId,
    marca_id: m.marcaId,
    porcentaje: PORCENTAJE_MARCA_FIJO,
  }));
  const { error: insError } = await supabaseServer
    .from("mk_factura_marcas")
    .insert(payload);
  if (insError) {
    throw new Error(`setMarcasDeFactura[insert]: ${insError.message}`);
  }
}

/**
 * Cobrable por marca para UNA factura: Map<marcaId, monto>.
 * monto = factura.total × porcentaje / 100.
 * Si la factura está anulada o no tiene marcas, devuelve Map vacío.
 */
export async function getCobrableByMarca(
  facturaId: string,
): Promise<Map<string, number>> {
  if (!facturaId) throw new Error("facturaId requerido");

  const { data: factData, error: factError } = await supabaseServer
    .from("mk_facturas")
    .select("total, anulado_en")
    .eq("id", facturaId)
    .maybeSingle();
  if (factError) {
    throw new Error(`getCobrableByMarca[factura]: ${factError.message}`);
  }
  if (!factData) return new Map();
  const row = factData as { total: number; anulado_en: string | null };
  if (row.anulado_en) return new Map();
  const total = Number(row.total ?? 0);

  const { data: fmData, error: fmError } = await supabaseServer
    .from("mk_factura_marcas")
    .select("marca_id, porcentaje")
    .eq("factura_id", facturaId);
  if (fmError) {
    throw new Error(`getCobrableByMarca[fm]: ${fmError.message}`);
  }

  const result = new Map<string, number>();
  for (const r of (fmData ?? []) as Array<{ marca_id: string; porcentaje: number }>) {
    const monto = round2((total * Number(r.porcentaje ?? 0)) / 100);
    result.set(String(r.marca_id), monto);
  }
  return result;
}

/**
 * Cobrable por marca para TODO un proyecto: Map<marcaId, monto>.
 * Suma los cobrables de todas las facturas vigentes (no anuladas).
 */
export async function getCobrableDeProyectoPorMarca(
  proyectoId: string,
): Promise<Map<string, number>> {
  if (!proyectoId) throw new Error("proyectoId requerido");

  // Cargar facturas vigentes + sus mk_factura_marcas en 2 queries (batch)
  const { data: facturasData, error: fError } = await supabaseServer
    .from("mk_facturas")
    .select("id, total")
    .eq("proyecto_id", proyectoId)
    .is("anulado_en", null);
  if (fError) {
    throw new Error(`getCobrableDeProyectoPorMarca[facturas]: ${fError.message}`);
  }

  const facturas = (facturasData ?? []) as Array<{ id: string; total: number }>;
  if (facturas.length === 0) return new Map();

  const facturaIds = facturas.map((f) => String(f.id));
  const totalByFactura = new Map<string, number>();
  for (const f of facturas) totalByFactura.set(String(f.id), Number(f.total ?? 0));

  const { data: fmData, error: fmError } = await supabaseServer
    .from("mk_factura_marcas")
    .select("factura_id, marca_id, porcentaje")
    .in("factura_id", facturaIds);
  if (fmError) {
    throw new Error(`getCobrableDeProyectoPorMarca[fm]: ${fmError.message}`);
  }

  const result = new Map<string, number>();
  for (const r of (fmData ?? []) as Array<{
    factura_id: string;
    marca_id: string;
    porcentaje: number;
  }>) {
    const total = totalByFactura.get(String(r.factura_id)) ?? 0;
    const monto = (total * Number(r.porcentaje ?? 0)) / 100;
    const prev = result.get(String(r.marca_id)) ?? 0;
    result.set(String(r.marca_id), prev + monto);
  }

  // Redondear a 2 decimales al final
  for (const [k, v] of result) result.set(k, round2(v));
  return result;
}
