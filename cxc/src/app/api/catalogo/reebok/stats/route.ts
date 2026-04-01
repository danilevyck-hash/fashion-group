import { NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";

export async function GET() {
  // Products summary
  const { data: products } = await reebokServer
    .from("products")
    .select("id, active, price, category, on_sale");

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
  const { data: inventory } = await reebokServer
    .from("inventory")
    .select("product_id, quantity");

  const totalStock = (inventory || []).reduce((s, i) => s + (i.quantity || 0), 0);
  const productsWithStock = new Set((inventory || []).filter((i) => i.quantity > 0).map((i) => i.product_id)).size;
  const productsNoStock = activeProducts - productsWithStock;

  // Orders summary
  const { data: orders } = await reebokServer
    .from("reebok_orders")
    .select("id, status, total, client_name, vendor_name, created_at")
    .order("created_at", { ascending: false });

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
