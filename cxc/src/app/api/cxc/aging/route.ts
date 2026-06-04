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

  let query = supabaseServer.from("switch_estadocuenta_aging").select("*");
  if (companyKey) query = query.eq("company_key", companyKey);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], companyKey });
}
