// Despachos › Pedidos › «Facturados» (26-nov-2026): las facturas del grupo de
// la ventana de `primerDiaDeFacturados` (3 días hábiles) que todavía no están en una guía viva. Solo LEE la base;
// nunca llama a Switch. Las empresas las recorta el SERVIDOR, como en Pedidos.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { PEDIDOS_VER_ROLES } from "@/lib/guias/pedidos-bodega";
import { empresasQueVe } from "@/lib/guias/pedidos-bultos";
import { montoDelPedido } from "@/lib/ui/pedidos-conteos-2026-11";
import { PEDIDOS_PIPELINE_2026_11 } from "@/lib/guias/facturados-sin-guia";
import { leerFacturadosSinGuia } from "@/lib/guias/facturados-sin-guia-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!PEDIDOS_PIPELINE_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;
  try {
    const filas = await leerFacturadosSinGuia(empresasQueVe(auth.userName, auth.role));
    // 🔴 La plata la decide el SERVIDOR: el monto solo viaja para quien ve montos.
    const facturados = filas.map(({ subtotal, ...f }) => ({ ...f, ...montoDelPedido(auth.userName, subtotal) }));
    return NextResponse.json({ facturados });
  } catch {
    return NextResponse.json({ error: "No se pudieron leer las facturas" }, { status: 500 });
  }
}
