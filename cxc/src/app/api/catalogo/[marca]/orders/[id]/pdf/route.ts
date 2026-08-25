// GET /api/catalogo/[marca]/orders/[id]/pdf — PDF del pedido DIRECTO en el
// navegador (Content-Disposition inline): desde el visor de iOS el usuario
// comparte por WhatsApp/mail con el share nativo. Lo usa el botón "Ver PDF"
// de la confirmación del checkout.

import { NextRequest, NextResponse } from "next/server";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { buildCatalogoOrderPdf, type PdfOrderItem } from "@/lib/catalogo/order-pdf";
import { palabraDelEnvioActivo } from "@/lib/catalogo/switch-lock";

/**
 * 🩸 «Cotización» LLEVA TILDE Y ESTO ES UN ENCABEZADO HTTP. Un `filename="…ó…"`
 * a secas viaja como latin-1 y el navegador baja "CotizaciÃ³n-TOM-027.pdf". La
 * forma correcta es la de RFC 6266: un `filename` en ASCII puro como respaldo
 * (para el navegador viejo) MÁS `filename*=UTF-8''…` percent-encoded, que es el
 * que ganan Chrome, Safari y Firefox. El acento no se pierde y nada se rompe.
 */
function contentDisposition(nombre: string): string {
  const ascii = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const db = await cfg.db();
  const itemCols = `product_id, sku, name, quantity, unit_price, image_url${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
  const { data: order, error } = await db
    .from(cfg.ordersTable)
    .select(`order_number, client_name, created_at, ${cfg.itemsRelation}(${itemCols})`)
    .eq("id", params.id)
    .single();
  if (error || !order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const row = order as unknown as Record<string, unknown>;
  const rawItems = (row[cfg.itemsRelation] ?? []) as Array<Record<string, unknown>>;
  const { categoryByProduct: categoryMap, bultoPzasByProduct } = await leerCategoriaYBulto(
    db as never,
    cfg.productsTable,
    rawItems.map((i) => String(i.product_id)),
  );

  const items: PdfOrderItem[] = rawItems.map((i) => ({
    sku: String(i.sku ?? ""),
    name: String(i.name ?? ""),
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
    image_url: String(i.image_url ?? ""),
    is_preorder: i.is_preorder === true,
    category: categoryMap.get(String(i.product_id)) || cfg.pdfFallbackCategory,
    bulto_pzas: bultoPzasByProduct.get(String(i.product_id)) ?? null,
  }));

  // 🔴 QUÉ PALABRA VA EN EL PAPEL. Este PDF es el del botón "Ver PDF" de la
  // confirmación, o sea el que se comparte por WhatsApp/mail con el visor de
  // iOS: es el papel que ve el cliente. Si el pedido salió a Switch como
  // COTIZACIÓN tiene que decirlo — el encabezado y el nombre del archivo. Si
  // todavía no salió, `null` y queda "Pedido", igual que antes de este cambio.
  const documentoLabel = (await palabraDelEnvioActivo(db, cfg.enviosTable, params.id)) ?? undefined;

  const pdf = await buildCatalogoOrderPdf({
    marca: cfg.marca,
    orderNumber: String(row.order_number),
    clientName: String(row.client_name ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    items,
    bultoSize: cfg.bultoSize,
    documentoLabel,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // El nombre del archivo es lo PRIMERO que se ve en WhatsApp o en el
      // correo, antes de abrirlo. Lleva la MISMA palabra que el encabezado.
      "Content-Disposition": contentDisposition(
        `${documentoLabel ?? "Pedido"}-${row.order_number}-${new Date().toISOString().slice(0, 10)}.pdf`,
      ),
      "Cache-Control": "no-store",
    },
  });
}
