/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de «de qué empresas apruebo». La regla vive en `aprobador-empresa.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * 🩸 IGUAL QUE `aprobaciones-server.ts` Y `config-server.ts`: si la migración
 * todavía no corrió, esto NO revienta. Devuelve `faltaTabla: true` y con eso
 * NADIE queda segmentado — o sea, el sistema del día anterior. En este proyecto
 * los DDL los corre Daniel a mano y varios se quedaron pendientes semanas.
 *
 * ⚠️ La degradación solo ocurre cuando el error NOMBRA la tabla. Tragarse
 * cualquier error convertiría un permiso, un timeout o un RLS en «nadie está
 * segmentado» — la peor forma de fallar acá, porque es justo la que reabre el
 * agujero sin que nadie lo note.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { esTablaFaltante } from "./config";
import {
  alcanceDe,
  type AlcanceAprobador,
  type AsignacionAprobador,
} from "./aprobador-empresa";

export const TABLA_APROBADOR_EMPRESA = "asistencia_aprobador_empresa";

export function avisoMigracionAprobador(): string {
  return `Todavía no se puede repartir por empresa quién aprueba horas extra: falta correr ${TABLA_APROBADOR_EMPRESA} (supabase/migrations/20260903120000_asistencia_aprobador_empresa.sql). Mientras tanto, quien aprueba puede aprobar las tres empresas, como antes.`;
}

/** El alcance de ESTE usuario. Nunca lanza: ante la duda, no segmenta. */
export async function leerAlcanceAprobador(
  rol: string,
  usuario: string | undefined,
): Promise<AlcanceAprobador> {
  // 🔑 `admin` ni siquiera consulta: pasa siempre. Una consulta menos por
  // request contra una base en compute Micro.
  if (rol === "admin") return alcanceDe(rol, usuario, [], false);

  const { data, error } = await supabaseServer
    .from(TABLA_APROBADOR_EMPRESA)
    // Select EXPLÍCITO, nunca `*`.
    .select("usuario, empresa");

  if (error) {
    if (esTablaFaltante(error, TABLA_APROBADOR_EMPRESA)) {
      return alcanceDe(rol, usuario, [], true);
    }
    throw new Error(`No se pudo leer ${TABLA_APROBADOR_EMPRESA}: ${error.message}`);
  }

  const filas = (data ?? []) as AsignacionAprobador[];
  return alcanceDe(rol, usuario, filas, false);
}
