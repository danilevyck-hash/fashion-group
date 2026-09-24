/* ─────────────────────────────────────────────────────────────────────────────
 * ENTRADA AUTORIZADA POR DÍA — el I/O. La regla vive en `entrada-autorizada.ts`
 * (puro); aquí solo está el viaje a la base.
 *
 * ⚠️ DEGRADA SIN LA MIGRACIÓN CORRIDA, igual que `correcciones-server.ts`: sin
 * la tabla, CERO autorizaciones, o sea exactamente los mismos números de hoy.
 * Y solo cuando el error NOMBRA la tabla: cualquier otro se propaga.
 *
 * 🔴 NO toca `asistencia_marcaciones` ni `asistencia_correcciones`. Escribe
 * SOLO en su tabla, y una autorización se ANULA, nunca se borra.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "./config";
import { TABLA_ENTRADAS_AUTORIZADAS, type EntradaAutorizada } from "./entrada-autorizada";

const COLS = "id, empleado_codigo, fecha, hora, motivo, creada_por, creada_en";

interface Fila {
  id: string;
  empleado_codigo: string;
  fecha: string;
  hora: string | null;
  motivo: string;
  creada_por: string;
  creada_en: string;
}

function aEntrada(f: Fila): EntradaAutorizada {
  return {
    id: String(f.id),
    empleadoCodigo: String(f.empleado_codigo ?? "").trim(),
    fecha: String(f.fecha).slice(0, 10),
    // Postgres devuelve `time` como "06:00:00"; se corta a los segundos.
    hora: String(f.hora ?? "").slice(0, 8),
    motivo: String(f.motivo ?? ""),
    creadaPor: String(f.creada_por ?? ""),
    creadaEn: String(f.creada_en ?? ""),
  };
}

export interface EntradasLeidas {
  entradas: EntradaAutorizada[];
  /** `true` = la tabla todavía no existe. Se calcula SIN autorizaciones. */
  faltaMigracion: boolean;
}

/** `leerTodoPaginado` envuelve el error con su etiqueta y pierde el `code`;
 *  se le quita la etiqueta para que el nombre de la tabla venga de PostgREST. */
function errorDeLectura(e: unknown): { message: string } {
  const crudo = e instanceof Error ? e.message : String(e);
  return { message: crudo.replace(`${TABLA_ENTRADAS_AUTORIZADAS} (rango): `, "") };
}

/** Las entradas autorizadas VIVAS de un rango de días. Paginado y verificado. */
export async function leerEntradasAutorizadas(desde: string, hasta: string): Promise<EntradasLeidas> {
  try {
    const filas = await leerTodoPaginado<Fila>(
      `${TABLA_ENTRADAS_AUTORIZADAS} (rango)`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(TABLA_ENTRADAS_AUTORIZADAS)
          .select(COLS, pedirCount ? { count: "exact" } : {})
          .is("anulada_en", null)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );
    return { entradas: filas.map(aEntrada), faltaMigracion: false };
  } catch (e) {
    if (esTablaFaltante(errorDeLectura(e), TABLA_ENTRADAS_AUTORIZADAS)) {
      return { entradas: [], faltaMigracion: true };
    }
    throw e;
  }
}

/** La autorización VIVA de una persona en un día, o `null`. */
export async function leerEntradaVivaDelDia(
  codigo: string,
  fecha: string,
): Promise<{ entrada: EntradaAutorizada | null; faltaMigracion: boolean }> {
  const { data, error } = await supabaseServer
    .from(TABLA_ENTRADAS_AUTORIZADAS)
    .select(COLS)
    .eq("empleado_codigo", codigo)
    .eq("fecha", fecha)
    .is("anulada_en", null)
    .maybeSingle();
  if (error) {
    if (esTablaFaltante(error, TABLA_ENTRADAS_AUTORIZADAS)) return { entrada: null, faltaMigracion: true };
    throw new Error(error.message);
  }
  return { entrada: data ? aEntrada(data as unknown as Fila) : null, faltaMigracion: false };
}

export type ResultadoEntrada =
  | { ok: true; id: string }
  | { ok: false; faltaMigracion: true }
  | { ok: false; faltaMigracion: false; error: string };

/** Guardar una entrada autorizada. Un INSERT y nada más. */
export async function crearEntradaAutorizada(e: {
  empleadoCodigo: string;
  fecha: string;
  hora: string;
  motivo: string;
  creadaPor: string;
}): Promise<ResultadoEntrada> {
  const { data, error } = await supabaseServer
    .from(TABLA_ENTRADAS_AUTORIZADAS)
    .insert({
      empleado_codigo: e.empleadoCodigo,
      fecha: e.fecha,
      hora: e.hora,
      motivo: e.motivo,
      creada_por: e.creadaPor,
    })
    .select("id")
    .single();
  if (error) {
    if (esTablaFaltante(error, TABLA_ENTRADAS_AUTORIZADAS)) return { ok: false, faltaMigracion: true };
    // 23505 = el único parcial: ya hay una viva ese día.
    if (String(error.code) === "23505") {
      return { ok: false, faltaMigracion: false, error: "Ese día ya tiene una entrada autorizada. Quítala antes de poner otra." };
    }
    return { ok: false, faltaMigracion: false, error: error.message };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/** Deshacer: se ANULA con firma; la fila queda. */
export async function anularEntradaAutorizada(id: string, quien: string): Promise<ResultadoEntrada> {
  const { data, error } = await supabaseServer
    .from(TABLA_ENTRADAS_AUTORIZADAS)
    .update({ anulada_en: new Date().toISOString(), anulada_por: quien })
    .eq("id", id)
    .is("anulada_en", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (esTablaFaltante(error, TABLA_ENTRADAS_AUTORIZADAS)) return { ok: false, faltaMigracion: true };
    return { ok: false, faltaMigracion: false, error: error.message };
  }
  if (!data) return { ok: false, faltaMigracion: false, error: "Esa entrada autorizada ya se había quitado." };
  return { ok: true, id: String((data as { id: string }).id) };
}

/** El código de la persona de una autorización, para el recorte por alcance. */
export async function codigoDeEntradaAutorizada(id: string): Promise<string[]> {
  const { data } = await supabaseServer
    .from(TABLA_ENTRADAS_AUTORIZADAS)
    .select("empleado_codigo")
    .eq("id", id)
    .maybeSingle();
  const codigo = (data as { empleado_codigo?: string | null } | null)?.empleado_codigo;
  return codigo ? [String(codigo)] : [];
}
