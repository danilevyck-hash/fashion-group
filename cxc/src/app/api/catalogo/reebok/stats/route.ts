import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  // ⚠️ PAGINADO (26-jul-2026): las tres lecturas de abajo se cortaban en 1.000
  // filas SIN error y alimentan números que se muestran en pantalla (total de
  // productos, stock total, total de pedidos). Un conteo hecho sobre una lectura
  // truncada no es un conteo. Ahora se leen completas y verificadas contra el
  // COUNT exacto; si no cuadra, revienta en vez de mostrar un número inventado.
  //
  // Products summary
  type FilaProducto = { id: number; active: boolean; price: number | null; category: string | null; on_sale: boolean | null };
  const products = await leerTodoPaginado<FilaProducto>(
    "products (stats Reebok)",
    (pedirCount, desde, hasta) =>
      reebokServer
        .from("products")
        .select("id, active, price, category, on_sale", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(desde, hasta),
  );

  const totalProducts = products?.length ?? 0;
  const activeProducts = products?.filter((p) => p.active).length ?? 0;
  const onSale = products?.filter((p) => p.on_sale).length ?? 0;

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const p of products || []) {
    if (p.active) {
      categories[p.category || "sin categoría"] = (categories[p.category || "sin categoría"] || 0) + 1;
    }
  }

  // Inventory summary
  type FilaInv = { product_id: number; quantity: number | null };
  const inventory = await leerTodoPaginado<FilaInv>(
    "inventory (stats Reebok)",
    (pedirCount, desde, hasta) =>
      reebokServer
        .from("inventory")
        .select("product_id, quantity", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(desde, hasta),
  );

  const totalStock = (inventory || []).reduce((s, i) => s + (i.quantity || 0), 0);
  const productsWithStock = new Set((inventory || []).filter((i) => (i.quantity ?? 0) > 0).map((i) => i.product_id)).size;
  const productsNoStock = activeProducts - productsWithStock;

  // Orders summary. El `.limit(5000)` de antes NO era el tope que decía ser: el
  // corte real lo ponía PostgREST en 1.000 y sin avisar. Se pagina de verdad,
  // conservando el orden de negocio (created_at desc) con `id` como desempate.
  // Si algún día el volumen justifica no traerlos a RAM, el camino sigue siendo
  // agregar en SQL/RPC — pero un tope silencioso no es una defensa.
  type FilaOrden = {
    id: number; status: string | null; total: number | null;
    client_name: string | null; vendor_name: string | null; created_at: string;
  };
  const orders = await leerTodoPaginado<FilaOrden>(
    "reebok_orders (stats Reebok)",
    (pedirCount, desde, hasta) =>
      reebokServer
        .from("reebok_orders")
        .select("id, status, total, client_name, vendor_name, created_at", pedirCount ? { count: "exact" } : {})
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(desde, hasta),
  );

  const totalOrders = orders?.length ?? 0;

  // Status breakdown
  const statusCount: Record<string, number> = {};
  const statusTotal: Record<string, number> = {};
  for (const o of orders || []) {
    const st = o.status || "borrador";
    statusCount[st] = (statusCount[st] || 0) + 1;
    statusTotal[st] = (statusTotal[st] || 0) + (o.total || 0);
  }

  // This month's orders
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ordersThisMonth = (orders || []).filter((o) => o.created_at >= monthStart);
  const ordersThisMonthTotal = ordersThisMonth.reduce((s, o) => s + (o.total || 0), 0);

  // Top clients (by order count)
  const clientOrders: Record<string, { count: number; total: number }> = {};
  for (const o of orders || []) {
    const name = o.client_name || "desconocido";
    if (!clientOrders[name]) clientOrders[name] = { count: 0, total: 0 };
    clientOrders[name].count++;
    clientOrders[name].total += o.total || 0;
  }
  const topClients = Object.entries(clientOrders)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, d]) => ({ name, orders: d.count, total: d.total }));

  return NextResponse.json({
    products: { total: totalProducts, active: activeProducts, onSale, noStock: productsNoStock > 0 ? productsNoStock : 0, categories },
    inventory: { totalStock, productsWithStock },
    orders: { total: totalOrders, thisMonth: ordersThisMonth.length, thisMonthTotal: ordersThisMonthTotal, byStatus: statusCount, totalByStatus: statusTotal, topClients },
  });
}
