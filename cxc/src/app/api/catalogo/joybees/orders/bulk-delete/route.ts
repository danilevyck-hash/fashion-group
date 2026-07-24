import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { bulkDeletePedidos, parseBulkDeleteBody } from "@/lib/catalogo/bulk-delete-pedidos";

export const dynamic = "force-dynamic";

/**
 * Eliminación masiva de pedidos Joybees (soft-delete, espejo del individual).
 * Body: { pedidos: [{ id, fuente: 'orders' | 'publicos' }] }.
 * Los ya enviados a Switch solo se OCULTAN de fashiongr — siguen en Switch y
 * la respuesta trae sus números (en_switch) para anularlos en el panel.
 * Espejo de reebok/orders/bulk-delete; en Joybees ambas tablas viven en
 * joybeesServer.
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
    marca: "joybees",
    ordersDb: joybeesServer,
    publicosDb: joybeesServer,
    ordersTable: "joybees_orders",
    publicosTable: "joybees_pedidos_publicos",
    enviosTable: "joybees_switch_envios",
    pedidos,
    session: { role: auth.role, userName: auth.userName },
  });

  return NextResponse.json({ ok: true, ...result });
}
