/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DOS DATOS QUE EL COMPROBANTE IMPRIME Y LA PLANILLA NO CONOCE:
 * el cargo («POSICION DESEMPEÑADA») y la cédula del pie.
 *
 * 🔴 ESTA RUTA NO CALCULA NADA. Los montos del comprobante salen de la MISMA
 * respuesta de `/api/asistencia/planilla` que la pantalla ya tiene. Si acá
 * viajaran también los montos, habría dos caminos hacia el mismo número y
 * tarde o temprano dirían cosas distintas.
 *
 * ⚠️ Es una ruta aparte y no dos campos más en la planilla a propósito: la
 * respuesta de la planilla ya se recorta por rol (`planillaSinDinero`) y tiene
 * candados sobre su forma. Un cargo no es dinero y no tiene por qué entrar a
 * ese recorte.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { leerPersonas } from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // La misma puerta que el resto de la Planilla. La secretaria también imprime.
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const { filas } = await leerPersonas();
    const personas = filas.map((f) => ({
      codigo: String(f.empleado_codigo),
      // `null` y no `""`: el papel lo distingue y escribe un guion.
      posicion: f.posicion ?? null,
      cedula: f.cedula ?? null,
    }));
    return NextResponse.json({ personas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/comprobante GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
