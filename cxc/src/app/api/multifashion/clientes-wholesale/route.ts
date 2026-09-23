// Endpoint del sub-tab Clientes Multifashion — sección Wholesale.
// Wrapper de la RPC multifashion_wholesale_clientes_v2(p_fecha_inicio, p_fecha_fin).
// v2 excluye clientes intercompañía / empresas del grupo (ver migración 20260604190000).
//
// Query params:
//   fecha_inicio  YYYY-MM-DD (default: 1 ene del año actual)
//   fecha_fin     YYYY-MM-DD (default: today)
//
// Reemplaza la firma anterior basada en `year`. El frontend calcula los
// rangos según el pill activo (último mes, 3m, 6m, 12m, año X).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { supabaseServer } from "@/lib/supabase-server";
import { RETAIL_AL_FRENTE } from "@/lib/multifashion/retail-al-frente";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  // Multifashion es módulo admin-only por ahora (los demás roles se definen
  // después). overview queda compartido con Ventas, pero los sub-tabs son admin.
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  // 🩸 RETIRADA EL 23-sep-2026 (patrón `mayor_lineas`: el archivo y la RPC se
  // quedan, la puerta se cierra). El bloque «Mayoreo» de Clientes se fue: la
  // plata del mayoreo se dice en la línea chiquita del Resumen y La Frontera
  // queda fuera del ranking por código. Con `RETAIL_AL_FRENTE` apagado la ruta
  // contesta como siempre — es lo que la pestaña de antes pide.
  if (RETAIL_AL_FRENTE) {
    return NextResponse.json(
      { error: "Esta consulta se retiró: el mayoreo se ve en el Resumen de Multifashion." },
      { status: 410 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const ene1 = `${new Date().getFullYear()}-01-01`;
  const fecha_inicio = sp.get("fecha_inicio") ?? ene1;
  const fecha_fin = sp.get("fecha_fin") ?? today;

  if (!ISO_DATE.test(fecha_inicio) || !ISO_DATE.test(fecha_fin)) {
    return NextResponse.json({ error: "fecha_inicio / fecha_fin deben ser YYYY-MM-DD" }, { status: 400 });
  }
  if (fecha_inicio > fecha_fin) {
    return NextResponse.json({ error: "fecha_inicio > fecha_fin" }, { status: 400 });
  }

  // El rango viaja tal como lo pidió la pantalla. La ventana acotada de
  // `gerente_acs` se levantó el 13-ago-2026 (ver CLAUDE.md § Roles); lo que
  // sigue vigente es la validación de formato y de orden de arriba.
  const { data, error } = await supabaseServer.rpc("multifashion_wholesale_clientes_v2", {
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
  });
  if (error) {
    console.error("[multifashion/clientes-wholesale] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
