/**
 * GUÍAS › ETIQUETAS — el N.° de pedido de las facturas marcadas (12-nov-2026).
 *
 *   GET ?empresa=<empresa_key>&ids=<switch_factura_id>,<…>
 *     → 200 { pedidos: { "<id>": "16-000002889" | null }, motivo? }
 *
 * Los mismos roles que crean etiquetas. Entra al PANEL de Switch de esa
 * empresa (UN login, las facturas una tras otra) y lee «Referencia Pedido» de
 * la vista de cada factura (`lib/guias/pedido-de-factura.ts`). Solo lee.
 * 🔴 NUNCA falla hacia la pantalla: lo que no se encuentre viaja `null` y el
 * campo queda para escribirlo a mano.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ETIQUETAS_ROLES } from "@/lib/guias/etiquetas";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { MAX_FACTURAS_PEDIDO, buscarPedidosDeFacturas } from "@/lib/guias/pedido-de-factura";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ETIQUETAS_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa") ?? "";
  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()))]
    .filter((s) => /^\d{1,12}$/.test(s))
    .map(Number)
    .filter((n) => n > 0)
    .slice(0, MAX_FACTURAS_PEDIDO);
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa) || ids.length === 0) {
    return NextResponse.json({ pedidos: {} });
  }

  try {
    return NextResponse.json(await buscarPedidosDeFacturas(empresa, ids));
  } catch {
    return NextResponse.json({ pedidos: Object.fromEntries(ids.map((id) => [String(id), null])), motivo: "error" });
  }
}
