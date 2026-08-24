/**
 * RECORDATORIOS — el I/O. Todo lo que decide CUÁNDO toca uno vive en
 * `recordatorio.ts` (puro); acá solo está el viaje a la base.
 *
 * ⚠️ **DEGRADA SIN LA MIGRACIÓN CORRIDA**, igual que `asistencia/correcciones-
 * server.ts`: en este proyecto los DDL los corre Daniel a mano y varios se
 * quedaron pendientes semanas. Si la pantalla se cayera hasta que alguien corra
 * el SQL, el síntoma sería «Cheques está roto» — y encima sobre una pantalla que
 * hoy funciona perfectamente sin esta tabla. Sin la tabla: CERO recordatorios,
 * o sea la pantalla de cheques de siempre, con un aviso en ÁMBAR (no rojo: rojo
 * se lee como que algo se rompió) diciendo qué archivo falta.
 *
 * 🔴 Y la degradación solo ocurre cuando el error NOMBRA la tabla. Ver
 * `esTablaRecordatoriosFaltante`.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  TABLA_RECORDATORIOS,
  esRepeticion,
  esTablaRecordatoriosFaltante,
  type Recordatorio,
  type RecordatorioNuevo,
} from "./recordatorio";

/** Una sola lista de columnas, para que las dos lecturas no se separen. */
const COLS = "id, fecha, texto, cliente, cliente_codigo, repeticion, creado_por, created_at";

interface Fila {
  id: string;
  fecha: string;
  texto: string;
  cliente: string | null;
  cliente_codigo: string | null;
  repeticion: string;
  creado_por: string | null;
  created_at: string | null;
}

function aRecordatorio(f: Fila): Recordatorio {
  return {
    id: String(f.id),
    fecha: String(f.fecha).slice(0, 10),
    texto: String(f.texto ?? ""),
    cliente: String(f.cliente ?? ""),
    // "" en la base y NULL son el MISMO estado ("sin vincular"), y acá se
    // normaliza a null: un "" haría que `cliente_codigo IS NOT NULL` contara
    // recordatorios que no están atados a nadie.
    clienteCodigo: f.cliente_codigo ? String(f.cliente_codigo) : null,
    repeticion: esRepeticion(f.repeticion) ? f.repeticion : "una_vez",
    creadoPor: String(f.creado_por ?? ""),
    createdAt: String(f.created_at ?? ""),
  };
}

export interface RecordatoriosLeidos {
  recordatorios: Recordatorio[];
  /** `true` = la tabla todavía no existe. Se sigue con CERO recordatorios. */
  faltaMigracion: boolean;
}

/**
 * TODOS los recordatorios vivos.
 *
 * No se filtra por fecha a propósito: uno **mensual** puesto en enero tiene que
 * poder sonar en agosto, y uno de una sola vez que ya pasó se sigue mostrando en
 * su día del calendario. Filtrar por fecha los volvería invisibles.
 *
 * ⚠️ Paginado y verificado contra el COUNT: `db-max-rows` = 1000 corta EN
 * SILENCIO, y acá un truncado se vería como «ese recordatorio no existe» —
 * o sea, un aviso que deja de sonar sin un solo error.
 */
export async function leerRecordatorios(): Promise<RecordatoriosLeidos> {
  try {
    const filas = await leerTodoPaginado<Fila>(
      `${TABLA_RECORDATORIOS} (todos)`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(TABLA_RECORDATORIOS)
          .select(COLS, pedirCount ? { count: "exact" } : {})
          .eq("deleted", false)
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );
    return { recordatorios: filas.map(aRecordatorio), faltaMigracion: false };
  } catch (e) {
    if (esTablaRecordatoriosFaltante(errorDeLectura(e))) {
      return { recordatorios: [], faltaMigracion: true };
    }
    throw e;
  }
}

/**
 * 🩸 `leerTodoPaginado` envuelve el error de PostgREST en un `Error` con su
 * etiqueta delante y pierde el `code`. **Se le quita la etiqueta PRIMERO**, y no
 * es cosmético: la etiqueta lleva el nombre de la tabla adentro, así que dejarla
 * haría que CUALQUIER error de esta lectura —una caída de red, un timeout—
 * pasara el «¿nombra la tabla?» y quedara a un paso de leerse como «falta la
 * migración». Quitándola, el nombre tiene que venir del mensaje de PostgREST,
 * que es quien sabe la verdad.
 */
function errorDeLectura(e: unknown): { message: string } {
  const crudo = e instanceof Error ? e.message : String(e);
  return { message: crudo.replace(`${TABLA_RECORDATORIOS} (todos): `, "") };
}

export type Escritura =
  | { ok: true; recordatorio: Recordatorio }
  | { ok: false; faltaMigracion: true }
  | { ok: false; faltaMigracion: false; error: string };

export async function crearRecordatorio(
  nuevo: RecordatorioNuevo,
  quien: string,
): Promise<Escritura> {
  const { data, error } = await supabaseServer
    .from(TABLA_RECORDATORIOS)
    .insert({
      fecha: nuevo.fecha,
      texto: nuevo.texto,
      cliente: nuevo.cliente || null,
      cliente_codigo: nuevo.clienteCodigo,
      repeticion: nuevo.repeticion,
      creado_por: quien || null,
    })
    .select(COLS)
    .single();
  if (error) return fallo(error);
  return { ok: true, recordatorio: aRecordatorio(data as unknown as Fila) };
}

export async function actualizarRecordatorio(
  id: string,
  nuevo: RecordatorioNuevo,
): Promise<Escritura> {
  const { data, error } = await supabaseServer
    .from(TABLA_RECORDATORIOS)
    .update({
      fecha: nuevo.fecha,
      texto: nuevo.texto,
      cliente: nuevo.cliente || null,
      cliente_codigo: nuevo.clienteCodigo,
      repeticion: nuevo.repeticion,
    })
    .eq("id", id)
    .eq("deleted", false)
    .select(COLS)
    .maybeSingle();
  if (error) return fallo(error);
  if (!data) return { ok: false, faltaMigracion: false, error: "Ese recordatorio ya no existe." };
  return { ok: true, recordatorio: aRecordatorio(data as unknown as Fila) };
}

/**
 * Borrar es SOFT DELETE (`deleted = true`), como el resto del módulo — y como
 * los cheques, los reclamos, las guías y la caja. La fila queda.
 */
export async function borrarRecordatorio(id: string): Promise<Escritura | { ok: true }> {
  const { data, error } = await supabaseServer
    .from(TABLA_RECORDATORIOS)
    .update({ deleted: true })
    .eq("id", id)
    .eq("deleted", false)
    .select("id")
    .maybeSingle();
  if (error) return fallo(error);
  if (!data) return { ok: false, faltaMigracion: false, error: "Ese recordatorio ya no existe." };
  return { ok: true };
}

function fallo(error: unknown): Escritura {
  if (esTablaRecordatoriosFaltante(error)) return { ok: false, faltaMigracion: true };
  const e = error as { message?: string };
  return { ok: false, faltaMigracion: false, error: e.message ?? "Error interno" };
}
