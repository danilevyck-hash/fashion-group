// ─────────────────────────────────────────────────────────────────────────────
// GET /api/visitas/resumen — «quién usa qué», los últimos 30 días. SOLO ADMIN.
//
// 🔴 SOLO LEE. No escribe una fila ni borra nada: la poda vive en el cron
// `cleanup-sessions` (180 días).
//
// 🔴 SOLO ADMIN, DECIDIDO EN EL SERVIDOR. Saber quién entra a qué es de Daniel;
// ni la secretaria ni contabilidad ven esta pantalla ni esta ruta.
//
// ⚠️ SE LEE PAGINADO. `db-max-rows` es 1000 y corta EN SILENCIO: 30 días de
// visitas de ocho personas pasan de mil filas sin esfuerzo, y una lectura plana
// se vería completa estando cortada. El orden de paginación es la PK entera
// (día, persona, módulo, aparato), que es única y estable.
//
// 🔴 FALLA ABIERTA. Sin la migración `20261221120000` la tabla no existe: se
// contesta 200 con la lista vacía y `tablaLista: false`, y la pantalla lo DICE
// en vez de mostrar ceros como si fueran una medición.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  DIAS_QUE_SE_GUARDAN,
  DIAS_QUE_SE_MIRAN,
  TABLA_VISITAS,
  diaHaceNDias,
} from "@/lib/visitas/registro";
import {
  modulosSinVisitas,
  visitasPorModulo,
  visitasPorPersona,
  type FilaVisita,
} from "@/lib/visitas/resumen";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const COLUMNAS = "dia, user_id, user_name, role, modulo, aparato, visitas, ultima_en";

/** ¿El error es «la tabla todavía no existe»? */
function faltaLaTabla(mensaje: string): boolean {
  return /42P01|PGRST205|does not exist|schema cache|could not find the table/i.test(mensaje);
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const desde = diaHaceNDias(hoyPanama(), DIAS_QUE_SE_MIRAN);

  let filas: FilaVisita[] = [];
  try {
    filas = await leerTodoPaginado<FilaVisita>(
      `${TABLA_VISITAS} (quién usa qué)`,
      (pedirCount, inicio, fin) =>
        supabaseServer
          .from(TABLA_VISITAS)
          .select(COLUMNAS, pedirCount ? { count: "exact" } : {})
          .gte("dia", desde)
          .order("dia", { ascending: true })
          .order("user_id", { ascending: true })
          .order("modulo", { ascending: true })
          .order("aparato", { ascending: true })
          .range(inicio, fin),
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (!faltaLaTabla(mensaje)) {
      console.error("[visitas] no se pudo leer el resumen:", mensaje);
      return NextResponse.json({ error: "No se pudo leer" }, { status: 500 });
    }
    return NextResponse.json({
      tablaLista: false,
      desde,
      dias: DIAS_QUE_SE_MIRAN,
      diasQueSeGuardan: DIAS_QUE_SE_GUARDAN,
      personas: [],
      modulos: [],
      sinVisitas: [],
    });
  }

  return NextResponse.json({
    tablaLista: true,
    desde,
    dias: DIAS_QUE_SE_MIRAN,
    diasQueSeGuardan: DIAS_QUE_SE_GUARDAN,
    personas: visitasPorPersona(filas),
    modulos: visitasPorModulo(filas),
    sinVisitas: modulosSinVisitas(filas),
  });
}
