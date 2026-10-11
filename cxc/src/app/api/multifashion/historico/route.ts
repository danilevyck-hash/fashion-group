// GET /api/multifashion/historico — «Últimos 12 meses» del Resumen del celular
// (`MULTIFASHION_BARRA_2026_10`). SOLO LEE. La cuenta vive en
// `lib/multifashion/historico`; aquí se junta de dónde sale cada cosa:
//   · los días: `multifashion_detalle_mensual_v3`, uno por mes de la ventana;
//   · las horas: `multifashion_horas_pico_v1` en los meses que entran enteros, y
//     las facturas de esos días (misma vista, retail) en los dos meses del borde
//     — así la ventana son 365 días exactos y HOY no entra.
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { rpcRetail } from "@/lib/multifashion/rpc-retail";
import { VISTA_RETAIL } from "@/lib/multifashion/retail-dia";
import type { HoraMes } from "@/lib/multifashion/patrones";
import { historicoDeVentas, horasDeFacturas, mesesDelHistorico, type HistoricoVentas, type MesDelHistorico } from "@/lib/multifashion/historico";

// Como el catálogo público: sin `fetchCache = "force-no-store"`, que apagaría también lo guardado del día.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

async function horasDelMes(m: MesDelHistorico): Promise<HoraMes[]> {
  if (m.entero) {
    const r = await supabaseServer.rpc("multifashion_horas_pico_v1", { p_year: m.anio, p_mes: m.mes });
    if (r.error) throw new Error(r.error.message);
    return ((r.data as { horas?: HoraMes[] } | null)?.horas ?? []);
  }
  const filas = await leerTodoPaginado<{ fecha_ts: string; subtotal: number | string | null }>(
    `${VISTA_RETAIL} horas [${m.desde}..${m.hasta}]`,
    (pedirCount, from, to) =>
      supabaseServer
        .from(VISTA_RETAIL)
        .select("fecha_ts, subtotal", pedirCount ? { count: "exact" } : {})
        .eq("is_wholesale", false)
        .gte("fecha", m.desde)
        .lte("fecha", m.hasta)
        .order("n_sistema", { ascending: true })
        .range(from, to),
  );
  return horasDeFacturas(filas);
}

/** Las ~28 lecturas, de a 4 meses (8 a la vez, como el detalle del mes). */
async function leerHistorico(hoy: string): Promise<HistoricoVentas> {
  const ventana = mesesDelHistorico(hoy);
  const dias: { fecha: string; ventas: number }[] = [];
  const horas: HoraMes[] = [];
  for (let i = 0; i < ventana.length; i += 4) {
    const tanda = await Promise.all(ventana.slice(i, i + 4).map(async (m) => {
      const [det, hrs] = await Promise.all([
        rpcRetail("detalleMensual", { p_year: m.anio, p_mes: m.mes }),
        horasDelMes(m),
      ]);
      // Un mes que no se pudo leer deja el dato sin decir: nunca media ventana.
      if (det.error) throw new Error(det.error.message);
      const delMes = ((det.data as { dias?: { dia: number; ventas: number }[] } | null)?.dias ?? []);
      return {
        dias: delMes.map((d) => ({
          fecha: `${m.anio}-${String(m.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`,
          ventas: Number(d.ventas) || 0,
        })),
        horas: hrs,
      };
    }));
    for (const t of tanda) { dias.push(...t.dias); horas.push(...t.horas); }
  }
  return historicoDeVentas(dias, horas, hoy);
}

/**
 * 🔴 UNA VEZ AL DÍA. La respuesta son «los 365 días que terminan ayer»: es la
 * misma todo el día y no lleva nada de quien la pide. Se guarda por el DÍA de
 * Panamá (mismo patrón que el catálogo público, `unstable_cache`); mañana la
 * clave es otra. Un error no se guarda. 🔴 El permiso se revisa en CADA pedido,
 * ANTES de leer lo guardado, y la respuesta nunca lleva encabezados de caché pública.
 * ponytail: una corrección de Switch sobre un día viejo se ve mañana; si pesa,
 * un procedimiento por rango en la base (pide el «sí» de Daniel al SQL).
 */
const historicoDelDia = unstable_cache(leerHistorico, ["multifashion-historico"], { revalidate: 86_400 });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await historicoDelDia(hoyPanama()));
  } catch (err) {
    console.error("[multifashion/historico]", err);
    return NextResponse.json({ error: "error inesperado" }, { status: 500 });
  }
}
