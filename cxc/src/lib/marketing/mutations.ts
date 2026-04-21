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
import { getCobranzaById, getMarcas } from "./queries";
import type {
  MkProyecto,
  MkFactura,
  MkCobranza,
  MkPago,
  MkAdjunto,
  CreateProyectoInput,
  UpdateProyectoInput,
  CreateFacturaInput,
  UpdateFacturaInput,
  CreateAdjuntoInput,
  CreateCobranzaInput,
  UpdateCobranzaInput,
  CreatePagoInput,
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

function validarSumaCien(marcas: ReadonlyArray<MarcaPorcentajeInput>): void {
  if (!Array.isArray(marcas) || marcas.length === 0) {
    throw new Error("Debes asignar al menos una marca al proyecto");
  }
  const suma = marcas.reduce((acc, m) => acc + Number(m.porcentaje ?? 0), 0);
  const diff = Math.abs(suma - 100);
  if (diff > 0.01) {
    throw new Error(
      `La suma de porcentajes debe ser 100% (actual: ${suma.toFixed(2)}%)`
    );
  }
  for (const m of marcas) {
    if (!m.marcaId) throw new Error("marcaId requerido");
    if (typeof m.porcentaje !== "number" || m.porcentaje <= 0 || m.porcentaje > 100) {
      throw new Error("porcentaje debe estar entre 0 y 100");
    }
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

  validarSumaCien(input.marcas);

  // Resolver nombres de marcas para auto-generar nombre si no viene
  const marcasCatalogo = await getMarcas();
  const nombresMarcas = input.marcas
    .map((m) => marcasCatalogo.find((cm) => cm.id === m.marcaId)?.nombre ?? "")
    .filter((n) => n.length > 0);
  if (nombresMarcas.length !== input.marcas.length) {
    throw new Error("Alguna marca seleccionada no existe");
  }

  const nombreProvisto = tituloCase(input.nombre);
  const nombreFinal =
    nombreProvisto.length > 0
      ? nombreProvisto
      : autoNombreProyecto(tienda, nombresMarcas, new Date());

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

  // Insertar marcas. Si falla, rollback manual (eliminar el proyecto recién creado).
  const pmPayload = input.marcas.map((m) => ({
    proyecto_id: proyecto.id,
    marca_id: m.marcaId,
    porcentaje: round2(m.porcentaje),
  }));
  const { error: pmError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .insert(pmPayload);
  if (pmError) {
    await supabaseServer.from("mk_proyectos").delete().eq("id", proyecto.id);
    throw new Error(`createProyecto[marcas]: ${pmError.message}`);
  }

  return proyecto;
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

export async function anularProyecto(id: string, motivo: string): Promise<void> {
  await anulacionSoftDelete("mk_proyectos", id, motivo);
}

export async function restaurarProyecto(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_proyectos")
    .update({ anulado_en: null, anulado_motivo: null })
    .eq("id", id);
  if (error) throw new Error(`restaurarProyecto: ${error.message}`);
}

export async function cerrarProyecto(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabaseServer
    .from("mk_proyectos")
    .update({ estado: "cobrado", fecha_cierre: hoy })
    .eq("id", id);
  if (error) throw new Error(`cerrarProyecto: ${error.message}`);
}

export async function updateProyectoMarcas(
  proyectoId: string,
  marcas: ReadonlyArray<MarcaPorcentajeInput>
): Promise<void> {
  if (!proyectoId) throw new Error("proyectoId requerido");
  validarSumaCien(marcas);

  const { error: delError } = await supabaseServer
    .from("mk_proyecto_marcas")
    .delete()
    .eq("proyecto_id", proyectoId);
  if (delError) throw new Error(`updateProyectoMarcas[delete]: ${delError.message}`);

  const payload = marcas.map((m) => ({
    proyecto_id: proyectoId,
    marca_id: m.marcaId,
    porcentaje: round2(m.porcentaje),
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
  const concepto = oracionCase(input.concepto);
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
    const c = oracionCase(input.concepto);
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
// Cobranzas
// ----------------------------------------------------------------------------
async function generarNumeroCobranza(fecha: Date): Promise<string> {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const prefijo = `CB-${y}${m}-`;

  const { data, error } = await supabaseServer
    .from("mk_cobranzas")
    .select("numero")
    .like("numero", `${prefijo}%`)
    .order("numero", { ascending: false })
    .limit(1);
  if (error) throw new Error(`generarNumeroCobranza: ${error.message}`);

  let seq = 1;
  const rows = data ?? [];
  if (rows.length > 0) {
    const ultimo = String((rows[0] as Record<string, unknown>).numero ?? "");
    const sufijo = ultimo.slice(prefijo.length);
    const n = parseInt(sufijo, 10);
    if (Number.isFinite(n) && n >= 1) seq = n + 1;
  }
  return `${prefijo}${String(seq).padStart(4, "0")}`;
}

export async function createCobranza(
  input: CreateCobranzaInput
): Promise<MkCobranza> {
  if (!input.proyectoId) throw new Error("proyectoId requerido");
  if (!input.marcaId) throw new Error("marcaId requerido");

  const monto = round2(Number(input.monto ?? 0));
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error("monto inválido");
  }

  const email = input.emailDestino ? emailLower(input.emailDestino) : "";
  const asunto = input.asunto ? oracionCase(input.asunto) : "";
  // El cuerpo es texto largo con saltos de línea: solo trim + colapso de espacios por línea,
  // preservando saltos de línea.
  const cuerpo = input.cuerpo
    ? input.cuerpo
        .split("\n")
        .map((linea) => linea.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim()
    : "";
  const notas = input.notas ? oracionCase(input.notas) : "";

  const numero = await generarNumeroCobranza(new Date());

  const payload = {
    numero,
    proyecto_id: input.proyectoId,
    marca_id: input.marcaId,
    monto,
    email_destino: email.length > 0 ? email : null,
    asunto: asunto.length > 0 ? asunto : null,
    cuerpo: cuerpo.length > 0 ? cuerpo : null,
    notas: notas.length > 0 ? notas : null,
    estado: "borrador" as const,
  };

  const { data, error } = await supabaseServer
    .from("mk_cobranzas")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createCobranza: ${error?.message ?? "sin datos"}`);
  }
  return data as MkCobranza;
}

export async function updateCobranza(
  id: string,
  input: UpdateCobranzaInput
): Promise<MkCobranza> {
  if (!id) throw new Error("id requerido");

  const payload: Record<string, unknown> = {};
  if (input.monto !== undefined) {
    const m = round2(Number(input.monto));
    if (!Number.isFinite(m) || m < 0) throw new Error("monto inválido");
    payload.monto = m;
  }
  if (input.emailDestino !== undefined) {
    if (input.emailDestino === null) payload.email_destino = null;
    else {
      const e = emailLower(input.emailDestino);
      payload.email_destino = e.length > 0 ? e : null;
    }
  }
  if (input.asunto !== undefined) {
    if (input.asunto === null) payload.asunto = null;
    else {
      const a = oracionCase(input.asunto);
      payload.asunto = a.length > 0 ? a : null;
    }
  }
  if (input.cuerpo !== undefined) {
    if (input.cuerpo === null) payload.cuerpo = null;
    else {
      const c = input.cuerpo
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim();
      payload.cuerpo = c.length > 0 ? c : null;
    }
  }
  if (input.notas !== undefined) {
    if (input.notas === null) payload.notas = null;
    else {
      const n = oracionCase(input.notas);
      payload.notas = n.length > 0 ? n : null;
    }
  }
  if (input.estado !== undefined) {
    payload.estado = input.estado;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("updateCobranza: nada que actualizar");
  }

  const { data, error } = await supabaseServer
    .from("mk_cobranzas")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`updateCobranza: ${error?.message ?? "sin datos"}`);
  }
  return data as MkCobranza;
}

export async function marcarCobranzaEnviada(
  id: string,
  fechaEnvio?: string
): Promise<void> {
  if (!id) throw new Error("id requerido");
  const fecha = fechaEnvio ? normalizarTexto(fechaEnvio) : new Date().toISOString().slice(0, 10);
  const { error } = await supabaseServer
    .from("mk_cobranzas")
    .update({ estado: "enviada", fecha_envio: fecha })
    .eq("id", id);
  if (error) throw new Error(`marcarCobranzaEnviada: ${error.message}`);
}

export async function marcarCobranzaDisputada(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_cobranzas")
    .update({ estado: "disputada" })
    .eq("id", id);
  if (error) throw new Error(`marcarCobranzaDisputada: ${error.message}`);
}

export async function anularCobranza(id: string, motivo: string): Promise<void> {
  await anulacionSoftDelete("mk_cobranzas", id, motivo);
}

export async function restaurarCobranza(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  const { error } = await supabaseServer
    .from("mk_cobranzas")
    .update({ anulado_en: null, anulado_motivo: null })
    .eq("id", id);
  if (error) throw new Error(`restaurarCobranza: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Pagos
// ----------------------------------------------------------------------------
export async function createPago(input: CreatePagoInput): Promise<MkPago> {
  if (!input.cobranzaId) throw new Error("cobranzaId requerido");
  const fecha = normalizarTexto(input.fechaPago);
  assertNoVacio(fecha, "fechaPago");

  const monto = round2(Number(input.monto ?? 0));
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }

  // Validar que no exceda el saldo pendiente (solo pagos vigentes cuentan).
  const cobranza = await getCobranzaById(input.cobranzaId);
  if (!cobranza) throw new Error("Cobranza no existe");
  if (cobranza.anulado_en) throw new Error("La cobranza está anulada");
  if (monto > cobranza.saldo + 0.01) {
    throw new Error(
      `El pago ($${monto.toFixed(2)}) excede el saldo pendiente ($${cobranza.saldo.toFixed(2)})`
    );
  }

  const payload = {
    cobranza_id: input.cobranzaId,
    fecha_pago: fecha,
    monto,
    referencia: input.referencia ? normalizarTexto(input.referencia) : null,
    comprobante_url: input.comprobanteUrl
      ? normalizarTexto(input.comprobanteUrl)
      : null,
    notas: input.notas ? oracionCase(input.notas) : null,
  };

  const { data, error } = await supabaseServer
    .from("mk_pagos")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createPago: ${error?.message ?? "sin datos"}`);
  }
  return data as MkPago;
}

// ----------------------------------------------------------------------------
// Helper genérico de soft delete + limpieza física
// ----------------------------------------------------------------------------
type TablaSoftDelete = "mk_proyectos" | "mk_facturas" | "mk_cobranzas";

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
 * Limpieza física de registros anulados con más de N años.
 * USAR SOLO desde un endpoint admin controlado.
 */
export async function limpiezaAnualAnulados(
  anios: number = 5
): Promise<{ proyectos: number; facturas: number; cobranzas: number }> {
  if (!Number.isFinite(anios) || anios < 1) {
    throw new Error("anios debe ser >= 1");
  }
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - anios);
  const cutoffIso = cutoff.toISOString();

  const result = { proyectos: 0, facturas: 0, cobranzas: 0 };

  const tablas: Array<{ tabla: TablaSoftDelete; key: keyof typeof result }> = [
    { tabla: "mk_proyectos", key: "proyectos" },
    { tabla: "mk_facturas", key: "facturas" },
    { tabla: "mk_cobranzas", key: "cobranzas" },
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
