// La puerta del SERVIDOR para todo lo que ARMA o TRABAJA un pedido del
// catálogo: checkout, envío a Switch, editar, duplicar, convertir, el
// directorio de clientes y vendedores. Admin siempre pasa (como `requireRole`);
// el resto, lo que diga `puedePedir` (rol + las personas de bodega que piden).
import { NextRequest, NextResponse } from "next/server";
import { requireRole, type SessionPayload } from "@/lib/requireRole";
import { PEDIDO_ROLES, puedePedir } from "@/lib/catalogo/roles";

export function requirePedido(req: NextRequest): SessionPayload | NextResponse {
  const auth = requireRole(req, [...PEDIDO_ROLES, "bodega"]);
  if (auth instanceof NextResponse) return auth;
  if (puedePedir(auth)) return auth;
  return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
}
