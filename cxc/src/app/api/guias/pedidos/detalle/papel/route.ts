/**
 * EL PAPEL DEL PEDIDO, DIBUJADO EN EL SERVIDOR
 * (6-oct-2026, `PEDIDOS_BULTOS_2026_10`).
 *
 *   GET ?empresa_key=&pedido_switch_id=  → el PDF
 *
 * 🔴 POR QUÉ EN EL SERVIDOR Y NO EN EL NAVEGADOR, como los demás papeles de la
 * casa: Daniel decidió el 6-oct-2026 que **bodega no ve Precio ni Total** y que
 * al mismo tiempo **el papel SIEMPRE los lleva, lo imprima quien lo imprima**.
 * Las dos cosas solo se cumplen a la vez si los números entran al PDF sin pasar
 * por el navegador de bodega: si el papel se armara en el cliente, para
 * dibujarlos habría que mandárselos, y entonces «no los ve» sería mentira —
 * estarían a dos toques en las herramientas del navegador.
 *
 * Así que esta ruta lee las líneas CON plata (`conPlata = true`, siempre) y
 * devuelve el PDF ya hecho. Quien lo pide solo recibe el papel.
 *
 * 🔴 La EMPRESA la decide el servidor (`veLaEmpresa`): un pedido de una empresa
 * que esta persona no ve contesta 404, igual que el resto del módulo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { PEDIDOS_BULTOS_2026_10, veLaEmpresa } from "@/lib/guias/pedidos-bultos";
import { PEDIDOS_VER_ROLES } from "@/lib/guias/pedidos-bodega";
import { leerLineas } from "@/lib/guias/pedido-detalle-server";
import { construirPdfPedidoBultos } from "@/lib/guias/pdf-pedido-bultos";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!PEDIDOS_BULTOS_2026_10) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams;
  const empresa = (q.get("empresa_key") ?? "").trim();
  const id = Number(q.get("pedido_switch_id"));
  if (!empresa || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (!veLaEmpresa(empresa, auth.userName, auth.role)) {
    return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
  }

  const { data: pedido } = await supabaseServer
    .from("switch_pedidos")
    .select("empresa_key, pedido_switch_id, secuencial, cliente_nombre")
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", id)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });

  // Las dos firmas, si la migración ya corrió. Falla ABIERTA: sin ellas el pie
  // simplemente no se dibuja.
  const { data: estado } = await supabaseServer
    .from("pedidos_bodega_estado")
    .select("preparado_por, preparado_en, verificado_por, verificado_en")
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", id)
    .maybeSingle();

  try {
    // 🔴 SIEMPRE con plata: es la regla del papel.
    const { lineas } = await leerLineas(empresa, id, true);
    const doc = construirPdfPedidoBultos({
      secuencial: pedido.secuencial,
      empresa: nombreCortoEmpresa(pedido.empresa_key),
      cliente: pedido.cliente_nombre,
      lineas,
      firmas: estado
        ? {
            preparado_por: estado.preparado_por ?? null,
            preparado_en: estado.preparado_en ?? null,
            verificado_por: estado.verificado_por ?? null,
            verificado_en: estado.verificado_en ?? null,
          }
        : undefined,
    });
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bultos-${pedido.secuencial}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo preparar el papel" }, { status: 500 });
  }
}
