import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { bulkDeletePedidos, parseBulkDeleteBody } from "@/lib/catalogo/bulk-delete-pedidos";

export const dynamic = "force-dynamic";

/**
 * Eliminación masiva de pedidos (soft-delete, espejo del individual).
 * Body: { pedidos: [{ id, fuente: 'orders' | 'publicos' }] }.
 * Los ya enviados a Switch solo se OCULTAN de fashiongr — siguen en Switch y
 * la respuesta trae sus números (en_switch) para anularlos en el panel.
 * Mismos clients que los DELETE individuales: orders → client de la marca,
 * publicos → cfg.publicosDb (quirk de topología heredado).
 */
export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

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
    marca: cfg.marca,
    ordersDb: await cfg.db(),
    publicosDb: await cfg.publicosDb(),
    ordersTable: cfg.ordersTable,
    publicosTable: cfg.publicosTable,
    enviosTable: cfg.enviosTable,
    pedidos,
    session: { role: auth.role, userName: auth.userName },
  });

  return NextResponse.json({ ok: true, ...result });
}
