// Envío de un pedido Reebok confirmado al ERP Switch (active_shoes).
// La lógica vive en el handler compartido (lib/catalogo/enviar-switch-route +
// motor lib/catalogo/switch-envio, port fiel del piloto 4-jul-2026) — este
// route es el wrapper de marca. Cliente/vendedor: los guardados por el
// checkout en el pedido; pedidos legacy caen a los defaults del piloto
// (Contado id=1 + Reinaldo id=2). POST body { dry: true } = solo pre-validación.

import { NextRequest, NextResponse } from "next/server";
import { handleGetEnvio, handlePostEnvio } from "@/lib/catalogo/enviar-switch-route";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
// Varias llamadas secuenciales a Switch (lista + tallacolor por línea +
// terminar + info de verificación) no caben en el default de 10s.
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handleGetEnvio(req, "reebok", params.id);
}

// Higiene de sesión única: al terminar el envío —éxito o fallo— se cierra la
// sesión de Switch abierta por este proceso (POST /cierresesion, best-effort).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await handlePostEnvio(req, "reebok", params.id);
  } finally {
    await logoutAllSwitchSessions();
  }
}
