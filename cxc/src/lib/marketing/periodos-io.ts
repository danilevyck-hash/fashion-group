// ============================================================================
// Marketing — el lado de ESCRITURA de los períodos por MARCA.
//
// 🔴 UN DOCUMENTO SE SELLA CON EL PERÍODO QUE SU MARCA TENÍA ABIERTO CUANDO SE
// REGISTRÓ, **no** con la fecha del documento.
//
// Por qué, y esto ya está decidido: un período cerrado ya se le reportó a la
// marca, y ese reporte se guardó tal como salió. Meterle una factura después
// haría que el papel que el encargado tiene en la mano deje de coincidir con
// lo que dice el sistema — y el que queda mal no es el sistema, es quien mandó
// el reporte. Una factura vieja que llega tarde entra en el período ABIERTO y
// se reporta en el próximo corte. Nada se pierde: se reporta después.
//
// 🔴 DEGRADACIÓN OBLIGATORIA, Y ACÁ TIENE DOS CAPAS.
//
//  1. Sin las TABLAS (`mk_periodos` / `mk_periodo_documentos`), todo esto es un
//     no-op silencioso: **sellar no puede hacer fallar el guardado de una
//     factura ni de una entrega**.
//  2. Con las tablas pero SIN la migración por marca (20260811180000, que
//     Daniel corre A MANO), los períodos abiertos que existen son los VIEJOS
//     por proveedor ('pvh', 'reebok', 'joybees'). Por eso el período de una
//     marca se busca con `clavesDeSello()`: primero su código, después la clave
//     vieja — y **se sella con la clave que efectivamente se encontró**. Así,
//     antes de la migración, Tommy y Calvin siguen cayendo en el mismo sello
//     'pvh' que hoy (comportamiento idéntico), y después de la migración cada
//     una cae en el suyo sin que nadie tenga que acordarse de apagar nada.
//
// 🩸 SELLAR NUNCA ES FATAL, ni siquiera con las tablas ya creadas. Si el sello
// falla se loguea con `console.error` y el documento se guarda igual. Un sello
// que falta se ve como "gasto del período actual", que es el default correcto;
// que no se pueda cargar una factura porque la tabla de períodos tuvo un
// hipo sería muchísimo peor.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import {
  SIN_BLOQUE,
  bloqueDeCodigo,
  clavesDeSello,
  esMarcaCodigo,
  type BloqueKey,
} from "./bloques";

/**
 * Claves con las que buscar el período de un bloque, en orden de prioridad.
 *
 * Para una marca: su código y después la clave vieja por proveedor. Para
 * cualquier otra cosa (una clave vieja pasada a mano, como en el cierre de un
 * período heredado): esa misma clave y nada más — nunca se inventa una.
 */
function clavesDeBusqueda(key: string): string[] {
  const k = String(key ?? "").trim();
  if (!k || k === SIN_BLOQUE) return [];
  const claves = clavesDeSello(k);
  return claves.length > 0 ? claves : [k];
}

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
 * El período ABIERTO de una marca, o `null`.
 *
 * Busca por el código de marca y, si no hay, por la clave vieja del proveedor
 * (ver la degradación del encabezado).
 *
 * `null` significa las tres cosas que se tratan igual: no existe la tabla, no
 * hay período abierto para esa marca, o no se pudo leer. En los tres casos el
 * que llama no tiene a dónde sellar y sigue de largo.
 */
export async function periodoAbiertoDe(
  marcaKey: string,
): Promise<PeriodoFila | null> {
  const claves = clavesDeBusqueda(marcaKey);
  if (claves.length === 0) return null;
  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por")
      .eq("estado", "abierto")
      .in("proveedor_key", claves);
    if (error) {
      if (!esTablaAusente(error)) avisar("periodoAbiertoDe", error.message);
      return null;
    }
    const filas = (data ?? []) as PeriodoFila[];
    // El ORDEN manda, no el que devuelva PostgREST primero: el código de marca
    // le gana a la clave vieja. Después de la migración pueden convivir las dos.
    for (const clave of claves) {
      const p = filas.find((f) => String(f.proveedor_key) === clave);
      if (p) return p;
    }
    return null;
  } catch (err) {
    if (!esFaltaDeTablas(err)) avisar("periodoAbiertoDe", err);
    return null;
  }
}

/**
 * `marca_id → bloque` para un puñado de marcas.
 *
 * El mapa va por CÓDIGO (`mk_marcas.codigo`), que es la regla de `bloques.ts`
 * — nunca por nombre, que sí se edita.
 */
export async function bloquePorMarcaId(
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
      avisar("bloquePorMarcaId", error.message);
      return out;
    }
    for (const r of (data ?? []) as Array<{ id: string; codigo: string | null }>) {
      out.set(String(r.id), bloqueDeCodigo(r.codigo));
    }
    return out;
  } catch (err) {
    avisar("bloquePorMarcaId", err);
    return out;
  }
}

/**
 * Marcas (códigos únicos) a las que le pertenecen estos `marca_id`.
 *
 * 🩸 `SIN_BLOQUE` se descarta: una marca sin bloque no tiene período al que
 * sellar, y meterla en uno cualquiera mandaría plata en un reporte a una
 * empresa que no la pidió.
 */
export async function marcasDeMarcaIds(
  marcaIds: ReadonlyArray<string>,
): Promise<string[]> {
  const mapa = await bloquePorMarcaId(marcaIds);
  const keys = new Set<string>();
  for (const k of mapa.values()) {
    if (k && esMarcaCodigo(k)) keys.add(String(k));
  }
  return Array.from(keys);
}

/**
 * Nombre viejo de `marcasDeMarcaIds`, para los llamadores que todavía dicen
 * "proveedor". Devuelve códigos de MARCA — el sellado los traduce solo.
 */
export const proveedoresDeMarcaIds = marcasDeMarcaIds;

// ----------------------------------------------------------------------------
// Sellado
// ----------------------------------------------------------------------------

export interface SellarDocumentoInput {
  tipo: TipoDocumentoPeriodo;
  documentoId: string;
  /** Códigos de marca. Se ignoran los vacíos y `sin_bloque`. */
  marcaKeys?: ReadonlyArray<string>;
  /** Nombre viejo de `marcaKeys`. Acepta códigos de marca o claves viejas. */
  proveedorKeys?: ReadonlyArray<string>;
}

/**
 * Ata un documento al período ABIERTO de cada una de sus marcas.
 *
 * Un sello por MARCA: si una factura es de Tommy y de Reebok, se escriben DOS
 * filas, porque cada marca se cierra por su cuenta.
 *
 * 🔴 Con la migración por marca SIN correr, Tommy y Calvin resuelven las dos a
 * la clave vieja 'pvh' y el sello queda UNO solo — exactamente como hoy. Se
 * guarda la clave que se ENCONTRÓ, no la que se pidió: escribir 'TH' apuntando
 * al período de 'pvh' dejaría un sello que `clavesDeSello` sí leería, pero que
 * describe algo que no ocurrió.
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
        (input.marcaKeys ?? input.proveedorKeys ?? [])
          .map((k) => String(k ?? "").trim())
          .filter((k) => k.length > 0 && k !== SIN_BLOQUE),
      ),
    );
    if (keys.length === 0) return;

    // Todas las claves posibles de todas las marcas, en UNA consulta.
    const claves = Array.from(
      new Set(keys.flatMap((k) => clavesDeBusqueda(k))),
    );
    if (claves.length === 0) return;

    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key")
      .eq("estado", "abierto")
      .in("proveedor_key", claves);
    if (error) {
      if (!esTablaAusente(error)) avisar("sellarDocumento[periodos]", error.message);
      return;
    }

    const abiertoPorClave = new Map(
      ((data ?? []) as Array<{ id: string; proveedor_key: string }>).map((p) => [
        String(p.proveedor_key),
        String(p.id),
      ]),
    );

    // Una fila por clave ENCONTRADA. El `Map` dedupe: pre-migración, TH y CK
    // caen las dos en 'pvh' y eso es UN solo sello, igual que hoy.
    const porClave = new Map<string, string>();
    for (const k of keys) {
      for (const clave of clavesDeBusqueda(k)) {
        const periodoId = abiertoPorClave.get(clave);
        if (periodoId) {
          porClave.set(clave, periodoId);
          break;
        }
      }
    }

    const filas = Array.from(porClave, ([proveedor_key, periodo_id]) => ({
      periodo_id,
      proveedor_key,
      tipo: input.tipo,
      documento_id: documentoId,
    }));
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
 * Atajo para los caminos que tienen los `marca_id` de un documento y no sus
 * códigos. Nunca lanza.
 */
export async function sellarDocumentoPorMarcas(
  tipo: TipoDocumentoPeriodo,
  documentoId: string,
  marcaIds: ReadonlyArray<string>,
): Promise<void> {
  try {
    if (!documentoId || marcaIds.length === 0) return;
    const marcaKeys = await marcasDeMarcaIds(marcaIds);
    if (marcaKeys.length === 0) return;
    await sellarDocumento({ tipo, documentoId, marcaKeys });
  } catch (err) {
    avisar("sellarDocumentoPorMarcas", err);
  }
}

/**
 * Borra los sellos de UN documento — para cuando el documento se borra DE
 * VERDAD (hard delete, como `deleteEntrega`). Un sello que apunta a un
 * documento inexistente no mueve plata (el agregador no encuentra el doc),
 * pero es basura que ya produjo un huérfano real en producción (12-ago-2026:
 * la entrega de prueba fb4e8342 se borró y su sello KL quedó apuntando a
 * nada).
 *
 * 🩸 NUNCA lanza, igual que sellar: el documento ya se borró y el stock ya se
 * devolvió — un tropiezo acá no puede deshacer eso ni dejar la operación a
 * medias. Sin la DDL de períodos, no-op limpio.
 *
 * ⚠️ NO usar para anulaciones (soft delete de facturas): ahí el documento
 * sigue existiendo y su sello dice a qué período se reportó.
 */
export async function borrarSellosDeDocumento(
  tipo: TipoDocumentoPeriodo,
  documentoId: string,
): Promise<void> {
  try {
    if (!documentoId) return;
    const { error } = await supabaseServer
      .from("mk_periodo_documentos")
      .delete()
      .eq("tipo", tipo)
      .eq("documento_id", documentoId);
    if (error && !esTablaAusente(error)) {
      avisar("borrarSellosDeDocumento", error.message);
    }
  } catch (err) {
    if (!esFaltaDeTablas(err)) avisar("borrarSellosDeDocumento", err);
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
