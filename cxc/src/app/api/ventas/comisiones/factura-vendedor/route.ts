/**
 * Cambiar el vendedor de UNA factura — SOLO admin (Daniel, 11-nov-2026).
 *
 *   POST   → { empresa_key, switch_factura_id, secuencial, vendedor } → 201 { id }
 *            (pasa la comisión de VENTA de esa factura al vendedor; si ya
 *             estaba cambiada, el cambio anterior queda desactivado y firmado)
 *   DELETE → ?empresa=&id= → devuelve la factura al vendedor de Switch
 *            (soft delete firmado de la fila activa). NUNCA borra la fila.
 *
 * Quien suma es la RPC comision_b2b_v10; esta ruta solo administra la lista.
 * Queda rastro en activity_logs (`comisiones`), y quién lo hizo lo pone el
 * servidor. El cobro NO cambia: Switch no dice qué factura pagó cada recibo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { validarCambioDeVendedor, validarDevolucion } from "@/lib/comisiones/cambiar-vendedor";
import { cambiarVendedorFactura, devolverVendedorFactura } from "@/lib/comisiones/cambiar-vendedor-server";
import { anotarConfigComision } from "@/lib/comisiones/rastro-server";
import { ACCION_CONFIG_VENDEDOR_FACTURA } from "@/lib/comisiones/rastro";
import { estaRetirado, AVISO_VENDEDOR_RETIRADO } from "@/lib/comisiones/retirados";

export const dynamic = "force-dynamic";

const SOLO_ADMIN = ["admin"];

export async function POST(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarCambioDeVendedor(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (estaRetirado(v.valor.vendedor)) return NextResponse.json({ error: AVISO_VENDEDOR_RETIRADO }, { status: 400 });

  const quien = auth.userName ?? auth.userId ?? "admin";
  const r = await cambiarVendedorFactura(v.valor, quien);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await anotarConfigComision(auth, ACCION_CONFIG_VENDEDOR_FACTURA, { accion: "cambiar", id: r.id, ...v.valor });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, SOLO_ADMIN);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const v = validarDevolucion(sp.get("empresa"), sp.get("id"));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const quien = auth.userName ?? auth.userId ?? "admin";
  const r = await devolverVendedorFactura(v.valor.empresa_key, v.valor.switch_factura_id, quien);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await anotarConfigComision(auth, ACCION_CONFIG_VENDEDOR_FACTURA, { accion: "devolver", ...v.valor });
  return NextResponse.json({ ok: true });
}
