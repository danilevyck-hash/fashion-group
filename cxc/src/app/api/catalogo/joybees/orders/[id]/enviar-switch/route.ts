// Envío de un pedido Joybees confirmado al ERP Switch (joystep) — mismo motor
// compartido que Reebok (lib/catalogo/switch-envio, patrón at-most-once
// pilotado). Sin fallbacks legacy: el cliente/vendedor DEBEN venir guardados
// en el pedido por el checkout. Requiere DDLs 20260705110000 (tabla
// joybees_switch_envios) y 20260705120000 (columnas cliente/vendedor).

import { NextRequest, NextResponse } from "next/server";
import { handleGetEnvio, handlePostEnvio } from "@/lib/catalogo/enviar-switch-route";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handleGetEnvio(req, "joybees", params.id);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await handlePostEnvio(req, "joybees", params.id);
  } finally {
    await logoutAllSwitchSessions();
  }
}
