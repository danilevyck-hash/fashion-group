import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { empresaValida, empresasDe } from "@/lib/vista-general/hoy";
import { periodoTipoValido, rangoPeriodoTipo, tieneTipo } from "@/lib/vista-general/vendido-por-tipo";
import { leerVendidoPorTipo } from "@/lib/vista-general/vendido-por-tipo-server";
import { VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11 } from "@/lib/ui/vista-general-utilidad-tipo-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * «Vendido por tipo» de la Vista general (`?empresa=grupo|<key>&periodo=anio|aAAAA|mes|12m`):
 * los artículos vendidos con su tipo y sus piezas netas. Solo admin. Solo lee.
 */
export async function GET(req: NextRequest) {
  if (!VG_UTILIDAD_Y_VENDIDO_POR_TIPO_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const empresas = empresasDe(empresaValida(req.nextUrl.searchParams.get("empresa")));
  const hoy = hoyPanama();
  const { desde, hasta } = rangoPeriodoTipo(periodoTipoValido(req.nextUrl.searchParams.get("periodo"), hoy), hoy);
  if (!empresas.some(tieneTipo)) return NextResponse.json({ desde, hasta, sinTipo: true, articulos: [] });
  try {
    const articulos = await leerVendidoPorTipo(empresas, desde, hasta);
    return NextResponse.json({ desde, hasta, sinTipo: false, articulos });
  } catch (e) {
    console.error(`[vista-general/vendido-por-tipo] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "No se pudo leer lo vendido" }, { status: 500 });
  }
}
