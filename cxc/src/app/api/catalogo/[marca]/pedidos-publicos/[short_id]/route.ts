// Admin de un pedido del link (cfg.publicosTable): soft-delete + edición de
// items. CATALOGO_ADMIN_ROLES (admin + secretaria). El total se recalcula con
// la fórmula de la marca.
//
// Antes del 27-jul-2026 esto era solo-admin y quedaba INCONSISTENTE con el
// resto del tab Pedidos, donde la secretaria ya borraba lo mismo: el borrado
// MASIVO (`orders/bulk-delete`, fuente="publicos") la acepta, y "Editar del
// link" convierte el pedido a <marca>_orders —cuyo PUT/DELETE también la
// acepta— así que la capacidad ya existía por el camino largo. Con el botón
// "Administrar" visible para secretaria, el borrado individual habría sido el
// único de la pantalla que le respondía 403.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { catalogoAdminRoles } from "@/lib/catalogo/roles";

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

  const auth = requireRole(req, catalogoAdminRoles());
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

  const auth = requireRole(req, catalogoAdminRoles());
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
