// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/estado-cuenta/[codigo]?empresa={empresaKey|todas}
//
// Estado de cuenta del cliente SIN ir a Switch: lista los DOCUMENTOS con saldo
// (saldo <> 0) desde la tabla base switch_estadocuenta ya sincronizada. Agrupa
// por empresa, aplica el signo por tipo de comprobante y devuelve subtotales +
// total. El total cuadra AL CENTAVO con el saldo que muestra la lista CXC porque
// usa el MISMO signo agregado que la vista switch_estadocuenta_aging.
//
// [codigo] = código Switch Soft (ej. "D-122").
// empresa: si es una empresa válida → solo esa; "todas"/ausente → todas las B2B.
//          Un vendedor queda forzado a su empresa asociada (fg_users, no cookie).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { SWITCH_ESTADOCUENTA_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fetchEstadoCuentaData } from "@/lib/cxc/estado-cuenta-data";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  const empresaParam = req.nextUrl.searchParams.get("empresa") ?? "";
  const isTodas = !empresaParam || empresaParam === "todas" || empresaParam === "all";

  // Vendedor: forzar su empresa asociada (fuente de verdad: DB, no la cookie).
  let empresas: string[];
  if (auth.role === "vendedor" && auth.userId) {
    const { data: u } = await supabaseServer
      .from("fg_users")
      .select("associated_company")
      .eq("id", auth.userId)
      .maybeSingle();
    const asociada = u?.associated_company ?? null;
    empresas = asociada ? [asociada] : [...SWITCH_ESTADOCUENTA_EMPRESA_KEYS];
  } else if (isTodas) {
    empresas = [...SWITCH_ESTADOCUENTA_EMPRESA_KEYS];
  } else {
    if (!(SWITCH_ESTADOCUENTA_EMPRESA_KEYS as readonly string[]).includes(empresaParam)) {
      return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
    }
    empresas = [empresaParam];
  }

  try {
    // Misma fuente que el envío de correo: signo + agrupación en el helper
    // compartido → los números cuadran al centavo entre pantalla, PDF y correo.
    const result = await fetchEstadoCuentaData(codigo, empresas);
    return NextResponse.json(result);
  } catch (e) {
    console.error(`[cxc/estado-cuenta] ${(e as Error).message}`);
    return NextResponse.json({ error: "Error al leer estado de cuenta" }, { status: 500 });
  }
}
