import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Último pago por empresa+cliente (vista switch_ultimo_pago_cliente_v2, lee de
// switch_recibos). Antes anon client-side; ahora service_role tras revocar el
// SELECT de anon sobre la vista. Solo lectura. Gate = roles de CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("switch_ultimo_pago_cliente_v2")
    .select("*");
  if (error) {
    console.error(`[cxc/ultimo-pago] ${error.message}`);
    return NextResponse.json({ error: "Error al leer últimos pagos" }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
