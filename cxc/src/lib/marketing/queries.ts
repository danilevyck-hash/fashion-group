// ============================================================================
// Marketing module — queries (lectura contra Supabase)
// Todas las queries filtran `anulado_en IS NULL` por default.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import { normalizarEstadoProyecto } from "./normalizar";
import type {
  MkMarca,
  MkProyecto,
  MkFactura,
  MkAdjunto,
  MkProyectoMarca,
  ProyectoConMarcas,
  FacturaConAdjuntos,
  MarcaConPorcentaje,
} from "./types";

// ----------------------------------------------------------------------------
// Helpers internos de mapeo (no exportados)
// ----------------------------------------------------------------------------
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

function mapProyecto(row: Record<string, unknown>): MkProyecto {
  return {
    id: String(row.id),
    nombre: (row.nombre as string | null) ?? null,
    tienda: String(row.tienda ?? ""),
    tienda_codigo: (row.tienda_codigo as string | null) ?? null,
    fecha_inicio: String(row.fecha_inicio ?? ""),
    fecha_cierre: (row.fecha_cierre as string | null) ?? null,
    estado: normalizarEstadoProyecto(row.estado),
    fecha_enviado: (row.fecha_enviado as string | null) ?? null,
    fecha_cobrado: (row.fecha_cobrado as string | null) ?? null,
    notas: (row.notas as string | null) ?? null,
    anulado_en: (row.anulado_en as string | null) ?? null,
    anulado_motivo: (row.anulado_motivo as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapFactura(row: Record<string, unknown>): MkFactura {
  return {
    id: String(row.id),
    proyecto_id: String(row.proyecto_id),
    numero_factura: String(row.numero_factura ?? ""),
    fecha_factura: String(row.fecha_factura ?? ""),
    proveedor: String(row.proveedor ?? ""),
    concepto: String(row.concepto ?? ""),
    subtotal: Number(row.subtotal ?? 0),
    itbms: Number(row.itbms ?? 0),
    total: Number(row.total ?? 0),
    tiene_importacion: Boolean(row.tiene_importacion ?? false),
    estado_pago: String(row.estado_pago ?? "creado") === "pagado"
      ? "pagado"
      : "creado",
    anulado_en: (row.anulado_en as string | null) ?? null,
    anulado_motivo: (row.anulado_motivo as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapAdjunto(row: Record<string, unknown>): MkAdjunto {
  return {
    id: String(row.id),
    proyecto_id: (row.proyecto_id as string | null) ?? null,
    factura_id: (row.factura_id as string | null) ?? null,
    tipo: String(row.tipo ?? "otro") as MkAdjunto["tipo"],
    url: String(row.url ?? ""),
    nombre_original: (row.nombre_original as string | null) ?? null,
    size_bytes: (row.size_bytes as number | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

function mapProyectoMarca(row: Record<string, unknown>): MkProyectoMarca {
  return {
    id: String(row.id),
    proyecto_id: String(row.proyecto_id),
    marca_id: String(row.marca_id),
    porcentaje: Number(row.porcentaje ?? 0),
  };
}

// ----------------------------------------------------------------------------
// Marcas
// ----------------------------------------------------------------------------
export async function getMarcas(): Promise<MkMarca[]> {
  const { data, error } = await supabaseServer
    .from("mk_marcas")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(`getMarcas: ${error.message}`);
  return (data ?? []).map((r) => mapMarca(r as Record<string, unknown>));
}

export async function getMarcaByCodigo(codigo: string): Promise<MkMarca | null> {
  const { data, error } = await supabaseServer
    .from("mk_marcas")
    .select("*")
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(`getMarcaByCodigo: ${error.message}`);
  return data ? mapMarca(data as Record<string, unknown>) : null;
}

// ----------------------------------------------------------------------------
// Proyectos
// ----------------------------------------------------------------------------
export async function getProyectoById(id: string): Promise<ProyectoConMarcas | null> {
  const { data, error } = await supabaseServer
    .from("mk_proyectos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProyectoById: ${error.message}`);
  if (!data) return null;
  const proyecto = mapProyecto(data as Record<string, unknown>);

  const { data: pmData, error: pmError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .select("*, marca:mk_marcas(*)")
    .eq("proyecto_id", id);
  if (pmError) throw new Error(`getProyectoById[marcas]: ${pmError.message}`);

  const marcas: MarcaConPorcentaje[] = (pmData ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const m = r.marca as Record<string, unknown> | null;
      if (!m) return null;
      return {
        marca: mapMarca(m),
        porcentaje: Number(r.porcentaje ?? 0),
      };
    })
    .filter((x): x is MarcaConPorcentaje => x !== null);

  return { ...proyecto, marcas };
}

// ----------------------------------------------------------------------------
// Facturas
// ----------------------------------------------------------------------------
/**
 * Fuente única de verdad para "facturas vigentes de uno o más proyectos".
 * Filtro: proyecto_id IN (ids) AND anulado_en IS NULL.
 * No incluye adjuntos — el caller los carga aparte si los necesita.
 */
export async function listFacturasVigentesRaw(
  proyectoIds: ReadonlyArray<string>
): Promise<MkFactura[]> {
  if (proyectoIds.length === 0) return [];
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("*")
    .in("proyecto_id", proyectoIds)
    .is("anulado_en", null)
    .order("fecha_factura", { ascending: false });
  if (error) throw new Error(`listFacturasVigentesRaw: ${error.message}`);
  return (data ?? []).map((r) => mapFactura(r as Record<string, unknown>));
}

export interface ResumenFacturasProyecto {
  total: number;
  subtotal: number;
  conteo: number;
}

export async function resumenFacturasVigentesBatch(
  proyectoIds: ReadonlyArray<string>
): Promise<Map<string, ResumenFacturasProyecto>> {
  const resumen = new Map<string, ResumenFacturasProyecto>();
  const facturas = await listFacturasVigentesRaw(proyectoIds);
  for (const f of facturas) {
    const prev = resumen.get(f.proyecto_id) ?? {
      total: 0,
      subtotal: 0,
      conteo: 0,
    };
    resumen.set(f.proyecto_id, {
      total: prev.total + f.total,
      subtotal: prev.subtotal + f.subtotal,
      conteo: prev.conteo + 1,
    });
  }
  return resumen;
}

export async function getFacturasByProyecto(
  proyectoId: string
): Promise<FacturaConAdjuntos[]> {
  const facturas = await listFacturasVigentesRaw([proyectoId]);
  if (facturas.length === 0) return [];

  const ids = facturas.map((f) => f.id);
  const { data: adjData, error: adjError } = await supabaseServer
    .from("mk_adjuntos")
    .select("*")
    .in("factura_id", ids);
  if (adjError) throw new Error(`getFacturasByProyecto[adj]: ${adjError.message}`);

  const adjByFactura = new Map<string, MkAdjunto[]>();
  for (const row of adjData ?? []) {
    const a = mapAdjunto(row as Record<string, unknown>);
    if (!a.factura_id) continue;
    const arr = adjByFactura.get(a.factura_id) ?? [];
    arr.push(a);
    adjByFactura.set(a.factura_id, arr);
  }

  return facturas.map((f) => ({
    ...f,
    adjuntos: adjByFactura.get(f.id) ?? [],
  }));
}

/**
 * Facturas ANULADAS de un proyecto (con sus adjuntos).
 *
 * 🩸 Existe porque la pantalla de "Anulados" se retiró (ago-2026) y sin esto
 * las 14 facturas anuladas que viven dentro de proyectos VIVOS ($12.004,20
 * medidos el 11-ago-2026) quedaban INALCANZABLES: `getFacturasByProyecto`
 * filtra `anulado_en IS NULL`, así que el detalle del proyecto nunca las vio,
 * y la única puerta para volver a mostrarlas era esa pantalla.
 *
 * 🔴 VA APARTE, NO MEZCLADA CON LAS VIGENTES. Todo lo que suma plata en el
 * módulo (el gasto del proyecto, el bloque del proveedor, el reporte que se le
 * manda) sale de las vigentes; devolverlas juntas haría que el primer lugar que
 * se olvidara de filtrar contara una factura anulada como gasto real.
 */
export async function getFacturasAnuladasByProyecto(
  proyectoId: string,
): Promise<FacturaConAdjuntos[]> {
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .not("anulado_en", "is", null)
    .order("anulado_en", { ascending: false });
  if (error) throw new Error(`getFacturasAnuladasByProyecto: ${error.message}`);
  const facturas = (data ?? []).map((r) => mapFactura(r as Record<string, unknown>));
  if (facturas.length === 0) return [];

  const ids = facturas.map((f) => f.id);
  const { data: adjData, error: adjError } = await supabaseServer
    .from("mk_adjuntos")
    .select("*")
    .in("factura_id", ids);
  if (adjError) {
    throw new Error(`getFacturasAnuladasByProyecto[adj]: ${adjError.message}`);
  }

  const adjByFactura = new Map<string, MkAdjunto[]>();
  for (const row of adjData ?? []) {
    const a = mapAdjunto(row as Record<string, unknown>);
    if (!a.factura_id) continue;
    const arr = adjByFactura.get(a.factura_id) ?? [];
    arr.push(a);
    adjByFactura.set(a.factura_id, arr);
  }

  return facturas.map((f) => ({
    ...f,
    adjuntos: adjByFactura.get(f.id) ?? [],
  }));
}

export async function getFacturaById(id: string): Promise<FacturaConAdjuntos | null> {
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getFacturaById: ${error.message}`);
  if (!data) return null;
  const factura = mapFactura(data as Record<string, unknown>);

  const { data: adjData, error: adjError } = await supabaseServer
    .from("mk_adjuntos")
    .select("*")
    .eq("factura_id", id);
  if (adjError) throw new Error(`getFacturaById[adj]: ${adjError.message}`);
  const adjuntos = (adjData ?? []).map((r) => mapAdjunto(r as Record<string, unknown>));
  return { ...factura, adjuntos };
}

// ----------------------------------------------------------------------------
// Adjuntos
// ----------------------------------------------------------------------------
export async function getAdjuntosByProyecto(
  proyectoId: string
): Promise<MkAdjunto[]> {
  const { data, error } = await supabaseServer
    .from("mk_adjuntos")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .eq("tipo", "foto_proyecto")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getAdjuntosByProyecto: ${error.message}`);
  return (data ?? []).map((r) => mapAdjunto(r as Record<string, unknown>));
}

// ----------------------------------------------------------------------------
// Papelera: getAnulados() se retiró el 11-ago-2026 con la ruta GET
// /api/marketing/papelera (0 llamadores). Las facturas anuladas se ven y se
// restauran desde el detalle de su proyecto (FacturasSection), y el Deshacer
// del proyecto usa `papelera/restaurar`, que sigue viva.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Autocompletado (valores únicos de un campo)
// ----------------------------------------------------------------------------
const TABLAS_PERMITIDAS = ["mk_proyectos", "mk_facturas"] as const;
type TablaPermitida = (typeof TABLAS_PERMITIDAS)[number];

const CAMPOS_PERMITIDOS: Record<TablaPermitida, ReadonlyArray<string>> = {
  mk_proyectos: ["tienda", "nombre"],
  mk_facturas: ["proveedor", "concepto", "numero_factura"],
};

/**
 * Devuelve valores únicos (no nulos, no vacíos) de un campo de una tabla.
 * Limitado a tablas/campos en whitelist para evitar abuso.
 */
export async function getUniqueFieldValues(
  tabla: TablaPermitida,
  campo: string
): Promise<string[]> {
  if (!TABLAS_PERMITIDAS.includes(tabla)) {
    throw new Error(`Tabla no permitida: ${tabla}`);
  }
  const camposOk = CAMPOS_PERMITIDOS[tabla];
  if (!camposOk.includes(campo)) {
    throw new Error(`Campo no permitido para ${tabla}: ${campo}`);
  }

  const { data, error } = await supabaseServer
    .from(tabla)
    .select(campo)
    .is("anulado_en", null)
    .limit(500);
  if (error) throw new Error(`getUniqueFieldValues: ${error.message}`);

  const set = new Set<string>();
  for (const row of data ?? []) {
    const r = row as unknown as Record<string, unknown>;
    const val = r[campo];
    if (typeof val === "string" && val.trim().length > 0) {
      set.add(val);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es")).slice(0, 50);
}

// Re-export de tipo auxiliar para quien no quiera mezclar paths
export type { MkProyectoMarca };
