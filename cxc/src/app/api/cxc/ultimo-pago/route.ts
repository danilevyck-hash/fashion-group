import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Último pago por empresa+cliente (vista switch_ultimo_pago_cliente_v2, lee de
// switch_recibos). Antes anon client-side; ahora service_role tras revocar el
// SELECT de anon sobre la vista. Solo lectura. Gate = roles de CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

// Solo las columnas que consume el frontend (join por empresa_key|cliente_codigo
// + fecha/monto). Antes era select("*") → arrastraba cliente_switch_id sin uso.
const COLS = "empresa_key,cliente_codigo,ultimo_pago_fecha,ultimo_pago_monto";

// El proyecto Supabase tiene un tope duro `db-max-rows=1000`: un select() sin
// paginar trunca a 1000 filas EN SILENCIO (la vista ya tiene ~1082 → se perdían
// ~26 clientes vistana con pago, que salían como "sin último pago" en CXC). Un
// .limit() alto NO ayuda (el server igual corta en 1000): hay que paginar por
// Range con orden explícito y estable para no repetir ni saltar filas.
const PAGE = 1000;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("switch_ultimo_pago_cliente_v2")
      .select(COLS)
      .order("empresa_key", { ascending: true })
      .order("cliente_codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[cxc/ultimo-pago] ${error.message}`);
      return NextResponse.json({ error: "Error al leer últimos pagos" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break; // última página
  }
  return NextResponse.json(all);
}
