// GET /api/multifashion/comparativo-hoy — lo que la tienda llevaba vendido el
// MISMO día del año pasado a la MISMA hora del último sync de hoy
// (`MULTIFASHION_BARRA_2026_10`). Con eso el % del mes compara lo mismo que el
// número grande: días completos + hoy hasta ahora. SOLO LEE, sin parámetros.
// Misma vista y mismo filtro que la venta de hoy (retail, notas de crédito restan).
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { VISTA_RETAIL } from "@/lib/multifashion/retail-dia";
import { ultimoSyncFacturasAcs } from "@/lib/multifashion/venta-hoy";
import { instanteUnAnioAntes } from "@/lib/multifashion/celular";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  const fecha = hoyPanama();
  try {
    const corte = await ultimoSyncFacturasAcs(fecha);
    const antes = corte ? instanteUnAnioAntes(fecha, corte) : null;
    // Sin hora de sync de HOY no hay con qué cortar: la pantalla compara días completos.
    if (!corte || !antes) return NextResponse.json({ fecha, corte: null, fechaPrev: null, ventasPrev: null });
    // 29-feb: el año pasado no tuvo ese día y el 28 ya está entero en la base.
    if (!antes.mismoDia) return NextResponse.json({ fecha, corte, fechaPrev: antes.fecha, ventasPrev: 0 });

    const filas = await leerTodoPaginado<{ subtotal: number | string | null }>(
      `${VISTA_RETAIL} ${antes.fecha} hasta ${antes.instante}`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(VISTA_RETAIL)
          .select("subtotal", pedirCount ? { count: "exact" } : {})
          .eq("is_wholesale", false)
          .eq("fecha", antes.fecha)
          .lte("fecha_ts", antes.instante)
          .order("n_sistema", { ascending: true })
          .range(from, to),
    );
    const suma = filas.reduce((s, f) => s + (Number(f.subtotal) || 0), 0);
    return NextResponse.json({ fecha, corte, fechaPrev: antes.fecha, hastaPrev: antes.instante, ventasPrev: Math.round(suma * 100) / 100, documentosPrev: filas.length });
  } catch (err) {
    console.error("[multifashion/comparativo-hoy]", err);
    return NextResponse.json({ error: "error inesperado" }, { status: 500 });
  }
}
