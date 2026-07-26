// Wrapper directo de la proyección de cierre, sin el shape completo de
// /api/ventas/resumen.
//
// OJO (jul-2026): hoy NO tiene ningún consumidor. Lo llamaba la página
// "Configurar Metas" (/ventas/metas), que ya no existe — el único consumidor de
// la proyección es el dashboard de /ventas vía src/lib/ventas/queries.ts.
// Mientras siga en pie tiene que dar LA MISMA respuesta que el dashboard: hasta
// ahora llamaba a v5 mientras el dashboard llamaba a v6, o sea dos números
// distintos para la misma pregunta. Ahora ambos van a v7 (con caída a v6 si la
// migración 20260726120000 todavía no corrió).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const anioParam = req.nextUrl.searchParams.get("anio");
  if (!anioParam) return NextResponse.json({ error: "anio requerido" }, { status: 400 });
  const anio = parseInt(anioParam, 10);
  if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: "anio inválido" }, { status: 400 });
  }

  // Misma fuente que el dashboard: v7, con caída a v6 si la migración no corrió.
  const { data, error } = await rpcConFallbackDeVersion(
    () => supabaseServer.rpc("ventas_proyeccion_cierre_v7", { p_anio: anio }),
    () => supabaseServer.rpc("ventas_proyeccion_cierre_v6", { p_anio: anio }),
    { label: "ventas_proyeccion_cierre_v7" },
  );
  if (error) {
    console.error("[ventas/proyeccion-cierre]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? {});
}
