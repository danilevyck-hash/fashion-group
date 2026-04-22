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

// Trae tipo + id para un conjunto de marca_ids, defaulting 'externa'.
async function tiposDeMarcas(
  marcaIds: ReadonlyArray<string>,
): Promise<Map<string, TipoMarca>> {
  if (marcaIds.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("mk_marcas")
    .select("*")
    .in("id", marcaIds);
  if (error) {
    throw new Error(`tiposDeMarcas: ${error.message}`);
  }
  const out = new Map<string, TipoMarca>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const tipoRaw = String(row.tipo ?? "externa");
    const tipo: TipoMarca = tipoRaw === "interna" ? "interna" : "externa";
    out.set(String(row.id), tipo);
  }
  return out;
}

// Valida que todas las marcas sean del mismo tipo (todas externas o todas internas).
function validarMismoTipo(
  marcaIds: ReadonlyArray<string>,
  tipos: Map<string, TipoMarca>,
): TipoMarca {
  const setTipos = new Set<TipoMarca>();
  for (const id of marcaIds) {
    setTipos.add(tipos.get(id) ?? "externa");
  }
  if (setTipos.size > 1) {
    throw new Error(
      "Joybees no se puede mezclar con otras marcas en el mismo proyecto.",
    );
  }
  return setTipos.values().next().value ?? "externa";
}

// Valida que el proyecto de la factura no tenga facturas de otro tipo.
// Excluye la factura actual (cuando es edición).
async function validarTipoCoherenteConProyecto(
  facturaId: string,
  tipoNuevo: TipoMarca,
): Promise<void> {
  // Ubicar proyecto_id de la factura actual.
  const { data: fRow, error: fErr } = await supabaseServer
    .from("mk_facturas")
    .select("proyecto_id")
    .eq("id", facturaId)
    .maybeSingle();
  if (fErr) throw new Error(`validarTipoCoherenteConProyecto: ${fErr.message}`);
  if (!fRow) return;
  const proyectoId = String((fRow as { proyecto_id: string }).proyecto_id);

  // Otras facturas vigentes del mismo proyecto (excluye la actual).
  const { data: siblingsRows, error: sErr } = await supabaseServer
    .from("mk_facturas")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .is("anulado_en", null)
    .neq("id", facturaId);
  if (sErr) throw new Error(`validarTipoCoherenteConProyecto[siblings]: ${sErr.message}`);
  const siblingIds = ((siblingsRows ?? []) as Array<{ id: string }>).map(
    (r) => String(r.id),
  );
  if (siblingIds.length === 0) return;

  // Marcas ya asignadas a esas facturas vigentes.
  const { data: fmRows, error: fmErr } = await supabaseServer
    .from("mk_factura_marcas")
    .select("marca_id")
    .in("factura_id", siblingIds);
  if (fmErr) throw new Error(`validarTipoCoherenteConProyecto[fm]: ${fmErr.message}`);
  const otrosMarcaIds = Array.from(
    new Set(
      ((fmRows ?? []) as Array<{ marca_id: string }>).map((r) =>
        String(r.marca_id),
      ),
    ),
  );
  if (otrosMarcaIds.length === 0) return;

  const tipos = await tiposDeMarcas(otrosMarcaIds);
  for (const id of otrosMarcaIds) {
    const t = tipos.get(id) ?? "externa";
    if (t !== tipoNuevo) {
      throw new Error(
        "Joybees no se puede mezclar con otras marcas en el mismo proyecto.",
      );
    }
  }
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
 * Reemplaza todas las marcas de una factura. Aplica:
 *   1. Validación: marcaIds únicas y >= 1.
 *   2. Validación: todas las marcas deben ser del mismo tipo (externa/interna).
 *      Internas (Joybees) no se mezclan con externas.
 *   3. Validación: el tipo elegido debe ser coherente con el resto de facturas
 *      vigentes del proyecto (no se puede meter Joybees a un proyecto que ya
 *      tiene facturas externas, ni viceversa).
 *   4. Borra filas previas en mk_factura_marcas.
 *   5. Inserta nuevas con porcentaje = 50 si externa, 100 si interna.
 *
 * Cualquier `porcentaje` en el input se ignora — el valor real se deriva del
 * tipo de marca.
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
  const marcaIds = Array.from(ids);

  // Validación de tipos: todas las marcas del mismo tipo + coherencia con
  // el resto de facturas del proyecto.
  const tipos = await tiposDeMarcas(marcaIds);
  const tipoNuevo = validarMismoTipo(marcaIds, tipos);
  await validarTipoCoherenteConProyecto(facturaId, tipoNuevo);

  // Borrar filas existentes
  const { error: delError } = await supabaseServer
    .from("mk_factura_marcas")
    .delete()
    .eq("factura_id", facturaId);
  if (delError) {
    throw new Error(`setMarcasDeFactura[delete]: ${delError.message}`);
  }

  // Insertar nuevas — porcentaje depende del tipo de cada marca.
  const payload = marcas.map((m) => ({
    factura_id: facturaId,
    marca_id: m.marcaId,
    porcentaje: porcentajeParaTipo(tipos.get(m.marcaId) ?? "externa"),
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
