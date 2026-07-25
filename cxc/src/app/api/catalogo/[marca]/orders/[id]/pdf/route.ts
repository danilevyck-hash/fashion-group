// GET /api/catalogo/[marca]/orders/[id]/pdf — PDF del pedido DIRECTO en el
// navegador (Content-Disposition inline): desde el visor de iOS el usuario
// comparte por WhatsApp/mail con el share nativo. Lo usa el botón "Ver PDF"
// de la confirmación del checkout.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { buildCatalogoOrderPdf, type PdfOrderItem } from "@/lib/catalogo/order-pdf";

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
  const { data: prods } = await db
    .from(cfg.productsTable)
    .select("id, category")
    .in("id", rawItems.map((i) => i.product_id));
  const categoryMap = new Map((prods || []).map((p) => [String(p.id), p.category as string]));

  const items: PdfOrderItem[] = rawItems.map((i) => ({
    sku: String(i.sku ?? ""),
    name: String(i.name ?? ""),
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
    image_url: String(i.image_url ?? ""),
    is_preorder: i.is_preorder === true,
    category: categoryMap.get(String(i.product_id)) || cfg.pdfFallbackCategory,
  }));

  const pdf = await buildCatalogoOrderPdf({
    marca: cfg.marca,
    orderNumber: String(row.order_number),
    clientName: String(row.client_name ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    items,
    bultoSize: cfg.bultoSize,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Pedido-${row.order_number}-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
