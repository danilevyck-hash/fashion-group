/**
 * EL PAPEL DEL PEDIDO, DIBUJADO EN EL SERVIDOR, EN SUS DOS FORMAS
 * (6-oct-2026, `PEDIDOS_BULTOS_2026_10`).
 *
 *   GET ?empresa_key=&pedido_switch_id=&precios=si|no  → el PDF
 *
 * 🔴 DOS FORMAS, LAS DOS PARA TODOS (Daniel, 6-oct-2026): *«a veces el cliente
 * pide con precio y sin precio»*. Las dos las puede pedir cualquiera que entre
 * a Pedidos —bodega incluida—, porque el papel se arma acá: a su navegador no
 * le viaja ningún precio, ni cuando imprime la forma que sí los lleva.
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
  // Por omisión, con precios: es la forma de siempre.
  const conPrecios = q.get("precios") !== "no";
  if (!empresa || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (!veLaEmpresa(empresa, auth.userName, auth.role)) {
    return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
  }

  // 🔴 El pie del papel (Subtotal · ITBMS · Total) lo manda SWITCH; acá solo se
  // lee. `subtotal` e `impuesto` son columnas nuevas, así que esto FALLA
  // ABIERTO: si la migración todavía no corrió, se reintenta sin ellas y el
  // papel escribe solo lo que sabe, sin inventar un ITBMS.
  const pedido = await leerPedido(empresa, id);
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
      secuencial: String(pedido.secuencial ?? ""),
      empresa: nombreCortoEmpresa(pedido.empresa_key),
      cliente: pedido.cliente_nombre ?? "",
      conPrecios,
      lineas,
      deSwitch: { subtotal: pedido.subtotal, impuesto: pedido.impuesto, total: pedido.total },
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
        "Content-Disposition": `inline; filename="pedido-${pedido.secuencial}${conPrecios ? "" : "-sin-precios"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo preparar el papel" }, { status: 500 });
  }
}

/**
 * El pedido con su pie de Switch, tolerante a que la migración no haya corrido.
 * (Mismo patrón que `leerEstadoDeBodega`: pedir de más y reintentar, nunca
 * dejar la pantalla en 500 por una columna que todavía no existe.)
 */
async function leerPedido(empresa: string, id: number) {
  const base = "empresa_key, pedido_switch_id, secuencial, cliente_nombre, total";
  const pide = (cols: string) =>
    supabaseServer
      .from("switch_pedidos")
      .select(cols)
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", id)
      .maybeSingle();

  const conPie = await pide(`${base}, subtotal, impuesto`);
  const fila = (conPie.error ? (await pide(base)).data : conPie.data) as Record<string, unknown> | null;
  if (!fila) return null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    empresa_key: String(fila.empresa_key),
    secuencial: fila.secuencial as string | number | null,
    cliente_nombre: fila.cliente_nombre as string | null,
    subtotal: num(fila.subtotal),
    impuesto: num(fila.impuesto),
    total: num(fila.total),
  };
}
