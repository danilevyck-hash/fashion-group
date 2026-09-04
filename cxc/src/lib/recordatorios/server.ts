/**
 * RECORDATORIOS — el I/O. Todo lo que decide CUÁNDO toca uno vive en
 * `recordatorio.ts` (puro); acá solo está el viaje a la base.
 *
 * Historia (ago-2026): DEGRADABA SIN LA MIGRACIÓN CORRIDA, igual que
 * `asistencia/correcciones-server.ts`: si el error NOMBRABA la tabla
 * (`esTablaRecordatoriosFaltante`), la lectura devolvía CERO recordatorios con
 * `faltaMigracion: true` y las escrituras `{ ok: false, faltaMigracion: true }`,
 * para que Cheques siguiera funcionando con un aviso en ámbar.
 *
 * Tolerancia retirada el 3-sep-2026: la tabla existe desde
 * 20260824120000_recordatorios.sql (verificado en producción). Hoy CUALQUIER
 * error de la base se propaga —la lectura LANZA, las escrituras devuelven
 * `{ ok: false, error }`—: con la tabla puesta, un "no existe" es un permiso, un
 * timeout o un cambio de esquema, y leerlo como "falta la migración" dejaba la
 * pantalla de cheques normal y vacía mientras los avisos dejaban de sonar.
 * `faltaMigracion` se conserva en la LECTURA (siempre `false`) porque
 * `cheques/page.tsx`, `ChequesClient` y `cheques-alert.ts` lo leen; retirarlo
 * de ahí es cosa de otra tanda. `recordatorio.ts` (puro) conserva el detector.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  TABLA_RECORDATORIOS,
  esRepeticion,
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
  /** Siempre `false` desde el 3-sep-2026 (ver el encabezado). Se conserva
   *  porque la pantalla de cheques y el aviso de Telegram lo leen. */
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
  // Sin `try/catch` (tolerancia a DDL retirada): un error de la lectura LANZA.
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
}

export type Escritura =
  | { ok: true; recordatorio: Recordatorio }
  | { ok: false; error: string };

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
  if (!data) return { ok: false, error: "Ese recordatorio ya no existe." };
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
  if (!data) return { ok: false, error: "Ese recordatorio ya no existe." };
  return { ok: true };
}

function fallo(error: unknown): Escritura {
  const e = error as { message?: string };
  return { ok: false, error: e.message ?? "Error interno" };
}
