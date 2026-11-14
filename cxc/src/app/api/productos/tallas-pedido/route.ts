/**
 * Plantilla Switch › Tallas por bulto — el «Excel de tallas» de un pedido o
 * de una factura (un pedido ya facturado sale de los pedidos activos).
 *
 *   GET ?pedido=16-000002182 · 11-000003192 (o los últimos dígitos, «2182»)
 *     → se busca en pedidos activos Y facturas de las 6 empresas: uno solo →
 *       ese; varios → { opciones: [...] } para tocar uno; ninguno → 404.
 *   GET ?empresa=fashion_shoes&tipo=pedido|factura&id=2182
 *     → { tipo, empresa, pedido: { secuencial, cliente }, filas, resumen, hoy }
 *
 * Solo LEE: las líneas del pedido (de Switch si no están guardadas) o de la
 * factura (`switch_factura_lineas`, solo tipo «Factura»), y las tallas
 * de los despachos del proveedor. El Excel lo arma el navegador con las MISMAS
 * filas que muestra la vista previa (`lib/tallas-pedido/excel.ts`).
 * 🔴 Solo admin y secretaria (403 al resto); con el interruptor apagado, 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { ROLES_TALLAS_PEDIDO, TALLAS_POR_PEDIDO_2026_11 } from "@/lib/tallas-pedido/interruptores";
import { armarTallasDelPedido, idDelPedido, juntarEncontrados } from "@/lib/tallas-pedido/armar";
import { buscarFactura, buscarPedido, leerFactura, leerPedido, leerTallasDeDespacho, type TipoDocumento } from "@/lib/tallas-pedido/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!TALLAS_POR_PEDIDO_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, [...ROLES_TALLAS_PEDIDO]);
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams;
  let empresa = (q.get("empresa") ?? "").trim();
  let tipo: TipoDocumento = q.get("tipo") === "factura" ? "factura" : "pedido";
  const escrito = q.get("pedido") ?? "";
  let id = empresa ? idDelPedido(q.get("id") ?? "") : idDelPedido(escrito);
  if ((empresa && !(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa)) || id === null) {
    return NextResponse.json({ error: "Escribe el número de pedido o factura" }, { status: 400 });
  }

  try {
    if (!empresa) {
      const opciones = juntarEncontrados(...(await Promise.all([buscarPedido(escrito), buscarFactura(escrito)])));
      if (opciones.length === 0) return NextResponse.json({ error: "No se encontró ese pedido ni esa factura en ninguna empresa" }, { status: 404 });
      if (opciones.length > 1) return NextResponse.json({ opciones });
      ({ empresa, id, tipo } = opciones[0]);
    }
    const pedido = tipo === "factura" ? await leerFactura(empresa, id) : await leerPedido(empresa, id);
    if (!pedido) {
      const error = tipo === "factura" ? "Esa factura todavía no tiene renglones cargados" : "No se encontró ese pedido en Switch";
      return NextResponse.json({ error }, { status: 404 });
    }
    const despachos = await leerTallasDeDespacho(empresa, pedido.lineas.map((l) => l.codigo));
    const { filas, resumen } = armarTallasDelPedido(pedido.lineas, despachos);
    return NextResponse.json({
      tipo,
      empresa,
      pedido: { secuencial: pedido.secuencial, cliente: pedido.cliente },
      filas,
      resumen,
      hoy: hoyPanama(),
    });
  } catch (e) {
    console.error("[tallas-pedido]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el pedido o la factura. Intenta de nuevo." }, { status: 500 });
  }
}
