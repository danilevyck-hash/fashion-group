/**
 * Multifashion › Resumen con «Rango de fechas»: venta retail del rango y los
 * mismos días del año pasado. Reglas: `lib/multifashion/resumen-rango.ts`.
 *
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD → { actual: TramoRango, previo: TramoRango }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { MAX_DIAS_RANGO, diasDelRango, esFechaIso } from "@/lib/comisiones/vendedores-rango";
import {
  RESUMEN_RANGO_2026_10,
  comparacionDelRango,
  corteDelRango,
  tramoDe,
  type FilaRetail,
} from "@/lib/multifashion/resumen-rango";

export const dynamic = "force-dynamic";

const leerRetail = (desde: string, hasta: string) =>
  leerTodoPaginado<FilaRetail>(
    "_multifashion_sf_vw (resumen por rango)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("_multifashion_sf_vw")
        .select("fecha, subtotal", pedirCount ? { count: "exact" } : {})
        .eq("is_wholesale", false)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("n_sistema", { ascending: true })
        .range(a, b),
  );

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;
  if (!RESUMEN_RANGO_2026_10) return NextResponse.json({ error: "no disponible" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta || hasta > hoyPanama()) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  if (diasDelRango(desde, hasta) > MAX_DIAS_RANGO) {
    return NextResponse.json({ error: "El rango no puede pasar de dos años" }, { status: 400 });
  }

  try {
    const filas = await leerRetail(desde, hasta);
    const corte = corteDelRango(desde, hasta, filas);
    const ant = comparacionDelRango(desde, corte);
    const previas = await leerRetail(ant.desde, ant.hasta);
    return NextResponse.json({ actual: tramoDe(desde, hasta, filas), previo: tramoDe(ant.desde, ant.hasta, previas) });
  } catch (e) {
    console.error("[multifashion/resumen-rango]", e);
    return NextResponse.json({ error: "No se pudo calcular el rango. Intenta de nuevo." }, { status: 500 });
  }
}
