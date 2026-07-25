// Admin de un pedido del link (cfg.publicosTable): soft-delete + edición de
// items. Solo admin. El total se recalcula con la fórmula de la marca.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

interface PedidoItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { marca: string; short_id: string } },
) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const short_id = params.short_id;
  if (!short_id) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  // Soft-delete (borrado VISUAL): no toca Switch, queda recuperable en DB. La
  // vista unificada excluye deleted=true → sale de la lista.
  const db = await cfg.publicosDb();
  const { error } = await db
    .from(cfg.publicosTable)
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq("short_id", short_id);

  if (error) {
    console.error(`Error deleting ${cfg.marca} pedido publico:`, error);
    return NextResponse.json({ error: "No se pudo borrar el pedido" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { marca: string; short_id: string } },
) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const short_id = params.short_id;
  if (!short_id) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "El pedido debe tener al menos un item" }, { status: 400 });
  }

  const items = body.items as PedidoItem[];
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }
    // Precio por unidad debe ser positivo (un negativo metería un total artificial).
    if (!(Number(item.unit_price) > 0)) {
      return NextResponse.json({ error: "El precio de cada producto debe ser mayor a cero" }, { status: 400 });
    }
  }

  const total = cfg.calcTotal(items);

  const db = await cfg.publicosDb();
  const { error } = await db
    .from(cfg.publicosTable)
    .update({ items, total })
    .eq("short_id", short_id);

  if (error) {
    console.error(`Error updating ${cfg.marca} pedido publico:`, error);
    return NextResponse.json({ error: "No se pudo actualizar el pedido" }, { status: 500 });
  }

  return NextResponse.json({ success: true, total });
}
