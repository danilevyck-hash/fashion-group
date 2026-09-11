import { NextRequest, NextResponse } from "next/server";
import { requireAsistencia, MODULOS_PLANILLA } from "@/lib/asistencia/guard";
import { asistenciaRoles, aprobacionesRoles } from "@/lib/asistencia/roles";
import { leerAlcanceAprobador } from "@/lib/asistencia/aprobador-empresa-server";
import { EMPRESA_BOSTON, ROL_BOSTON, esGerenteBoston } from "@/lib/boston/rol";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/asistencia/alcance — QUÉ EMPRESAS PUEDE MIRAR QUIEN PREGUNTA.
//
// 🩸 El selector de empresa de Asistencia armaba sus opciones solo con el rol
// (`esGerenteBoston`): a `bodega` (Julio) le ofrecía las 4 mientras el servidor
// le recortaba a fashion_wear + vistana, y al elegir Boston la pestaña quedaba
// vacía sin decir por qué (11-sep-2026). Acá se contesta con la MISMA lectura
// que recorta en `/api/asistencia/planilla` y `/aprobaciones`
// (`leerAlcanceAprobador`): una sola definición de «las suyas».
//
// 🔴 SOLO LECTURA y solo la lista: `null` = las cuatro (admin, quien cierra la
// planilla), una lista = exactamente ésas. No viaja ningún dato de personas.
// Las mismas tres puertas que la planilla (Asistencia, quien aprueba, David).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON], MODULOS_PLANILLA);
  if (auth instanceof NextResponse) return auth;
  // David ES Boston: no hace falta mirar la tabla.
  if (esGerenteBoston(auth.role)) return NextResponse.json({ empresas: [EMPRESA_BOSTON] });
  try {
    const alcance = await leerAlcanceAprobador(auth.role, auth.userName);
    return NextResponse.json({ empresas: alcance.empresas === null ? null : [...alcance.empresas] });
  } catch (e) {
    // Sin respuesta la pantalla ofrece lo del rol, como hasta hoy: el recorte
    // de verdad sigue viviendo en cada ruta.
    console.error("[asistencia/alcance]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el alcance" }, { status: 500 });
  }
}
