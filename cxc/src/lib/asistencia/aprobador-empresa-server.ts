/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de «de qué empresas apruebo». La regla vive en `aprobador-empresa.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * Historia (31-ago-2026): IGUAL QUE `aprobaciones-server.ts` Y
 * `config-server.ts`, si la migración todavía no había corrido esto NO
 * reventaba: devolvía `faltaTabla: true` y con eso NADIE quedaba segmentado —
 * el sistema del día anterior—, y solo cuando el error NOMBRABA la tabla.
 *
 * 🔴 TOLERANCIA RETIRADA EL 3-SEP-2026: la tabla existe desde
 * 20260903120000_asistencia_aprobador_empresa.sql (verificado por PostgREST en
 * producción). Degradar hoy sería la peor forma de fallar acá: un permiso, un
 * timeout o un RLS que devuelva el mismo código se leería como «nadie está
 * segmentado» y reabriría el agujero de los 57 días de Boston sin que nadie lo
 * note. El error se propaga: sin poder leer el reparto, no se aprueba nada.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import {
  alcanceDe,
  type AlcanceAprobador,
  type AsignacionAprobador,
} from "./aprobador-empresa";

export const TABLA_APROBADOR_EMPRESA = "asistencia_aprobador_empresa";

/** El aviso que la pantalla mostraba mientras faltaba la migración. Se conserva
 *  porque lo importan las rutas; desde el 3-sep-2026 ya no se emite. */
export function avisoMigracionAprobador(): string {
  return `Todavía no se puede repartir por empresa quién aprueba horas extra: falta correr ${TABLA_APROBADOR_EMPRESA} (supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql). Mientras tanto, quien aprueba puede aprobar las tres empresas, como antes.`;
}

/** El alcance de ESTE usuario. Si la base falla, lanza: ante la duda, NO se
 *  abre el reparto (tolerancia retirada el 3-sep-2026 — ver el encabezado). */
export async function leerAlcanceAprobador(
  rol: string,
  usuario: string | undefined,
): Promise<AlcanceAprobador> {
  // 🔑 `admin` ni siquiera consulta: pasa siempre. Una consulta menos por
  // request contra una base en compute Micro.
  if (rol === "admin") return alcanceDe(rol, usuario, []);

  const { data, error } = await supabaseServer
    .from(TABLA_APROBADOR_EMPRESA)
    // Select EXPLÍCITO, nunca `*`.
    .select("usuario, empresa");

  if (error) {
    throw new Error(`No se pudo leer ${TABLA_APROBADOR_EMPRESA}: ${error.message}`);
  }

  const filas = (data ?? []) as AsignacionAprobador[];
  return alcanceDe(rol, usuario, filas);
}
