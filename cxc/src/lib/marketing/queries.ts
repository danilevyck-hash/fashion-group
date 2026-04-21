// ============================================================================
// Marketing module — queries (lectura contra Supabase)
// Todas las queries filtran `anulado_en IS NULL` por default.
// Para papelera: usar getAnulados().
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import type {
  MkMarca,
  MkProyecto,
  MkFactura,
  MkCobranza,
  MkPago,
  MkAdjunto,
  MkProyectoMarca,
  ProyectoConMarcas,
  ProyectoResumen,
  FacturaConAdjuntos,
  CobranzaConPagos,
  AnuladoItem,
  EstadoProyecto,
  MarcaConPorcentaje,
} from "./types";

// ----------------------------------------------------------------------------
// Helpers internos de mapeo (no exportados)
// ----------------------------------------------------------------------------
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

function mapProyecto(row: Record<string, unknown>): MkProyecto {
  return {
    id: String(row.id),
    nombre: (row.nombre as string | null) ?? null,
    tienda: String(row.tienda ?? ""),
    fecha_inicio: String(row.fecha_inicio ?? ""),
    fecha_cierre: (row.fecha_cierre as string | null) ?? null,
    estado: String(row.estado ?? "abierto") as EstadoProyecto,
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

function mapCobranza(row: Record<string, unknown>): MkCobranza {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    proyecto_id: String(row.proyecto_id),
    marca_id: String(row.marca_id),
    fecha_envio: (row.fecha_envio as string | null) ?? null,
    monto: Number(row.monto ?? 0),
    email_destino: (row.email_destino as string | null) ?? null,
    asunto: (row.asunto as string | null) ?? null,
    cuerpo: (row.cuerpo as string | null) ?? null,
    estado: String(row.estado ?? "borrador") as MkCobranza["estado"],
    notas: (row.notas as string | null) ?? null,
    anulado_en: (row.anulado_en as string | null) ?? null,
    anulado_motivo: (row.anulado_motivo as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapPago(row: Record<string, unknown>): MkPago {
  return {
    id: String(row.id),
    cobranza_id: String(row.cobranza_id),
    fecha_pago: String(row.fecha_pago ?? ""),
    monto: Number(row.monto ?? 0),
    referencia: (row.referencia as string | null) ?? null,
    comprobante_url: (row.comprobante_url as string | null) ?? null,
    notas: (row.notas as string | null) ?? null,
    anulado_en: (row.anulado_en as string | null) ?? null,
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
interface FiltrosProyectos {
  estado?: EstadoProyecto;
  anio?: number;
}

/**
 * Devuelve proyectos asociados a una marca (por código), con resumen:
 * - marcas asociadas + % de reparto
 * - total facturado del proyecto
 * - total cobrable a esa marca específica (% aplicado)
 * - conteos de facturas y fotos
 */
export async function getProyectosByMarca(
  marcaCodigo: string,
  filtros: FiltrosProyectos = {}
): Promise<ProyectoResumen[]> {
  const marca = await getMarcaByCodigo(marcaCodigo);
  if (!marca) return [];

  // 1) IDs de proyectos que incluyen esta marca
  const { data: pmRows, error: pmError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .select("proyecto_id, porcentaje")
    .eq("marca_id", marca.id);
  if (pmError) throw new Error(`getProyectosByMarca[pm]: ${pmError.message}`);
  const proyectoIds = (pmRows ?? []).map((r) => String((r as Record<string, unknown>).proyecto_id));
  if (proyectoIds.length === 0) return [];

  // 2) Cargar proyectos vigentes
  let pq = supabaseServer
    .from("mk_proyectos")
    .select("*")
    .in("id", proyectoIds)
    .is("anulado_en", null)
    .order("fecha_inicio", { ascending: false });
  if (filtros.estado) pq = pq.eq("estado", filtros.estado);
  if (filtros.anio) {
    const ini = `${filtros.anio}-01-01`;
    const fin = `${filtros.anio}-12-31`;
    pq = pq.gte("fecha_inicio", ini).lte("fecha_inicio", fin);
  }
  const { data: proyectosData, error: proyectosError } = await pq;
  if (proyectosError) throw new Error(`getProyectosByMarca[proyectos]: ${proyectosError.message}`);
  const proyectos = (proyectosData ?? []).map((r) => mapProyecto(r as Record<string, unknown>));
  if (proyectos.length === 0) return [];

  const idsVigentes = proyectos.map((p) => p.id);

  // 3) Cargar todas las marcas de cada proyecto (para mostrar split completo)
  const { data: pmAllData, error: pmAllError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .select("*, marca:mk_marcas(*)")
    .in("proyecto_id", idsVigentes);
  if (pmAllError) throw new Error(`getProyectosByMarca[pmAll]: ${pmAllError.message}`);

  const marcasByProyecto = new Map<string, MarcaConPorcentaje[]>();
  for (const row of pmAllData ?? []) {
    const r = row as Record<string, unknown>;
    const pid = String(r.proyecto_id);
    const marcaRow = r.marca as Record<string, unknown> | null;
    if (!marcaRow) continue;
    const item: MarcaConPorcentaje = {
      marca: mapMarca(marcaRow),
      porcentaje: Number(r.porcentaje ?? 0),
    };
    const arr = marcasByProyecto.get(pid) ?? [];
    arr.push(item);
    marcasByProyecto.set(pid, arr);
  }

  // 4) Facturas vigentes por proyecto
  const { data: facturasData, error: facturasError } = await supabaseServer
    .from("mk_facturas")
    .select("proyecto_id, total")
    .in("proyecto_id", idsVigentes)
    .is("anulado_en", null);
  if (facturasError) throw new Error(`getProyectosByMarca[facturas]: ${facturasError.message}`);

  const totalFactByProyecto = new Map<string, { total: number; conteo: number }>();
  for (const row of facturasData ?? []) {
    const r = row as Record<string, unknown>;
    const pid = String(r.proyecto_id);
    const tot = Number(r.total ?? 0);
    const prev = totalFactByProyecto.get(pid) ?? { total: 0, conteo: 0 };
    totalFactByProyecto.set(pid, { total: prev.total + tot, conteo: prev.conteo + 1 });
  }

  // 5) Conteo de fotos de proyecto
  const { data: fotosData, error: fotosError } = await supabaseServer
    .from("mk_adjuntos")
    .select("proyecto_id")
    .in("proyecto_id", idsVigentes)
    .eq("tipo", "foto_proyecto");
  if (fotosError) throw new Error(`getProyectosByMarca[fotos]: ${fotosError.message}`);

  const fotosByProyecto = new Map<string, number>();
  for (const row of fotosData ?? []) {
    const r = row as Record<string, unknown>;
    const pid = String(r.proyecto_id);
    fotosByProyecto.set(pid, (fotosByProyecto.get(pid) ?? 0) + 1);
  }

  // 6) Componer resumen
  return proyectos.map((p) => {
    const marcas = marcasByProyecto.get(p.id) ?? [];
    const fact = totalFactByProyecto.get(p.id) ?? { total: 0, conteo: 0 };
    const fotos = fotosByProyecto.get(p.id) ?? 0;
    const pctMarca = marcas.find((m) => m.marca.id === marca.id)?.porcentaje ?? 0;
    const cobrable = Number(((fact.total * pctMarca) / 100).toFixed(2));
    return {
      ...p,
      marcas,
      total_facturado: Number(fact.total.toFixed(2)),
      total_cobrable_marca: cobrable,
      conteo_facturas: fact.conteo,
      conteo_fotos: fotos,
    };
  });
}

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
export async function getFacturasByProyecto(
  proyectoId: string
): Promise<FacturaConAdjuntos[]> {
  const { data: factData, error: factError } = await supabaseServer
    .from("mk_facturas")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .is("anulado_en", null)
    .order("fecha_factura", { ascending: false });
  if (factError) throw new Error(`getFacturasByProyecto: ${factError.message}`);
  const facturas = (factData ?? []).map((r) => mapFactura(r as Record<string, unknown>));
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
// Cobranzas
// ----------------------------------------------------------------------------
export async function getCobranzasByProyecto(
  proyectoId: string
): Promise<CobranzaConPagos[]> {
  const { data: cbData, error: cbError } = await supabaseServer
    .from("mk_cobranzas")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .is("anulado_en", null)
    .order("created_at", { ascending: false });
  if (cbError) throw new Error(`getCobranzasByProyecto: ${cbError.message}`);
  const cobranzas = (cbData ?? []).map((r) => mapCobranza(r as Record<string, unknown>));
  if (cobranzas.length === 0) return [];

  const ids = cobranzas.map((c) => c.id);
  const { data: pagosData, error: pagosError } = await supabaseServer
    .from("mk_pagos")
    .select("*")
    .in("cobranza_id", ids)
    .is("anulado_en", null);
  if (pagosError) throw new Error(`getCobranzasByProyecto[pagos]: ${pagosError.message}`);

  const pagosByCobranza = new Map<string, MkPago[]>();
  for (const row of pagosData ?? []) {
    const p = mapPago(row as Record<string, unknown>);
    const arr = pagosByCobranza.get(p.cobranza_id) ?? [];
    arr.push(p);
    pagosByCobranza.set(p.cobranza_id, arr);
  }

  return cobranzas.map((c) => {
    const pagos = pagosByCobranza.get(c.id) ?? [];
    const totalPagado = Number(
      pagos.reduce((acc, p) => acc + p.monto, 0).toFixed(2)
    );
    const saldo = Number((c.monto - totalPagado).toFixed(2));
    return { ...c, pagos, total_pagado: totalPagado, saldo };
  });
}

export async function getCobranzaById(id: string): Promise<CobranzaConPagos | null> {
  const { data, error } = await supabaseServer
    .from("mk_cobranzas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCobranzaById: ${error.message}`);
  if (!data) return null;
  const cobranza = mapCobranza(data as Record<string, unknown>);

  const { data: pagosData, error: pagosError } = await supabaseServer
    .from("mk_pagos")
    .select("*")
    .eq("cobranza_id", id)
    .is("anulado_en", null)
    .order("fecha_pago", { ascending: false });
  if (pagosError) throw new Error(`getCobranzaById[pagos]: ${pagosError.message}`);
  const pagos = (pagosData ?? []).map((r) => mapPago(r as Record<string, unknown>));
  const totalPagado = Number(pagos.reduce((acc, p) => acc + p.monto, 0).toFixed(2));
  const saldo = Number((cobranza.monto - totalPagado).toFixed(2));
  return { ...cobranza, pagos, total_pagado: totalPagado, saldo };
}

// ----------------------------------------------------------------------------
// Adjuntos & pagos
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

export async function getPagosByCobranza(cobranzaId: string): Promise<MkPago[]> {
  const { data, error } = await supabaseServer
    .from("mk_pagos")
    .select("*")
    .eq("cobranza_id", cobranzaId)
    .is("anulado_en", null)
    .order("fecha_pago", { ascending: false });
  if (error) throw new Error(`getPagosByCobranza: ${error.message}`);
  return (data ?? []).map((r) => mapPago(r as Record<string, unknown>));
}

// ----------------------------------------------------------------------------
// Papelera (anulados)
// ----------------------------------------------------------------------------
export async function getAnulados(): Promise<AnuladoItem[]> {
  const items: AnuladoItem[] = [];

  const [{ data: proy, error: pErr }, { data: fact, error: fErr }, { data: cob, error: cErr }] =
    await Promise.all([
      supabaseServer
        .from("mk_proyectos")
        .select("id, nombre, tienda, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
      supabaseServer
        .from("mk_facturas")
        .select("id, numero_factura, proveedor, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
      supabaseServer
        .from("mk_cobranzas")
        .select("id, numero, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
    ]);
  if (pErr) throw new Error(`getAnulados[proyectos]: ${pErr.message}`);
  if (fErr) throw new Error(`getAnulados[facturas]: ${fErr.message}`);
  if (cErr) throw new Error(`getAnulados[cobranzas]: ${cErr.message}`);

  for (const row of proy ?? []) {
    const r = row as Record<string, unknown>;
    const nombre = String(r.nombre ?? "") || String(r.tienda ?? "");
    items.push({
      tipo: "proyecto",
      id: String(r.id),
      nombre,
      anulado_en: String(r.anulado_en ?? ""),
      anulado_motivo: (r.anulado_motivo as string | null) ?? null,
    });
  }
  for (const row of fact ?? []) {
    const r = row as Record<string, unknown>;
    const nombre = `${String(r.numero_factura ?? "")} — ${String(r.proveedor ?? "")}`.trim();
    items.push({
      tipo: "factura",
      id: String(r.id),
      nombre,
      anulado_en: String(r.anulado_en ?? ""),
      anulado_motivo: (r.anulado_motivo as string | null) ?? null,
    });
  }
  for (const row of cob ?? []) {
    const r = row as Record<string, unknown>;
    items.push({
      tipo: "cobranza",
      id: String(r.id),
      nombre: String(r.numero ?? ""),
      anulado_en: String(r.anulado_en ?? ""),
      anulado_motivo: (r.anulado_motivo as string | null) ?? null,
    });
  }

  return items.sort((a, b) => b.anulado_en.localeCompare(a.anulado_en));
}

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
