// ============================================================================
// Marketing — helpers para % de marcas a nivel FACTURA
// ============================================================================
// Lee/escribe en la tabla mk_factura_marcas.
//
// Reglas de negocio:
//   - Marcas EXTERNAS (Tommy, Calvin, Reebok): cada marca asignada cubre 50%.
//     Fashion Group absorbe el otro 50%.
//   - Marcas INTERNAS (Joybees): Fashion Group absorbe el 100% del gasto.
//     No hay contraparte con quien compartir; se persiste porcentaje=100.
//   - EXCLUSIVIDAD: una factura no puede mezclar marcas internas con externas.
//     Y dentro de un proyecto, todas sus facturas deben ser del mismo tipo.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import type { MarcaConPorcentaje, MkMarca, TipoMarca } from "./types";

// Legacy: se mantiene para importaciones antiguas. El valor real se decide
// según el tipo de marca (50 externa, 100 interna).
export const PORCENTAJE_MARCA_FIJO = 50;

function porcentajeParaTipo(tipo: TipoMarca): number {
  return tipo === "interna" ? 100 : 50;
}

interface MarcaPorcentajeInput {
  marcaId: string;
  porcentaje?: number; // ignorado: el valor real se deriva del tipo de marca.
  // Empresa interna del grupo que paga el otro 50% (default = marca.empresa_codigo).
  // Marcas internas (Joybees) ignoran este campo.
  empresaPagadoraCodigo?: string | null;
}

function mapMarca(row: Record<string, unknown>): MkMarca {
  const tipoRaw = String(row.tipo ?? "externa");
  const tipo: MkMarca["tipo"] = tipoRaw === "interna" ? "interna" : "externa";
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    codigo: String(row.codigo ?? ""),
    empresa_codigo: String(row.empresa_codigo ?? "") as MkMarca["empresa_codigo"],
    tipo,
    activo: Boolean(row.activo ?? true),
    created_at: String(row.created_at ?? ""),
  };
}

// Trae tipo + empresa_codigo por marca. Default empresa_pagadora_codigo se
// deriva de aquí cuando el caller no manda override.
async function infoDeMarcas(
  marcaIds: ReadonlyArray<string>,
): Promise<Map<string, { tipo: TipoMarca; empresa_codigo: string }>> {
  if (marcaIds.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("mk_marcas")
    .select("id, tipo, empresa_codigo")
    .in("id", marcaIds);
  if (error) {
    throw new Error(`infoDeMarcas: ${error.message}`);
  }
  const out = new Map<string, { tipo: TipoMarca; empresa_codigo: string }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const tipoRaw = String(row.tipo ?? "externa");
    const tipo: TipoMarca = tipoRaw === "interna" ? "interna" : "externa";
    out.set(String(row.id), {
      tipo,
      empresa_codigo: String(row.empresa_codigo ?? ""),
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lee las marcas con su porcentaje para una factura.
 * Ordena por porcentaje descendente. Cada marca incluye `tipo` (externa/interna).
 */
export async function getMarcasDeFactura(
  facturaId: string,
): Promise<MarcaConPorcentaje[]> {
  if (!facturaId) throw new Error("facturaId requerido");
  const { data, error } = await supabaseServer
    .from("mk_factura_marcas")
    .select("porcentaje, empresa_pagadora_codigo, marca:mk_marcas(*)")
    .eq("factura_id", facturaId)
    .order("porcentaje", { ascending: false });
  if (error) {
    throw new Error(`getMarcasDeFactura: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{
    porcentaje: number;
    empresa_pagadora_codigo: string | null;
    marca: Record<string, unknown> | Array<Record<string, unknown>> | null;
  }>;
  const out: MarcaConPorcentaje[] = [];
  for (const r of rows) {
    const marcaRaw = Array.isArray(r.marca) ? r.marca[0] : r.marca;
    if (!marcaRaw) continue;
    out.push({
      marca: mapMarca(marcaRaw),
      porcentaje: Number(r.porcentaje ?? 0),
      empresa_pagadora_codigo: r.empresa_pagadora_codigo ?? null,
    });
  }
  return out;
}

/**
 * Reemplaza todas las marcas de una factura. Aplica:
 *   1. Validación: marcaIds únicas y >= 1.
 *   2. Borra filas previas en mk_factura_marcas.
 *   3. Inserta nuevas con el % REAL del input (1 marca = 100%; varias = % entre
 *      ellas). El reporting normaliza por suma, así que un solo % = total.
 *
 * Registro de gastos: una factura lleva 1 o varias marcas con % entre ellas.
 * Se retiró el reparto 50/50 marca↔empresa pagadora: empresa_pagadora_codigo
 * se escribe NULL (la columna se conserva por compatibilidad). Joybees / Otros
 * pueden convivir con cualquier marca.
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

  // Insertar nuevas con el % real del input (clamp al CHECK: 0 < pct <= 100).
  // Si el input no trae % válido, repartir parejo entre las marcas.
  const parejo = round2(100 / marcas.length);
  const payload = marcas.map((m) => {
    const pct = Number(m.porcentaje);
    const porcentaje =
      Number.isFinite(pct) && pct > 0 ? Math.min(100, round2(pct)) : parejo;
    return {
      factura_id: facturaId,
      marca_id: m.marcaId,
      porcentaje,
      empresa_pagadora_codigo: null,
    };
  });
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

  // Gasto COMPLETO por marca (sin co-op): el total se reparte por la porción
  // real de cada marca (porcentaje normalizado). 1 marca = total completo.
  const rows = (fmData ?? []) as Array<{ marca_id: string; porcentaje: number }>;
  const sumPct = rows.reduce((s, r) => s + Number(r.porcentaje ?? 0), 0) || 1;
  const result = new Map<string, number>();
  for (const r of rows) {
    const monto = round2(total * (Number(r.porcentaje ?? 0) / sumPct));
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

  // Gasto COMPLETO por marca (sin co-op): el total de cada factura se reparte
  // por la porción real de sus marcas (porcentaje normalizado por factura).
  const rowsByFactura = new Map<string, Array<{ marca_id: string; pct: number }>>();
  for (const r of (fmData ?? []) as Array<{
    factura_id: string;
    marca_id: string;
    porcentaje: number;
  }>) {
    const fid = String(r.factura_id);
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push({ marca_id: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
    rowsByFactura.set(fid, arr);
  }
  const result = new Map<string, number>();
  for (const [fid, rows] of rowsByFactura) {
    const total = totalByFactura.get(fid) ?? 0;
    const sumPct = rows.reduce((s, r) => s + r.pct, 0) || 1;
    for (const r of rows) {
      const monto = total * (r.pct / sumPct);
      result.set(r.marca_id, (result.get(r.marca_id) ?? 0) + monto);
    }
  }

  // Redondear a 2 decimales al final
  for (const [k, v] of result) result.set(k, round2(v));
  return result;
}
