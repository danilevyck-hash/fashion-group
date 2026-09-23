// ============================================================================
// Marketing module — mutations (escritura contra Supabase)
// Toda escritura aplica auto-limpieza (normalizar) antes de insertar.
// Inputs tipados, sin `any`. Inmutable: nunca mutamos inputs.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import { calcularCostoTotal } from "@/lib/marketing-calc";
import {
  tituloCase,
  oracionCase,
  emailLower,
  normalizarTexto,
} from "./normalizar";
import { esPathStorage } from "./storage";
import { sellarDocumento, proveedoresDeMarcaIds } from "./periodos-io";
import {
  conRespaldoSinColumnas,
  sinColumnasDelRediseno,
} from "./columnas-opcionales";
import { columnasDelGasto, traeColumnasDelGasto } from "./puerta-gasto";
import {
  exigirTiendaDelDirectorio,
  frenarFacturaDuplicada,
} from "./puerta-gasto-server";
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

  // Las marcas se asignan a nivel FACTURA (mk_factura_marcas). El proyecto se
  // crea sin marcas; la rama legacy mk_proyecto_marcas se retiró (el form
  // siempre manda marcas:[]). La tabla mk_proyecto_marcas se conserva en DB.
  const nombreProvisto = tituloCase(input.nombre);
  const nombreFinal =
    nombreProvisto.length > 0
      ? nombreProvisto
      : `${tienda} — ${fechaReferenciaEs(new Date())}`;

  const notas = oracionCase(input.notas);

  const tiendaCodigo =
    typeof input.tiendaCodigo === "string" && input.tiendaCodigo.trim().length > 0
      ? input.tiendaCodigo.trim()
      : null;

  const payload = {
    tienda,
    tienda_codigo: tiendaCodigo,
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
  return data as MkProyecto;
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
  if (input.tiendaCodigo !== undefined) {
    const c =
      typeof input.tiendaCodigo === "string" && input.tiendaCodigo.trim().length > 0
        ? input.tiendaCodigo.trim()
        : null;
    payload.tienda_codigo = c;
  }
  // `estado` ya no se acepta: el estado del proyecto se retiró de la UI
  // (11-ago-2026) y no queda ningún escritor legítimo.
  if (input.fecha_inicio !== undefined) {
    const f = normalizarTexto(input.fecha_inicio);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      throw new Error("fecha_inicio debe tener formato YYYY-MM-DD");
    }
    payload.fecha_inicio = f;
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

// El estado del proyecto dejó de escribirse (11-ago-2026): "Cerrar proyecto"
// se retiró de la UI y con él cerrarProyecto/reabrirProyecto. Los valores
// legacy que pudieran quedar en la columna ('cerrado'/'enviado'/'cobrado') se
// leen vía normalizarEstadoProyecto y nunca se reescriben.

// 🩸 `updateProyectoMarcas` SE RETIRÓ (22-sep-2026): escribía
// `mk_proyecto_marcas`, la marca POR PROYECTO del modelo viejo. La marca es
// del GASTO (`lib/marketing/gasto.ts`). La tabla se queda, sin lectores ni
// escritores (patrón `mayor_lineas`).

// ----------------------------------------------------------------------------
// Facturas
// ----------------------------------------------------------------------------
//
// 🔑 EL SELLO DE PERÍODO NO SE PONE ACÁ, y no es un olvido. Una factura recién
// creada TODAVÍA NO TIENE MARCA (`mk_factura_marcas` se escribe después, con
// `setMarcasDeFactura`), y sin marca no hay proveedor a quien reportarle el
// gasto ni período al que atarla. El sello se pone en el instante en que la
// marca se conoce — o sea en `setMarcasDeFactura` y en
// `actualizarRepartoProyecto`, que son los DOS únicos lugares que la escriben.
// Una factura que nunca recibe marca tampoco entra en ningún reporte, así que
// no queda nada suelto.
/**
 * Mensaje para cuando la base todavía tiene el CHECK viejo
 * (`mk_facturas_origen_check`: proyecto O impulsadora, nunca los dos NULL).
 * La migración 20260811180000 lo quita; hasta que Daniel la corra, un gasto
 * sin cliente rebota en la base y ESTE texto es lo que ve la secretaria —
 * no un error de Postgres.
 */
export const MSG_SIN_CLIENTE_SIN_DDL =
  "Para registrar un gasto sin cliente falta correr la actualización de la base de datos. Mientras tanto, elige un cliente.";

/**
 * El `insert` de la factura CON las columnas del rediseño y, si la base dijera
 * que no existen, el MISMO insert sin ellas (`columnas-opcionales.ts`, falla
 * abierta). Sin columnas nuevas en el payload no hay reintento que hacer.
 */
async function insertarFacturaConRespaldo(payload: Record<string, unknown>) {
  const insertar = (p: Record<string, unknown>) =>
    supabaseServer.from("mk_facturas").insert(p).select("*").single();
  const traeNuevas = ["se_reporta", "tienda_codigo", "nota"].some((c) => c in payload);
  if (!traeNuevas) {
    return { resultado: await insertar(payload), conLasColumnas: true };
  }
  return conRespaldoSinColumnas(
    () => insertar(payload),
    () => insertar(sinColumnasDelRediseno(payload)),
    (m) => console.error(m),
  );
}

export async function createFactura(
  input: CreateFacturaInput
): Promise<MkFactura> {
  // `proyectoId` OPCIONAL desde el rediseño "Registrar gasto": un gasto sin
  // cliente (evento, catálogo, material general) se guarda con proyecto NULL
  // y sale en el reporte de su marca bajo "General".
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
  const tieneImportacion = Boolean(input.tieneImportacion);
  // Zona libre y ITBMS son mutuamente excluyentes: si zona libre, ITBMS = 0.
  const itbms = tieneImportacion ? 0 : round2(Number(input.itbms ?? 0));
  if (!Number.isFinite(itbms) || itbms < 0) {
    throw new Error("itbms inválido");
  }
  const total = tieneImportacion
    ? calcularCostoTotal(subtotal, true)
    : round2(subtotal + itbms);

  const estadoPago = input.estadoPago === "pagado" ? "pagado" : "creado";

  // 🔴 EL REDISEÑO (22-sep-2026, pieza A): las tres columnas nuevas entran
  // SOLO si la pantalla las mandó (`columnasDelGasto`); la tienda tiene que
  // estar en el directorio; y ANTES de escribir, el freno de duplicados
  // (proveedor normalizado + monto + fecha) — que lanza y no guarda.
  const cols = columnasDelGasto(input);
  await exigirTiendaDelDirectorio(cols.tienda_codigo);
  await frenarFacturaDuplicada({
    proveedor,
    monto: total,
    fecha,
    tienda: cols.tienda_codigo ?? null,
    numero,
  });

  const payload = {
    proyecto_id: input.proyectoId ?? null,
    numero_factura: numero,
    fecha_factura: fecha,
    proveedor,
    concepto,
    subtotal,
    itbms,
    total,
    tiene_importacion: tieneImportacion,
    estado_pago: estadoPago,
    ...cols,
  };

  const { resultado } = await insertarFacturaConRespaldo(payload);
  const { data, error } = resultado;
  if (error || !data) {
    // Pre-DDL: el CHECK viejo rechaza proyecto e impulsadora los dos en NULL.
    // La pantalla tiene que degradar limpio ANTES de que corra la migración.
    if (!input.proyectoId && /mk_facturas_origen_check/i.test(error?.message ?? "")) {
      throw new Error(MSG_SIN_CLIENTE_SIN_DDL);
    }
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
  if (input.estadoPago !== undefined) {
    payload.estado_pago = input.estadoPago === "pagado" ? "pagado" : "creado";
  }
  // Las tres columnas del rediseño, solo si vinieron (22-sep-2026, pieza A).
  const cols = columnasDelGasto(input);
  await exigirTiendaDelDirectorio(cols.tienda_codigo);
  Object.assign(payload, cols);

  // Si cambia subtotal, itbms o tieneImportacion, recalcular total.
  const hasSubtotal = input.subtotal !== undefined;
  const hasItbms = input.itbms !== undefined;
  const hasTieneImportacion = input.tieneImportacion !== undefined;
  if (hasSubtotal || hasItbms || hasTieneImportacion) {
    const { data: actual, error: err } = await supabaseServer
      .from("mk_facturas")
      .select("subtotal, itbms, tiene_importacion")
      .eq("id", id)
      .maybeSingle();
    if (err || !actual) {
      throw new Error(`updateFactura[lookup]: ${err?.message ?? "factura no existe"}`);
    }
    const a = actual as Record<string, unknown>;
    const sub = hasSubtotal ? Number(input.subtotal) : Number(a.subtotal ?? 0);
    const tieneImp = hasTieneImportacion
      ? Boolean(input.tieneImportacion)
      : Boolean(a.tiene_importacion);
    // Zona libre fuerza ITBMS = 0; si no, usa input o el actual.
    const itb = tieneImp
      ? 0
      : hasItbms
        ? Number(input.itbms)
        : Number(a.itbms ?? 0);
    if (!Number.isFinite(sub) || sub < 0) throw new Error("subtotal inválido");
    if (!Number.isFinite(itb) || itb < 0) throw new Error("itbms inválido");
    payload.subtotal = round2(sub);
    payload.itbms = round2(itb);
    payload.tiene_importacion = tieneImp;
    payload.total = tieneImp
      ? calcularCostoTotal(sub, true)
      : round2(sub + itb);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("updateFactura: nada que actualizar");
  }

  // 🔴 Editar tampoco puede dejar dos iguales: si cambió el proveedor, la
  // fecha, el monto, la TIENDA o el NÚMERO, se mira la huella RESULTANTE
  // contra las demás vivas
  // (la propia fila se salta por `id`). Un pago de impulsadora no pasa por
  // acá: su freno mira `periodo_desde` y vive en `impulsadoras.ts`.
  if (
    payload.proveedor !== undefined ||
    payload.fecha_factura !== undefined ||
    payload.total !== undefined ||
    payload.tienda_codigo !== undefined ||
    payload.numero_factura !== undefined
  ) {
    await frenarSiEditarDejaDuplicado(id, payload);
  }

  const actualizar = (p: Record<string, unknown>) =>
    supabaseServer.from("mk_facturas").update(p).eq("id", id).select("*").single();
  const { resultado } = traeColumnasDelGasto(cols)
    ? await conRespaldoSinColumnas(
        () => actualizar(payload),
        () => actualizar(sinColumnasDelRediseno(payload)),
        (m) => console.error(m),
      )
    : { resultado: await actualizar(payload) };
  const { data, error } = resultado;
  if (error || !data) {
    throw new Error(`updateFactura: ${error?.message ?? "sin datos"}`);
  }
  return data as MkFactura;
}

/** La huella que tendría la factura DESPUÉS de la edición, contra las vivas. */
async function frenarSiEditarDejaDuplicado(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // `tienda_codigo` es del rediseño: sin la columna se relee sin ella y la
  // fila cuenta como «General» — el freno queda más suelto, nunca más
  // apretado. Falla ABIERTA.
  const leer = (columnas: string) =>
    supabaseServer.from("mk_facturas").select(columnas).eq("id", id).maybeSingle();
  const { resultado } = await conRespaldoSinColumnas<unknown>(
    () => leer("proveedor, total, fecha_factura, impulsadora_id, numero_factura, tienda_codigo"),
    () => leer("proveedor, total, fecha_factura, impulsadora_id, numero_factura"),
  );
  const { data, error } = resultado;
  if (error || !data) return; // sin fila no hay con qué comparar; el update dirá lo suyo
  const fila = data as {
    proveedor: string | null;
    total: number | null;
    fecha_factura: string | null;
    impulsadora_id: string | null;
    numero_factura?: string | null;
    tienda_codigo?: string | null;
  };
  if (fila.impulsadora_id) return;
  await frenarFacturaDuplicada({
    id,
    proveedor: (payload.proveedor as string | undefined) ?? fila.proveedor,
    monto: (payload.total as number | undefined) ?? fila.total,
    fecha: (payload.fecha_factura as string | undefined) ?? fila.fecha_factura,
    tienda: (payload.tienda_codigo as string | undefined) ?? fila.tienda_codigo ?? null,
    numero: (payload.numero_factura as string | undefined) ?? fila.numero_factura ?? null,
  });
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

// Los hard-delete de anulados (eliminarProyectoPermanente / eliminarFacturaPermanente)
// se retiraron el 11-ago-2026 junto con su única puerta, la ruta
// `anulados/eliminar-bulk` (0 llamadores — la pantalla de Anulados se fue en
// el rediseño por marca). Lo vivo es el soft delete de arriba y su vuelta
// atrás (`papelera/restaurar`).

// ----------------------------------------------------------------------------
// Bulk update reparto a nivel proyecto
// ----------------------------------------------------------------------------
// Reemplaza el reparto de marcas para TODAS las facturas vigentes del proyecto
// + actualiza mk_proyecto_marcas (legacy/fallback). Best-effort secuencial:
// si una escritura falla a mitad, las anteriores quedan aplicadas y el caller
// debe loguear el estado para reconciliación manual.
//
// Reglas de tipo (alineadas con factura-marcas.ts):
//   - Todas las marcas deben ser del mismo tipo (externa o interna).
//   - Externa → porcentaje = 50. Interna → 100.
//   - Cualquier `porcentaje` en input se ignora.
// ----------------------------------------------------------------------------
export async function actualizarRepartoProyecto(
  proyectoId: string,
  marcas: ReadonlyArray<MarcaPorcentajeInput>,
): Promise<void> {
  if (!proyectoId) throw new Error("proyectoId requerido");
  validarMarcasUnicas(marcas);

  const marcaIds = marcas.map((m) => m.marcaId);
  const { data: marcasRows, error: mErr } = await supabaseServer
    .from("mk_marcas")
    .select("id, tipo, empresa_codigo")
    .in("id", marcaIds);
  if (mErr) {
    throw new Error(`actualizarRepartoProyecto[marcas read]: ${mErr.message}`);
  }
  const tipoById = new Map<string, "externa" | "interna">();
  const empresaById = new Map<string, string>();
  for (const r of (marcasRows ?? []) as Array<Record<string, unknown>>) {
    const t = String(r.tipo ?? "externa") === "interna" ? "interna" : "externa";
    tipoById.set(String(r.id), t);
    empresaById.set(String(r.id), String(r.empresa_codigo ?? ""));
  }
  if (tipoById.size !== marcaIds.length) {
    throw new Error("Alguna marca seleccionada no existe");
  }
  const tiposSet = new Set(Array.from(tipoById.values()));
  if (tiposSet.size > 1) {
    throw new Error(
      "Joybees no se puede mezclar con otras marcas en el mismo proyecto.",
    );
  }

  // Resolver empresa_pagadora_codigo por marca: override desde input si vino,
  // si no, usa marca.empresa_codigo. Marca interna → null.
  const empresaResueltaById = new Map<string, string | null>();
  for (const m of marcas) {
    const tipo = tipoById.get(m.marcaId);
    if (tipo === "interna") {
      empresaResueltaById.set(m.marcaId, null);
    } else if (m.empresaPagadoraCodigo !== undefined) {
      empresaResueltaById.set(
        m.marcaId,
        m.empresaPagadoraCodigo === null
          ? null
          : String(m.empresaPagadoraCodigo) || null,
      );
    } else {
      empresaResueltaById.set(m.marcaId, empresaById.get(m.marcaId) || null);
    }
  }

  // Listar facturas vigentes del proyecto.
  const { data: factRows, error: factErr } = await supabaseServer
    .from("mk_facturas")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .is("anulado_en", null);
  if (factErr) {
    throw new Error(`actualizarRepartoProyecto[facturas]: ${factErr.message}`);
  }
  const facturaIds = (factRows ?? []).map((r) =>
    String((r as { id: string }).id),
  );

  // 1. Borrar mk_factura_marcas de las facturas vigentes (bulk).
  if (facturaIds.length > 0) {
    const { error: delFmErr } = await supabaseServer
      .from("mk_factura_marcas")
      .delete()
      .in("factura_id", facturaIds);
    if (delFmErr) {
      throw new Error(
        `actualizarRepartoProyecto[delete factura_marcas]: ${delFmErr.message}`,
      );
    }

    // 2. Insertar nuevas filas (factura × marca) con empresa pagadora.
    const fmPayload = facturaIds.flatMap((fid) =>
      marcaIds.map((mid) => ({
        factura_id: fid,
        marca_id: mid,
        porcentaje: tipoById.get(mid) === "interna" ? 100 : 50,
        empresa_pagadora_codigo: empresaResueltaById.get(mid) ?? null,
      })),
    );
    if (fmPayload.length > 0) {
      const { error: insFmErr } = await supabaseServer
        .from("mk_factura_marcas")
        .insert(fmPayload);
      if (insFmErr) {
        throw new Error(
          `actualizarRepartoProyecto[insert factura_marcas]: ${insFmErr.message}`,
        );
      }

      // Este camino cambia la marca de TODAS las facturas vigentes del
      // proyecto de un saque, así que es el mismo caso que `setMarcasDeFactura`
      // pero en bulk: si el reparto nuevo suma un proveedor, esas facturas son
      // gasto suyo desde ahora y hay que sellarlas para él. Los proveedores se
      // resuelven UNA vez (todas las facturas comparten las mismas marcas).
      // Nunca es fatal: `sellarDocumento` no lanza.
      const proveedorKeys = await proveedoresDeMarcaIds(marcaIds);
      if (proveedorKeys.length > 0) {
        for (const facturaId of facturaIds) {
          await sellarDocumento({
            tipo: "factura",
            documentoId: facturaId,
            proveedorKeys,
          });
        }
      }
    }
  }

  // 🩸 El paso 3 (reescribir `mk_proyecto_marcas`) SE RETIRÓ el 22-sep-2026:
  // la marca es del GASTO y esa tabla quedó sin lectores ni escritores.
}

// ----------------------------------------------------------------------------
// 🩸 EL BORRADO DEFINITIVO SE RETIRÓ (22-sep-2026). Daniel: con «Anular» basta.
// ----------------------------------------------------------------------------
// Acá vivían `eliminarProyectoDefinitivo` y `eliminarFacturaDefinitiva`: un
// DELETE de verdad (con CASCADE sobre facturas, marcas y adjuntos) más el
// borrado de los archivos en Storage. Se usaron 12 veces en toda la historia,
// todas por admin, y quedan en `activity_logs` (`delete_definitivo`). Las dos
// rutas (`facturas/[id]` y `proyectos/[id]`, DELETE) contestan 403.
// Anular es soft delete y se restaura; eso es lo que queda.

