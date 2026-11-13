/**
 * Plantilla Switch › Tallas por bulto — el «Excel de tallas» de un pedido.
 *
 *   GET ?empresa=fashion_shoes&pedido=16-000002182
 *     → { pedido: { secuencial, cliente }, filas, resumen, hoy }
 *
 * Solo LEE: las líneas del pedido (de Switch si no están guardadas) y las tallas
 * de los despachos del proveedor. El Excel lo arma el navegador con las MISMAS
 * filas que muestra la vista previa (`lib/tallas-pedido/excel.ts`).
 * 🔴 Solo admin y secretaria (403 al resto); con el interruptor apagado, 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { ROLES_TALLAS_PEDIDO, TALLAS_POR_PEDIDO_2026_11 } from "@/lib/tallas-pedido/interruptores";
import { armarTallasDelPedido, idDelPedido } from "@/lib/tallas-pedido/armar";
import { leerPedido, leerTallasDeDespacho } from "@/lib/tallas-pedido/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!TALLAS_POR_PEDIDO_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, [...ROLES_TALLAS_PEDIDO]);
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams;
  const empresa = (q.get("empresa") ?? "").trim();
  const id = idDelPedido(q.get("pedido") ?? "");
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa) || id === null) {
    return NextResponse.json({ error: "Escribe la empresa y el número de pedido" }, { status: 400 });
  }

  try {
    const pedido = await leerPedido(empresa, id);
    if (!pedido) return NextResponse.json({ error: "No se encontró ese pedido en Switch" }, { status: 404 });
    const despachos = await leerTallasDeDespacho(empresa, pedido.lineas.map((l) => l.codigo));
    const { filas, resumen } = armarTallasDelPedido(pedido.lineas, despachos);
    return NextResponse.json({
      pedido: { secuencial: pedido.secuencial, cliente: pedido.cliente },
      filas,
      resumen,
      hoy: hoyPanama(),
    });
  } catch (e) {
    console.error("[tallas-pedido]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el pedido. Intenta de nuevo." }, { status: 500 });
  }
}
