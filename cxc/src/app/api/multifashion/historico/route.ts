// GET /api/multifashion/historico — «Últimos 12 meses» del Resumen del celular
// (`MULTIFASHION_BARRA_2026_10`). SOLO LEE: los dos procedimientos del detalle
// del mes, uno por mes de la ventana. La cuenta vive en `lib/multifashion/historico`.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { rpcRetail } from "@/lib/multifashion/rpc-retail";
import { historicoDeVentas, mesesDelHistorico, type MesHistorico } from "@/lib/multifashion/historico";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  const hoy = hoyPanama();
  const ventana = mesesDelHistorico(hoy);
  const meses: MesHistorico[] = [];
  try {
  // ponytail: 24 lecturas por carga, de a 4 meses (8 a la vez, como el detalle
  // del mes). Si esto se publica: un procedimiento por rango y caché diaria.
  for (let i = 0; i < ventana.length; i += 4) {
    const tanda = await Promise.all(ventana.slice(i, i + 4).map(async (m) => {
      const [det, hrs] = await Promise.all([
        rpcRetail("detalleMensual", { p_year: m.anio, p_mes: m.mes }),
        supabaseServer.rpc("multifashion_horas_pico_v1", { p_year: m.anio, p_mes: m.mes }),
      ]);
      // Un mes que no se pudo leer deja el dato sin decir: nunca media ventana.
      if (det.error || hrs.error) throw new Error(det.error?.message ?? hrs.error?.message ?? "lectura fallida");
      return {
        ...m,
        dias: ((det.data as { dias?: MesHistorico["dias"] } | null)?.dias ?? []),
        horas: ((hrs.data as { horas?: MesHistorico["horas"] } | null)?.horas ?? []),
      };
    }));
    meses.push(...tanda);
  }
    return NextResponse.json(historicoDeVentas(meses, hoy));
  } catch (err) {
    console.error("[multifashion/historico]", err);
    return NextResponse.json({ error: "error inesperado" }, { status: 500 });
  }
}
