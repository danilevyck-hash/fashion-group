import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { desdeParaComparar, mesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { leerRecibosQueCuentan } from "@/lib/vista-general/hoy-server";
import { empresaValida, empresasDe, loManeja } from "@/lib/vista-general/hoy";
import { VG_MARGEN_COBROS_MES_A_MES_2026_11 } from "@/lib/ui/vista-general-mes-a-mes-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Cobros mes a mes de la Vista general (`?empresa=grupo|<key>`): la MISMA regla
 * de «Cobros del mes», enero al mes en curso, contra el año pasado (el mes en
 * curso a los mismos días de Panamá). Solo admin. Solo lee.
 */
export async function GET(req: NextRequest) {
  if (!VG_MARGEN_COBROS_MES_A_MES_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const empresas = empresasDe(empresaValida(req.nextUrl.searchParams.get("empresa"))).filter((k) => loManeja(k, "cobros"));
  const hoy = hoyPanama();
  try {
    const filas = await leerRecibosQueCuentan(desdeParaComparar(hoy), hoy, empresas);
    return NextResponse.json(mesesContraAnioPasado(filas.map((f) => ({ fecha: f.fecha, monto: f.total })), hoy));
  } catch (e) {
    console.error(`[vista-general/cobros-mes-a-mes] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "No se pudieron leer los cobros" }, { status: 500 });
  }
}
