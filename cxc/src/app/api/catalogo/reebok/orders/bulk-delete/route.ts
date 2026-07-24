import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { bulkDeletePedidos, parseBulkDeleteBody } from "@/lib/catalogo/bulk-delete-pedidos";

export const dynamic = "force-dynamic";

/**
 * Eliminación masiva de pedidos Reebok (soft-delete, espejo del individual).
 * Body: { pedidos: [{ id, fuente: 'orders' | 'publicos' }] }.
 * Los ya enviados a Switch solo se OCULTAN de fashiongr — siguen en Switch y
 * la respuesta trae sus números (en_switch) para anularlos en el panel.
 * Mismos clients que los DELETE individuales: orders → reebokServer,
 * publicos → supabaseServer.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const pedidos = parseBulkDeleteBody(body);
  if (typeof pedidos === "string") {
    return NextResponse.json({ error: pedidos }, { status: 400 });
  }

  const result = await bulkDeletePedidos({
    marca: "reebok",
    ordersDb: reebokServer,
    publicosDb: supabaseServer,
    ordersTable: "reebok_orders",
    publicosTable: "reebok_pedidos_publicos",
    enviosTable: "reebok_switch_envios",
    pedidos,
    session: { role: auth.role, userName: auth.userName },
  });

  return NextResponse.json({ ok: true, ...result });
}
