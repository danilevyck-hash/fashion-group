// ============================================================================
// Marketing module — mutations (escritura contra Supabase)
// Toda escritura aplica auto-limpieza (normalizar) antes de insertar.
// Inputs tipados, sin `any`. Inmutable: nunca mutamos inputs.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import {
  tituloCase,
  oracionCase,
  emailLower,
  normalizarTexto,
} from "./normalizar";
import { getMarcas } from "./queries";
import type {
  MkProyecto,
  MkFactura,
  MkAdjunto,
  CreateProyectoInput,
  UpdateProyectoInput,
  CreateFacturaInput,
  UpdateFacturaInput,
  CreateAdjuntoInput,
  MarcaPorcentajeInput,
} from "./types";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function assertNoVacio(valor: string, campo: string): void {
  if (!valor || valor.length === 0) {
    throw new Error(`Campo requerido vacío: ${campo}`);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mesEsEs(fecha: Date): string {
  return fecha.toLocaleString("es-PA", { month: "short" }).replace(".", "");
}

function autoNombreProyecto(
  tiendaTitulo: string,
  marcasNombres: ReadonlyArray<string>,
  fecha: Date
): string {
  const mes = mesEsEs(fecha);
  const mesCap = mes.charAt(0).toLocaleUpperCase("es") + mes.slice(1);
  const anio = fecha.getFullYear();
  const marcasStr = marcasNombres.join("+");
  return `${tiendaTitulo} · ${marcasStr} · ${mesCap} ${anio}`;
}

// Regla de negocio 50/50: cada marca asignada cubre 50% fijo, no editable.
// Ya no validamos suma=100; un proyecto/factura puede tener 1+ marcas y cada
// una pesa 50%. El resto se asume Fashion Group.
const PORCENTAJE_MARCA_FIJO = 50;

function validarMarcasUnicas(marcas: ReadonlyArray<MarcaPorcentajeInput>): void {
  if (!Array.isArray(marcas) || marcas.length === 0) {
    throw new Error("Debes asignar al menos una marca");
  }
  const ids = new Set<string>();
  for (const m of marcas) {
    if (!m.marcaId) throw new Error("marcaId requerido");
    if (ids.has(m.marcaId)) {
      throw new Error(`Marca duplicada: ${m.marcaId}`);
    }
    ids.add(m.marcaId);
  }
}

// ----------------------------------------------------------------------------
// Proyectos
// ----------------------------------------------------------------------------
export async function createProyecto(
  input: CreateProyectoInput
): Promise<MkProyecto> {
  const tienda = tituloCase(input.tienda);
  assertNoVacio(tienda, "tienda");

  // Fase 2: marcas a nivel proyecto es opcional. Si vienen, se validan y se
  // insertan en mk_proyecto_marcas (flow legacy). Si no, el proyecto se crea
  // sin marcas y estas se asignan por factura en mk_factura_marcas.
  const tieneMarcas = Array.isArray(input.marcas) && input.marcas.length > 0;
  if (tieneMarcas) {
    validarMarcasUnicas(input.marcas);
  }

  let nombresMarcas: string[] = [];
  if (tieneMarcas) {
    const marcasCatalogo = await getMarcas();
    nombresMarcas = input.marcas
      .map((m) => marcasCatalogo.find((cm) => cm.id === m.marcaId)?.nombre ?? "")
      .filter((n) => n.length > 0);
    if (nombresMarcas.length !== input.marcas.length) {
      throw new Error("Alguna marca seleccionada no existe");
    }
  }

  const nombreProvisto = tituloCase(input.nombre);
  const nombreFinal =
    nombreProvisto.length > 0
      ? nombreProvisto
      : tieneMarcas
        ? autoNombreProyecto(tienda, nombresMarcas, new Date())
        : `${tienda} — ${fechaReferenciaEs(new Date())}`;

  const notas = oracionCase(input.notas);

  const payload = {
    tienda,
    nombre: nombreFinal,
    notas: notas.length > 0 ? notas : null,
  };

  const { data, error } = await supabaseServer
    .from("mk_proyectos")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createProyecto: ${error?.message ?? "sin datos"}`);
  }
  const proyecto = data as MkProyecto;

  if (tieneMarcas) {
    const pmPayload = input.marcas.map((m) => ({
      proyecto_id: proyecto.id,
      marca_id: m.marcaId,
      porcentaje: PORCENTAJE_MARCA_FIJO,
    }));
    const { error: pmError } = await supabaseServer
      .from("mk_proyecto_marcas")
      .insert(pmPayload);
    if (pmError) {
      await supabaseServer.from("mk_proyectos").delete().eq("id", proyecto.id);
      throw new Error(`createProyecto[marcas]: ${pmError.message}`);
    }
  }

  return proyecto;
}

function fechaReferenciaEs(d: Date): string {
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

export async function updateProyecto(
  id: string,
  input: UpdateProyectoInput
): Promise<MkProyecto> {
  if (!id) throw new Error("id requerido");

  const payload: Record<string, unknown> = {};
  if (input.tienda !== undefined) {
    const t = tituloCase(input.tienda);
    assertNoVacio(t, "tienda");
    payload.tienda = t;
  }
  if (input.nombre !== undefined) {
    if (input.nombre === null) {
      payload.nombre = null;
    } else {
      const n = tituloCase(input.nombre);
      payload.nombre = n.length > 0 ? n : null;
    }
  }
  if (input.notas !== undefined) {
    if (input.notas === null) {
      payload.notas = null;
    } else {
      const n = oracionCase(input.notas);
      payload.notas = n.length > 0 ? n : null;
    }
  }
  if (input.estado !== undefined) {
    payload.estado = input.estado;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("updateProyecto: nada que actualizar");
  }

  const { data, error } = await supabaseServer
    .from("mk_proyectos")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`updateProyecto: ${error?.message ?? "sin datos"}`);
  }
  return data as MkProyecto;
}

// Prefijo que marca una factura como anulada por cascada del proyecto.
// Permite distinguirla de una factura anulada manualmente para que al
// restaurar el proyecto se restauren también esas facturas (y no las que
// el usuario anuló a mano).
const CASCADA_PREFIX = "[Proyecto anulado]";

export async function anularProyecto(id: string, motivo: string): Promise<void> {
  // 1. Soft delete del proyecto.
  await anulacionSoftDelete("mk_proyectos", id, motivo);

  // 2. Cascada: anular facturas vivas del proyecto con motivo prefijado.
  const motivoFactura = `${CASCADA_PREFIX} ${normalizarTexto(motivo)}`.trim();
  const { error: factErr } = await supabaseServer
    .from("mk_facturas")
    .update({
      anulado_en: new Date().toISOString(),
      anulado_motivo: motivoFactura,
    })
    .eq("proyecto_id", id)
    .is("anulado_en", null);
  if (factErr) {
    throw new Error(`anularProyecto[facturas cascada]: ${factErr.message}`);
  }
}

export async function restaurarProyecto(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");

  // 1. Restaurar el proyecto.
  const { error } = await supabaseServer
    .from("mk_proyectos")
    .update({ anulado_en: null, anulado_motivo: null })
    .eq("id", id);
  if (error) throw new Error(`restaurarProyecto: ${error.message}`);

  // 2. Restaurar SOLO las facturas que fueron anuladas por la cascada
  //    (motivo prefijado con CASCADA_PREFIX). Las facturas anuladas a mano
  //    quedan como están — el usuario las restaurará individualmente si quiere.
  const { error: factErr } = await supabaseServer
    .from("mk_facturas")
    .update({ anulado_en: null, anulado_motivo: null })
    .eq("proyecto_id", id)
    .not("anulado_en", "is", null)
    .like("anulado_motivo", `${CASCADA_PREFIX}%`);
  if (factErr) {
    throw new Error(`restaurarProyecto[facturas cascada]: ${factErr.message}`);
  }
}

// Transiciones de estado (workflow nuevo: abierto → enviado → cobrado)

export async function marcarProyectoEnviado(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_proyectos")
    .update({ estado: "enviado", fecha_enviado: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`marcarProyectoEnviado: ${error.message}`);
}

export async function marcarProyectoCobrado(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_proyectos")
    .update({ estado: "cobrado", fecha_cobrado: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`marcarProyectoCobrado: ${error.message}`);
}

// Reabrir: cobrado → enviado (limpia fecha_cobrado);
//          enviado → abierto (limpia fecha_enviado).
export async function reabrirProyecto(id: string): Promise<"abierto" | "enviado"> {
  if (!id) throw new Error("id requerido");
  const { data: row, error: readErr } = await supabaseServer
    .from("mk_proyectos")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(`reabrirProyecto[read]: ${readErr.message}`);
  if (!row) throw new Error("Proyecto no encontrado");
  const estadoActual = String((row as { estado: string }).estado);
  if (estadoActual === "cobrado") {
    const { error } = await supabaseServer
      .from("mk_proyectos")
      .update({ estado: "enviado", fecha_cobrado: null })
      .eq("id", id);
    if (error) throw new Error(`reabrirProyecto[cobrado→enviado]: ${error.message}`);
    return "enviado";
  }
  if (estadoActual === "enviado") {
    const { error } = await supabaseServer
      .from("mk_proyectos")
      .update({ estado: "abierto", fecha_enviado: null })
      .eq("id", id);
    if (error) throw new Error(`reabrirProyecto[enviado→abierto]: ${error.message}`);
    return "abierto";
  }
  throw new Error(`No se puede reabrir desde estado '${estadoActual}'`);
}

export async function updateProyectoMarcas(
  proyectoId: string,
  marcas: ReadonlyArray<MarcaPorcentajeInput>
): Promise<void> {
  if (!proyectoId) throw new Error("proyectoId requerido");
  validarMarcasUnicas(marcas);

  const { error: delError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .delete()
    .eq("proyecto_id", proyectoId);
  if (delError) throw new Error(`updateProyectoMarcas[delete]: ${delError.message}`);

  const payload = marcas.map((m) => ({
    proyecto_id: proyectoId,
    marca_id: m.marcaId,
    porcentaje: PORCENTAJE_MARCA_FIJO,
  }));
  const { error: insError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .insert(payload);
  if (insError) throw new Error(`updateProyectoMarcas[insert]: ${insError.message}`);
}

// ----------------------------------------------------------------------------
// Facturas
// ----------------------------------------------------------------------------
export async function createFactura(
  input: CreateFacturaInput
): Promise<MkFactura> {
  if (!input.proyectoId) throw new Error("proyectoId requerido");
  const numero = normalizarTexto(input.numeroFactura);
  assertNoVacio(numero, "numeroFactura");
  const proveedor = tituloCase(input.proveedor);
  assertNoVacio(proveedor, "proveedor");
  // Preservar capitalización del concepto: la IA extrae con mayúsculas correctas
  // (nombres propios, marcas, tiendas) y el usuario puede escribir como prefiera.
  // Solo normalizamos espacios en blanco.
  const concepto = normalizarTexto(input.concepto);
  assertNoVacio(concepto, "concepto");

  const fecha = normalizarTexto(input.fechaFactura);
  assertNoVacio(fecha, "fechaFactura");

  const subtotal = round2(Number(input.subtotal ?? 0));
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("subtotal inválido");
  }
  const itbms = round2(Number(input.itbms ?? 0));
  if (!Number.isFinite(itbms) || itbms < 0) {
    throw new Error("itbms inválido");
  }
  const total = round2(subtotal + itbms);

  const payload = {
    proyecto_id: input.proyectoId,
    numero_factura: numero,
    fecha_factura: fecha,
    proveedor,
    concepto,
    subtotal,
    itbms,
    total,
  };

  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createFactura: ${error?.message ?? "sin datos"}`);
  }
  return data as MkFactura;
}

export async function updateFactura(
  id: string,
  input: UpdateFacturaInput
): Promise<MkFactura> {
  if (!id) throw new Error("id requerido");

  const payload: Record<string, unknown> = {};
  if (input.numeroFactura !== undefined) {
    const n = normalizarTexto(input.numeroFactura);
    assertNoVacio(n, "numeroFactura");
    payload.numero_factura = n;
  }
  if (input.fechaFactura !== undefined) {
    const f = normalizarTexto(input.fechaFactura);
    assertNoVacio(f, "fechaFactura");
    payload.fecha_factura = f;
  }
  if (input.proveedor !== undefined) {
    const p = tituloCase(input.proveedor);
    assertNoVacio(p, "proveedor");
    payload.proveedor = p;
  }
  if (input.concepto !== undefined) {
    const c = normalizarTexto(input.concepto);
    assertNoVacio(c, "concepto");
    payload.concepto = c;
  }

  // Si cambia subtotal o itbms, recalcular total.
  const hasSubtotal = input.subtotal !== undefined;
  const hasItbms = input.itbms !== undefined;
  if (hasSubtotal || hasItbms) {
    const { data: actual, error: err } = await supabaseServer
      .from("mk_facturas")
      .select("subtotal, itbms")
      .eq("id", id)
      .maybeSingle();
    if (err || !actual) {
      throw new Error(`updateFactura[lookup]: ${err?.message ?? "factura no existe"}`);
    }
    const a = actual as Record<string, unknown>;
    const sub = hasSubtotal ? Number(input.subtotal) : Number(a.subtotal ?? 0);
    const itb = hasItbms ? Number(input.itbms) : Number(a.itbms ?? 0);
    if (!Number.isFinite(sub) || sub < 0) throw new Error("subtotal inválido");
    if (!Number.isFinite(itb) || itb < 0) throw new Error("itbms inválido");
    payload.subtotal = round2(sub);
    payload.itbms = round2(itb);
    payload.total = round2(sub + itb);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("updateFactura: nada que actualizar");
  }

  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`updateFactura: ${error?.message ?? "sin datos"}`);
  }
  return data as MkFactura;
}

export async function anularFactura(id: string, motivo: string): Promise<void> {
  await anulacionSoftDelete("mk_facturas", id, motivo);
}

export async function restaurarFactura(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_facturas")
    .update({ anulado_en: null, anulado_motivo: null })
    .eq("id", id);
  if (error) throw new Error(`restaurarFactura: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Adjuntos (hard delete, no hay soft delete en la tabla)
// ----------------------------------------------------------------------------
export async function createAdjunto(
  input: CreateAdjuntoInput
): Promise<MkAdjunto> {
  const url = normalizarTexto(input.url);
  assertNoVacio(url, "url");

  if (!input.proyectoId && !input.facturaId) {
    throw new Error("Se requiere proyectoId o facturaId");
  }

  // Validaciones de consistencia con el CHECK del schema
  if (input.tipo === "pdf_factura" || input.tipo === "foto_factura") {
    if (!input.facturaId) {
      throw new Error(`${input.tipo} requiere facturaId`);
    }
  }
  if (input.tipo === "foto_proyecto") {
    if (!input.proyectoId) {
      throw new Error("foto_proyecto requiere proyectoId");
    }
    if (input.facturaId) {
      throw new Error("foto_proyecto no puede tener facturaId");
    }
  }

  const payload = {
    proyecto_id: input.proyectoId ?? null,
    factura_id: input.facturaId ?? null,
    tipo: input.tipo,
    url,
    nombre_original: input.nombreOriginal
      ? normalizarTexto(input.nombreOriginal)
      : null,
    size_bytes: input.sizeBytes ?? null,
  };

  const { data, error } = await supabaseServer
    .from("mk_adjuntos")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createAdjunto: ${error?.message ?? "sin datos"}`);
  }
  return data as MkAdjunto;
}

export async function deleteAdjunto(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_adjuntos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteAdjunto: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Helper genérico de soft delete + limpieza física
// ----------------------------------------------------------------------------
type TablaSoftDelete = "mk_proyectos" | "mk_facturas";

export async function anulacionSoftDelete(
  tabla: TablaSoftDelete,
  id: string,
  motivo: string
): Promise<void> {
  if (!id) throw new Error("id requerido");
  const motivoLimpio = normalizarTexto(motivo);
  assertNoVacio(motivoLimpio, "motivo");

  const { error } = await supabaseServer
    .from(tabla)
    .update({
      anulado_en: new Date().toISOString(),
      anulado_motivo: motivoLimpio,
    })
    .eq("id", id);
  if (error) throw new Error(`anulacionSoftDelete[${tabla}]: ${error.message}`);
}

/**
 * Hard delete de un proyecto anulado: borra el proyecto y sus dependencias
 * (mk_factura_marcas, mk_proyecto_marcas, mk_facturas, mk_adjuntos).
 * Valida que el proyecto esté anulado antes de borrar — nunca borra activos.
 */
export async function eliminarProyectoPermanente(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");

  // Validar que esté anulado.
  const { data: row, error: readErr } = await supabaseServer
    .from("mk_proyectos")
    .select("id, anulado_en")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(`eliminarProyectoPermanente[read]: ${readErr.message}`);
  if (!row) throw new Error("Proyecto no encontrado");
  if (!(row as { anulado_en: string | null }).anulado_en) {
    throw new Error("Solo se pueden eliminar proyectos previamente anulados");
  }

  // Reunir IDs de facturas del proyecto para borrar mk_factura_marcas y adjuntos hijos.
  const { data: factRows, error: factErr } = await supabaseServer
    .from("mk_facturas")
    .select("id")
    .eq("proyecto_id", id);
  if (factErr) throw new Error(`eliminarProyectoPermanente[facturas read]: ${factErr.message}`);
  const facturaIds = (factRows ?? []).map((r) => String((r as { id: string }).id));

  // Borrar mk_factura_marcas y adjuntos de las facturas (si hay facturas).
  if (facturaIds.length > 0) {
    const { error: fmErr } = await supabaseServer
      .from("mk_factura_marcas")
      .delete()
      .in("factura_id", facturaIds);
    if (fmErr) throw new Error(`eliminarProyectoPermanente[factura_marcas]: ${fmErr.message}`);

    const { error: adjFactErr } = await supabaseServer
      .from("mk_adjuntos")
      .delete()
      .in("factura_id", facturaIds);
    if (adjFactErr) throw new Error(`eliminarProyectoPermanente[adjuntos factura]: ${adjFactErr.message}`);
  }

  // Adjuntos del proyecto (fotos).
  const { error: adjProyErr } = await supabaseServer
    .from("mk_adjuntos")
    .delete()
    .eq("proyecto_id", id);
  if (adjProyErr) throw new Error(`eliminarProyectoPermanente[adjuntos proyecto]: ${adjProyErr.message}`);

  // mk_proyecto_marcas.
  const { error: pmErr } = await supabaseServer
    .from("mk_proyecto_marcas")
    .delete()
    .eq("proyecto_id", id);
  if (pmErr) throw new Error(`eliminarProyectoPermanente[proyecto_marcas]: ${pmErr.message}`);

  // Facturas.
  if (facturaIds.length > 0) {
    const { error: delFactErr } = await supabaseServer
      .from("mk_facturas")
      .delete()
      .in("id", facturaIds);
    if (delFactErr) throw new Error(`eliminarProyectoPermanente[facturas delete]: ${delFactErr.message}`);
  }

  // Proyecto.
  const { error: delErr } = await supabaseServer
    .from("mk_proyectos")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(`eliminarProyectoPermanente[proyecto delete]: ${delErr.message}`);
}

/**
 * Hard delete de una factura anulada: borra la factura y sus dependencias
 * (mk_factura_marcas, mk_adjuntos). Valida que la factura esté anulada.
 */
export async function eliminarFacturaPermanente(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");

  const { data: row, error: readErr } = await supabaseServer
    .from("mk_facturas")
    .select("id, anulado_en")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(`eliminarFacturaPermanente[read]: ${readErr.message}`);
  if (!row) throw new Error("Factura no encontrada");
  if (!(row as { anulado_en: string | null }).anulado_en) {
    throw new Error("Solo se pueden eliminar facturas previamente anuladas");
  }

  const { error: fmErr } = await supabaseServer
    .from("mk_factura_marcas")
    .delete()
    .eq("factura_id", id);
  if (fmErr) throw new Error(`eliminarFacturaPermanente[factura_marcas]: ${fmErr.message}`);

  const { error: adjErr } = await supabaseServer
    .from("mk_adjuntos")
    .delete()
    .eq("factura_id", id);
  if (adjErr) throw new Error(`eliminarFacturaPermanente[adjuntos]: ${adjErr.message}`);

  const { error: delErr } = await supabaseServer
    .from("mk_facturas")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(`eliminarFacturaPermanente[delete]: ${delErr.message}`);
}

/**
 * Limpieza física de registros anulados con más de N años.
 * USAR SOLO desde un endpoint admin controlado.
 */
export async function limpiezaAnualAnulados(
  anios: number = 5
): Promise<{ proyectos: number; facturas: number }> {
  if (!Number.isFinite(anios) || anios < 1) {
    throw new Error("anios debe ser >= 1");
  }
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - anios);
  const cutoffIso = cutoff.toISOString();

  const result = { proyectos: 0, facturas: 0 };

  const tablas: Array<{ tabla: TablaSoftDelete; key: keyof typeof result }> = [
    { tabla: "mk_proyectos", key: "proyectos" },
    { tabla: "mk_facturas", key: "facturas" },
  ];

  for (const { tabla, key } of tablas) {
    const { data, error } = await supabaseServer
      .from(tabla)
      .delete()
      .not("anulado_en", "is", null)
      .lt("anulado_en", cutoffIso)
      .select("id");
    if (error) throw new Error(`limpiezaAnualAnulados[${tabla}]: ${error.message}`);
    result[key] = (data ?? []).length;
  }

  return result;
}
