// ============================================================================
// Marketing — el lado de ESCRITURA de los períodos por proveedor.
//
// 🔴 UN DOCUMENTO SE SELLA CON EL PERÍODO QUE SU PROVEEDOR TENÍA ABIERTO
// CUANDO SE REGISTRÓ, **no** con la fecha del documento.
//
// Por qué, y esto ya está decidido: un período cerrado ya se le reportó al
// proveedor, y ese reporte se guardó tal como salió. Meterle una factura
// después haría que el papel que el proveedor tiene en la mano deje de
// coincidir con lo que dice el sistema — y el que queda mal no es el sistema,
// es quien mandó el reporte. Una factura vieja que llega tarde entra en el
// período ABIERTO y se reporta en el próximo corte. Nada se pierde: se
// reporta después, no se pierde nunca.
//
// 🔴 DEGRADACIÓN OBLIGATORIA. `mk_periodos` / `mk_periodo_documentos` las crea
// la migración 20260811160000, que Daniel corre A MANO. Mientras no existan,
// TODO lo de acá es un no-op silencioso: **sellar no puede hacer fallar el
// guardado de una factura ni de una entrega**. Hasta que la DDL corra, la app
// funciona exactamente igual que hoy (el inicio cae al fallback `grupo_legacy`).
//
// 🩸 SELLAR NUNCA ES FATAL, ni siquiera con las tablas ya creadas. Si el sello
// falla se loguea con `console.error` y el documento se guarda igual. Un sello
// que falta se ve como "gasto del período actual", que es el default correcto;
// que no se pueda cargar una factura porque la tabla de períodos tuvo un
// hipo sería muchísimo peor.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { SIN_PROVEEDOR, proveedorDeCodigo, type BloqueKey } from "./proveedores";

/** Los dos tipos de documento que se sellan. Igual que el CHECK de la tabla. */
export type TipoDocumentoPeriodo = "factura" | "entrega";

/** Fila de `mk_periodos` tal como la devuelve PostgREST. */
export interface PeriodoFila {
  id: string;
  proveedor_key: string;
  nombre: string;
  estado: string;
  abierto_en?: string | null;
  cerrado_en?: string | null;
  cerrado_por?: string | null;
  reporte?: unknown;
}

/**
 * Códigos de PostgREST/Postgres para "esa tabla no existe todavía".
 *
 * Fuente ÚNICA — la usa este módulo y también `/api/marketing/inicio`. Dos
 * copias del mismo criterio es una que se corrige y otra que empieza a tratar
 * un error de verdad como "la migración no corrió".
 */
export function esTablaAusente(
  err: { code?: string | null; message?: string } | null,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  const msg = String(err.message ?? "");
  return /does not exist|no existe/i.test(msg) && /mk_periodo/i.test(msg);
}

/**
 * Igual que `esTablaAusente` pero para un `unknown` (lo que llega en un catch).
 *
 * ⚠️ El `code` viaja pegado al Error a propósito: PostgREST devuelve PGRST205
 * con el mensaje "Could not find the table … in the schema cache", que NO dice
 * "does not exist". Reconocerlo solo por el texto dejaría a la app tratando
 * "falta la migración" como un error de verdad — un 500 en vez de un aviso.
 */
export function esFaltaDeTablas(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return esTablaAusente(err as { code?: string; message?: string });
}

/** Error de Supabase conservando el `code`, para poder reconocerlo arriba. */
function comoError(err: { code?: string | null; message?: string } | null, donde: string): Error {
  const e = new Error(err?.message ?? `${donde}: sin datos`);
  if (err?.code) (e as Error & { code?: string }).code = String(err.code);
  return e;
}

/** Loguea sin tumbar nada. Nunca lanza. */
function avisar(donde: string, detalle: unknown): void {
  const msg = detalle instanceof Error ? detalle.message : String(detalle);
  console.error(`[marketing/periodos] ${donde}: ${msg}`);
}

// ----------------------------------------------------------------------------
// Lectura
// ----------------------------------------------------------------------------

/**
 * El período ABIERTO de un proveedor, o `null`.
 *
 * `null` significa las tres cosas que se tratan igual: no existe la tabla, no
 * hay período abierto para ese proveedor, o no se pudo leer. En los tres casos
 * el que llama no tiene a dónde sellar y sigue de largo.
 */
export async function periodoAbiertoDe(
  proveedorKey: string,
): Promise<PeriodoFila | null> {
  const key = String(proveedorKey ?? "").trim();
  if (!key || key === SIN_PROVEEDOR) return null;
  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por")
      .eq("proveedor_key", key)
      .eq("estado", "abierto")
      .maybeSingle();
    if (error) {
      if (!esTablaAusente(error)) avisar("periodoAbiertoDe", error.message);
      return null;
    }
    return (data as PeriodoFila | null) ?? null;
  } catch (err) {
    if (!esFaltaDeTablas(err)) avisar("periodoAbiertoDe", err);
    return null;
  }
}

/**
 * `marca_id → proveedor` para un puñado de marcas.
 *
 * El mapa va por CÓDIGO (`mk_marcas.codigo`), que es la regla de
 * `proveedores.ts` — nunca por nombre, que sí se edita.
 */
export async function proveedorPorMarcaId(
  marcaIds: ReadonlyArray<string>,
): Promise<Map<string, BloqueKey>> {
  const out = new Map<string, BloqueKey>();
  const ids = Array.from(new Set(marcaIds.map((m) => String(m ?? "")).filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabaseServer
      .from("mk_marcas")
      .select("id, codigo")
      .in("id", ids);
    if (error) {
      avisar("proveedorPorMarcaId", error.message);
      return out;
    }
    for (const r of (data ?? []) as Array<{ id: string; codigo: string | null }>) {
      out.set(String(r.id), proveedorDeCodigo(r.codigo));
    }
    return out;
  } catch (err) {
    avisar("proveedorPorMarcaId", err);
    return out;
  }
}

/**
 * Proveedores (claves únicas) a los que le pertenecen estas marcas.
 *
 * 🩸 `SIN_PROVEEDOR` se descarta: una marca sin proveedor decidido no tiene
 * período al que sellar, y meterla en uno cualquiera mandaría plata en un
 * reporte a un proveedor que no la pidió.
 */
export async function proveedoresDeMarcaIds(
  marcaIds: ReadonlyArray<string>,
): Promise<string[]> {
  const mapa = await proveedorPorMarcaId(marcaIds);
  const keys = new Set<string>();
  for (const k of mapa.values()) {
    if (k && k !== SIN_PROVEEDOR) keys.add(String(k));
  }
  return Array.from(keys);
}

// ----------------------------------------------------------------------------
// Sellado
// ----------------------------------------------------------------------------

export interface SellarDocumentoInput {
  tipo: TipoDocumentoPeriodo;
  documentoId: string;
  /** Claves de proveedor. Se ignoran las vacías y `sin_proveedor`. */
  proveedorKeys: ReadonlyArray<string>;
}

/**
 * Ata un documento al período ABIERTO de cada uno de sus proveedores.
 *
 * Un sello por proveedor: si una factura es de Tommy (PVH) y de Reebok, se
 * escriben DOS filas, porque PVH y Reebok se cierran en momentos distintos.
 *
 * Idempotente por construcción: `ON CONFLICT DO NOTHING` sobre
 * (tipo, documento_id, proveedor_key). Volver a sellar un documento ya sellado
 * NO lo mueve de período — que es justo lo que protege a un período cerrado de
 * que alguien le meta un documento después de haberlo reportado.
 *
 * NUNCA lanza.
 */
export async function sellarDocumento(input: SellarDocumentoInput): Promise<void> {
  try {
    const documentoId = String(input.documentoId ?? "").trim();
    if (!documentoId) return;
    const keys = Array.from(
      new Set(
        (input.proveedorKeys ?? [])
          .map((k) => String(k ?? "").trim())
          .filter((k) => k.length > 0 && k !== SIN_PROVEEDOR),
      ),
    );
    if (keys.length === 0) return;

    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key")
      .eq("estado", "abierto")
      .in("proveedor_key", keys);
    if (error) {
      if (!esTablaAusente(error)) avisar("sellarDocumento[periodos]", error.message);
      return;
    }

    const filas = ((data ?? []) as Array<{ id: string; proveedor_key: string }>).map(
      (p) => ({
        periodo_id: String(p.id),
        proveedor_key: String(p.proveedor_key),
        tipo: input.tipo,
        documento_id: documentoId,
      }),
    );
    if (filas.length === 0) return;

    const { error: upErr } = await supabaseServer
      .from("mk_periodo_documentos")
      .upsert(filas, {
        onConflict: "tipo,documento_id,proveedor_key",
        ignoreDuplicates: true,
      });
    if (upErr && !esTablaAusente(upErr)) {
      avisar("sellarDocumento[upsert]", upErr.message);
    }
  } catch (err) {
    // Ni siquiera un error inesperado puede tumbar el guardado del documento.
    if (!esFaltaDeTablas(err)) avisar("sellarDocumento", err);
  }
}

/**
 * Atajo para los dos caminos que saben las MARCAS de un documento y no sus
 * proveedores. Nunca lanza.
 */
export async function sellarDocumentoPorMarcas(
  tipo: TipoDocumentoPeriodo,
  documentoId: string,
  marcaIds: ReadonlyArray<string>,
): Promise<void> {
  try {
    if (!documentoId || marcaIds.length === 0) return;
    const proveedorKeys = await proveedoresDeMarcaIds(marcaIds);
    if (proveedorKeys.length === 0) return;
    await sellarDocumento({ tipo, documentoId, proveedorKeys });
  } catch (err) {
    avisar("sellarDocumentoPorMarcas", err);
  }
}

// ----------------------------------------------------------------------------
// Escritura de períodos (renombrar / cerrar / abrir)
//
// A diferencia del sellado, ACÁ los errores SÍ se propagan: son acciones que
// Daniel pidió a mano y tiene que enterarse si no salieron.
// ----------------------------------------------------------------------------

export async function getPeriodo(id: string): Promise<PeriodoFila | null> {
  const { data, error } = await supabaseServer
    .from("mk_periodos")
    .select("id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por")
    .eq("id", id)
    .maybeSingle();
  if (error) throw comoError(error, "getPeriodo");
  return (data as PeriodoFila | null) ?? null;
}

export async function renombrarPeriodo(id: string, nombre: string): Promise<PeriodoFila> {
  const { data, error } = await supabaseServer
    .from("mk_periodos")
    .update({ nombre })
    .eq("id", id)
    .select("id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por")
    .single();
  if (error || !data) throw comoError(error, "renombrarPeriodo");
  return data as PeriodoFila;
}

/** Cuántos períodos ABIERTOS tiene un proveedor. La invariante es: uno. */
export async function contarAbiertos(proveedorKey: string): Promise<number> {
  const { data, error } = await supabaseServer
    .from("mk_periodos")
    .select("id")
    .eq("proveedor_key", proveedorKey)
    .eq("estado", "abierto");
  if (error) throw comoError(error, "contarAbiertos");
  return (data ?? []).length;
}

/**
 * Marca un período como CERRADO y le guarda su reporte.
 *
 * No abre el siguiente: eso lo hace `abrirPeriodo`, y el orden importa (el
 * índice único deja UN solo abierto por proveedor, así que hay que cerrar
 * antes de abrir).
 */
export async function cerrarPeriodo(
  id: string,
  reporte: unknown,
  cerradoPor: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from("mk_periodos")
    .update({
      estado: "cerrado",
      cerrado_en: new Date().toISOString(),
      cerrado_por: cerradoPor,
      reporte,
    })
    .eq("id", id)
    .eq("estado", "abierto");
  if (error) throw comoError(error, "cerrarPeriodo");
}

/** Deshace `cerrarPeriodo`. Solo se usa si abrir el siguiente falló. */
export async function reabrirPeriodo(id: string): Promise<void> {
  const { error } = await supabaseServer
    .from("mk_periodos")
    .update({ estado: "abierto", cerrado_en: null, cerrado_por: null, reporte: null })
    .eq("id", id);
  if (error) throw comoError(error, "reabrirPeriodo");
}

export async function abrirPeriodo(
  proveedorKey: string,
  nombre: string,
): Promise<PeriodoFila> {
  const { data, error } = await supabaseServer
    .from("mk_periodos")
    .insert({ proveedor_key: proveedorKey, nombre, estado: "abierto" })
    .select("id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por")
    .single();
  if (error || !data) throw comoError(error, "abrirPeriodo");
  return data as PeriodoFila;
}
