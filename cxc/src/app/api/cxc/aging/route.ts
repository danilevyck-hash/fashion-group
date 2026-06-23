import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// Devuelve las filas de aging del CXC (switch_estadocuenta_aging).
//
// FILTRO SERVER-SIDE por empresa asociada: un vendedor con
// fg_users.associated_company definida solo recibe las filas de ESA empresa.
// Vendedor sin empresa asociada (null) y admin/secretaria reciben todas.
// La restricción se aplica acá (no solo en la UI) para que no se pueda
// saltar manipulando el cliente.
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.role !== "admin" && !["secretaria", "vendedor"].includes(session.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Empresa asociada del vendedor (fuente de verdad: DB, no la cookie).
  let companyKey: string | null = null;
  if (session.role === "vendedor" && session.userId) {
    const { data: u } = await supabaseServer
      .from("fg_users")
      .select("associated_company")
      .eq("id", session.userId)
      .maybeSingle();
    companyKey = u?.associated_company ?? null;
  }

  // Lee la MV precalculada (switch_estadocuenta_aging_mv). Degrada suave: si la MV
  // aún no existe (ventana de deploy antes de la migración), cae a la VIEW en vivo
  // → CXC nunca rompe. La MV trae materializado_en = cuándo se refrescó (frescura
  // real, no la hora del request).
  let rows: unknown[] = [];
  let refreshedAt: string | null = null;

  let mvQuery = supabaseServer.from("switch_estadocuenta_aging_mv").select("*");
  if (companyKey) mvQuery = mvQuery.eq("company_key", companyKey);
  const mvRes = await mvQuery;

  if (mvRes.error) {
    // Fallback a la view en vivo (mismo shape de filas).
    let vQuery = supabaseServer.from("switch_estadocuenta_aging").select("*");
    if (companyKey) vQuery = vQuery.eq("company_key", companyKey);
    const vRes = await vQuery;
    if (vRes.error) {
      return NextResponse.json({ error: vRes.error.message }, { status: 500 });
    }
    rows = vRes.data ?? [];
  } else {
    rows = mvRes.data ?? [];
    refreshedAt = (mvRes.data?.[0] as { materializado_en?: string } | undefined)?.materializado_en ?? null;
  }

  return NextResponse.json({ rows, companyKey, refreshedAt });
}
