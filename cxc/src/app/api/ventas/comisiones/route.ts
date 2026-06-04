/**
 * Comisiones B2B por empresa + período. Lee el RPC comision_b2b (cache
 * switch_factura_utilidad + comision_tasas). Regla: facturas con utilidad>20%
 * menos NC, excluye intercompañía/internos; comisión = base × tasa por cartera.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);

  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "empresa B2B inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("comision_b2b_v4", {
    p_empresa_key: empresa,
    p_year: year,
    p_mes: mes,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
