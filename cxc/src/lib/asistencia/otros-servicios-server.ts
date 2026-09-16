/* ─────────────────────────────────────────────────────────────────────────────
 * «OTROS SERVICIOS» — el I/O. La regla vive en `otros-servicios.ts`, que es puro.
 *
 * 🔴 TOLERANTE A QUE LA MIGRACIÓN NO ESTÉ CORRIDA. En este proyecto los DDL los
 * corre Daniel a mano y varios esperaron semanas. Si la planilla se cayera con
 * 500 porque falta `asistencia_otros_servicios`, el síntoma sería «la planilla
 * está rota» — y nadie deduce de un 500 que falta un `CREATE TABLE`. Por eso:
 * sin la tabla se devuelve VACÍO con `faltaTabla: true`, la ficha lo dice con el
 * nombre del archivo, y la casilla del cuadro se sigue escribiendo a mano
 * exactamente como hoy.
 *
 * ⚠️ Y SOLO cuando el error NOMBRA esta tabla (`esTablaFaltante`): tragarse
 * cualquier error convertiría un permiso denegado o un timeout en «todavía no
 * está instalado», que es como se paga mal en silencio.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "./config";
import type { OtroServicio } from "./otros-servicios";

export const TABLA_OTROS_SERVICIOS = "asistencia_otros_servicios";

interface FilaOtroServicio {
  id: string;
  empleado_codigo: string;
  quincena: string;
  fecha: string;
  monto: number | string;
  concepto: string;
  anotado_por: string;
}

function aRenglon(f: FilaOtroServicio): OtroServicio {
  return {
    id: String(f.id),
    codigo: String(f.empleado_codigo ?? "").trim(),
    quincena: String(f.quincena ?? ""),
    fecha: String(f.fecha ?? "").slice(0, 10),
    monto: Number(f.monto) || 0,
    concepto: String(f.concepto ?? ""),
    anotadoPor: String(f.anotado_por ?? ""),
  };
}

export interface LecturaOtrosServicios {
  renglones: OtroServicio[];
  /** `true` = falta correr la migración. La pantalla lo dice; nada se rompe. */
  faltaTabla: boolean;
}

/**
 * Los renglones VIVOS de una quincena. `codigo` acota a una persona (la ficha);
 * sin él vienen todos los de la quincena (la planilla, en UNA sola lectura).
 *
 * 🔑 `leerTodoPaginado`: `db-max-rows` es 1000 y corta EN SILENCIO. Hoy son
 * pocas filas, pero una lectura que «parece completa» es exactamente la trampa
 * transversal de esta casa.
 */
export async function leerOtrosServicios(opts: {
  quincena: string;
  codigo?: string;
}): Promise<LecturaOtrosServicios> {
  const quincena = String(opts.quincena ?? "").trim();
  if (!quincena) return { renglones: [], faltaTabla: false };
  try {
    const filas = await leerTodoPaginado<FilaOtroServicio>(
      TABLA_OTROS_SERVICIOS,
      (pedirCount, desde, hasta) => {
        let q = supabaseServer
          .from(TABLA_OTROS_SERVICIOS)
          .select(
            "id, empleado_codigo, quincena, fecha, monto, concepto, anotado_por",
            pedirCount ? { count: "exact" } : undefined,
          )
          .eq("quincena", quincena)
          .eq("deleted", false)
          .order("creado_en", { ascending: true })
          // 🔑 Desempate estable: dos renglones del mismo instante no pueden
          // salir en un orden distinto en dos lecturas.
          .order("id", { ascending: true })
          .range(desde, hasta);
        if (opts.codigo) q = q.eq("empleado_codigo", String(opts.codigo).trim());
        return q;
      },
    );
    return { renglones: filas.map(aRenglon), faltaTabla: false };
  } catch (e) {
    if (esTablaFaltante(e, TABLA_OTROS_SERVICIOS)) {
      return { renglones: [], faltaTabla: true };
    }
    throw e;
  }
}

/** Un renglón nuevo. La fecha y la quincena las decide el llamador (el
 *  SERVIDOR, con `hoyPanama`): acá no se elige nada. */
export async function anotarOtroServicio(r: {
  codigo: string;
  quincena: string;
  fecha: string;
  monto: number;
  concepto: string;
  anotadoPor: string;
}): Promise<{ ok: true; id: string } | { ok: false; faltaTabla: boolean; error: string }> {
  const { data, error } = await supabaseServer
    .from(TABLA_OTROS_SERVICIOS)
    .insert({
      empleado_codigo: r.codigo,
      quincena: r.quincena,
      fecha: r.fecha,
      monto: r.monto,
      concepto: r.concepto,
      anotado_por: r.anotadoPor,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      faltaTabla: esTablaFaltante(error, TABLA_OTROS_SERVICIOS),
      error: error.message,
    };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/**
 * 🔴 SOFT DELETE FIRMADO, NUNCA UN `DELETE`. Y solo sobre un renglón vivo: dos
 * toques del mismo botón no pueden dejar dos firmas distintas.
 */
export async function quitarOtroServicio(opts: {
  id: string;
  usuario: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error, count } = await supabaseServer
    .from(TABLA_OTROS_SERVICIOS)
    .update(
      { deleted: true, deleted_por: opts.usuario, deleted_en: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", opts.id)
    .eq("deleted", false);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Ese renglón ya no está." };
  return { ok: true };
}

/** Un renglón suelto, para saber de quién y de qué quincena es antes de tocarlo. */
export async function leerUnOtroServicio(
  id: string,
): Promise<{ codigo: string; quincena: string } | null> {
  const { data, error } = await supabaseServer
    .from(TABLA_OTROS_SERVICIOS)
    .select("empleado_codigo, quincena")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (error || !data) return null;
  const f = data as { empleado_codigo: string; quincena: string };
  return { codigo: String(f.empleado_codigo), quincena: String(f.quincena) };
}
