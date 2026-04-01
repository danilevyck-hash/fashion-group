import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { reebokServer } from "@/lib/reebok-supabase-server";

const BASE_SYSTEM_PROMPT = `Eres el asistente de inteligencia de negocios de Fashion Group Panamá, un grupo de distribución de moda.

## Empresas del Grupo
1. Vistana — distribuye Calvin Klein
2. Fashion Wear — ropa de moda
3. Fashion Shoes — calzado de moda
4. Active Shoes — calzado deportivo
5. Active Wear — distribuye Reebok
6. Joystep — distribuye Joybees
7. Confecciones Boston — confección
8. Multifashion — multimarca

## Sistema
- Este sistema se llama "Fashion Group" (fashiongr.com)
- ERP externo: Switch Soft (solo se usa para importar CSVs de ventas e inventario — NO es el sistema principal)
- Año fiscal: calendario (enero–diciembre)
- Módulos: CxC (cuentas por cobrar), Ventas, Guías de despacho, Reclamos, Cheques, Caja Menuda, Préstamos a empleados, Directorio de clientes, Catálogo Reebok, Camisetas Selección

## Tu rol
- Ayudas a todos los usuarios del sistema a entender datos de ventas, cuentas por cobrar, reclamos, cheques, guías, préstamos, caja menuda, catálogo Reebok y operaciones generales.
- Respondes en español.
- Sé conciso y directo.
- Si no tienes datos específicos, dilo claramente en vez de inventar.
- Cuando la respuesta incluya datos comparativos de múltiples empresas, clientes o períodos, SIEMPRE formatear como tabla Markdown con columnas alineadas. Ejemplo: ventas por empresa, CxC por empresa, cheques pendientes por cliente.
- Usa bullets para listas simples, tablas para comparaciones.
- Cuando cites cifras, siempre indica que son datos del sistema actualizados a la fecha mostrada.
- Si no puedes responder algo o la consulta requiere cambios técnicos, di: "Para esta consulta, contacta al técnico del sistema: Daniel Levy".

## Alertas automáticas
Analiza los datos del sistema y si detectas alguna de estas situaciones, menciónalo proactivamente al inicio de tu respuesta:
- CxC vencida > 30% del total → "⚠️ Atención: la cartera vencida supera el 30%"
- Cheques vencidos sin depositar → "⚠️ Hay cheques vencidos pendientes de depósito"
- Reclamos sin resolver > 45 días → "⚠️ Hay reclamos sin resolver por más de 45 días"
- Guías pendientes > 5 días → "⚠️ Hay guías pendientes hace más de 5 días"
Solo menciona alertas relevantes a la pregunta del usuario.`;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T>(query: PromiseLike<{ data: T | null }>): Promise<T> {
  try {
    const r = await query;
    return (r.data ?? []) as T;
  } catch {
    return [] as unknown as T;
  }
}

async function buildSystemData(): Promise<string> {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" });
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, now.getMonth(), 1).toISOString();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  // All queries in parallel
  const [
    cxcRows, cxcUploads,
    ventasThisYear, ventasMetas, ventasRaw,
    reclamos,
    cheques,
    guias,
    directorio,
    prestEmpleados,
    cajaPeriodos,
    reebokProducts, reebokInventory, reebokOrders,
    camisetasProductos, camisetasPedidos, camisetasClientes,
  ] = await Promise.all([
    // CxC
    safe(supabaseServer.from("cxc_rows").select("company_key, nombre_normalized, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365")),
    safe(supabaseServer.from("cxc_uploads").select("uploaded_at, company_key").order("uploaded_at", { ascending: false }).limit(5)),
    // Ventas
    safe(supabaseServer.from("ventas_mensuales").select("empresa, mes, ventas_brutas, notas_credito, costo_total").eq("año", year)),
    safe(supabaseServer.from("ventas_metas").select("empresa, mes, meta").eq("anio", year)),
    // Facturas recientes
    safe(supabaseServer.from("ventas_raw").select("fecha, tipo, n_sistema, n_fiscal, cliente, vendedor, subtotal, total, utilidad, empresa").order("fecha", { ascending: false }).limit(50)),
    // Reclamos
    safe(supabaseServer.from("reclamos").select("id, empresa, proveedor, marca, estado, fecha_reclamo, created_at, reclamo_items(cantidad, precio_unitario)").order("created_at", { ascending: false })),
    // Cheques
    safe(supabaseServer.from("cheques").select("id, cliente, empresa, monto, fecha_deposito, estado")),
    // Guías
    safe(supabaseServer.from("guia_transporte").select("id, numero, fecha, transportista, estado, monto_total, guia_items(bultos, cliente)").order("numero", { ascending: false })),
    // Directorio
    safe(supabaseServer.from("directorio_clientes").select("id, nombre, empresa")),
    // Préstamos
    safe(supabaseServer.from("prestamos_empleados").select("id, nombre, empresa, deduccion_quincenal, activo, prestamos_movimientos(tipo, monto)").eq("activo", true)),
    // Caja menuda
    safe(supabaseServer.from("caja_periodos").select("id, numero, estado, fondo_inicial, fecha_apertura, fecha_cierre, caja_gastos(total, categoria, empresa)").order("numero", { ascending: false }).limit(5)),
    // Reebok
    safe(reebokServer.from("products").select("id, active, price, category, on_sale, name")),
    safe(reebokServer.from("inventory").select("product_id, quantity")),
    safe(reebokServer.from("reebok_orders").select("id, status, total, client_name, vendor_name, created_at").order("created_at", { ascending: false })),
    // Camisetas
    safe(supabaseServer.from("camisetas_productos").select("id, genero, color, talla, stock")),
    safe(supabaseServer.from("camisetas_pedidos").select("id, cliente_id, cantidad, talla, genero, created_at")),
    safe(supabaseServer.from("camisetas_clientes").select("id, nombre")),
  ]);

  let block = `\n\n## Datos actuales del sistema (${fecha})`;

  // ── CxC ──
  {
    let totalCxc = 0, corriente = 0, vigilancia = 0, vencido = 0;
    const empresaCxc: Record<string, { total: number; vencido: number }> = {};
    const criticalClients = new Set<string>();
    for (const r of cxcRows) {
      const total = Number(r.total) || 0;
      const cur = (Number(r.d0_30) || 0) + (Number(r.d31_60) || 0) + (Number(r.d61_90) || 0);
      const watch = Number(r.d91_120) || 0;
      const over = (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0);
      totalCxc += total; corriente += cur; vigilancia += watch; vencido += over;
      if (over > 0) criticalClients.add(r.nombre_normalized);
      const ck = r.company_key || "otro";
      if (!empresaCxc[ck]) empresaCxc[ck] = { total: 0, vencido: 0 };
      empresaCxc[ck].total += total;
      empresaCxc[ck].vencido += over;
    }
    const empresas = new Set(cxcRows.map((r: { company_key: string }) => r.company_key));
    block += `\n### CxC (Cuentas por Cobrar)
- Total cartera: $${fmt(totalCxc)} (${empresas.size} empresas)
- Corriente (0-90 días): ${totalCxc > 0 ? Math.round((corriente / totalCxc) * 100) : 0}% ($${fmt(corriente)})
- Vigilancia (91-120 días): ${totalCxc > 0 ? Math.round((vigilancia / totalCxc) * 100) : 0}% ($${fmt(vigilancia)})
- Vencida (>120 días): ${totalCxc > 0 ? Math.round((vencido / totalCxc) * 100) : 0}% ($${fmt(vencido)})
- Clientes críticos (saldo vencido >120d): ${criticalClients.size}`;
    // Per-company
    const sorted = Object.entries(empresaCxc).sort((a, b) => b[1].total - a[1].total);
    if (sorted.length > 0) {
      block += `\n- CxC por empresa:`;
      for (const [emp, d] of sorted) {
        block += `\n  - ${emp}: total $${fmt(d.total)}, vencida $${fmt(d.vencido)}`;
      }
    }
    if (cxcUploads[0]) {
      block += `\n- Última carga CxC: ${cxcUploads[0].company_key} el ${new Date(cxcUploads[0].uploaded_at).toLocaleDateString("es-PA")}`;
    }
  }

  // ── Ventas ──
  {
    const ventasPorEmpresa: Record<string, Record<number, { brutas: number; nc: number; costo: number }>> = {};
    for (const v of ventasThisYear) {
      if (!ventasPorEmpresa[v.empresa]) ventasPorEmpresa[v.empresa] = {};
      ventasPorEmpresa[v.empresa][v.mes] = {
        brutas: Number(v.ventas_brutas) || 0,
        nc: Number(v.notas_credito) || 0,
        costo: Number(v.costo_total) || 0,
      };
    }
    const metasPorEmpresa: Record<string, Record<number, number>> = {};
    for (const m of ventasMetas) {
      if (!metasPorEmpresa[m.empresa]) metasPorEmpresa[m.empresa] = {};
      metasPorEmpresa[m.empresa][m.mes] = Number(m.meta) || 0;
    }

    let totalMesActual = 0, totalMesAnterior = 0, totalAnio = 0, totalMetaMes = 0;
    for (const [, meses] of Object.entries(ventasPorEmpresa)) {
      for (const [mesStr, d] of Object.entries(meses)) {
        const netas = d.brutas - d.nc;
        totalAnio += netas;
        if (Number(mesStr) === month) totalMesActual += netas;
        if (Number(mesStr) === month - 1) totalMesAnterior += netas;
      }
    }
    for (const [, meses] of Object.entries(metasPorEmpresa)) {
      if (meses[month]) totalMetaMes += meses[month];
    }

    block += `\n### Ventas ${year}
- Ventas netas mes actual (mes ${month}): $${fmt(totalMesActual)}${totalMetaMes > 0 ? ` / meta: $${fmt(totalMetaMes)} (${Math.round((totalMesActual / totalMetaMes) * 100)}%)` : ""}
- Ventas mes anterior: $${fmt(totalMesAnterior)}
- Acumulado año: $${fmt(totalAnio)}`;

    // Per company this month
    const empThisMonth = Object.entries(ventasPorEmpresa)
      .map(([emp, meses]) => ({ emp, netas: meses[month] ? meses[month].brutas - meses[month].nc : 0, meta: metasPorEmpresa[emp]?.[month] || 0 }))
      .filter(e => e.netas !== 0 || e.meta !== 0)
      .sort((a, b) => b.netas - a.netas);
    if (empThisMonth.length > 0) {
      block += `\n- Ventas este mes por empresa:`;
      for (const e of empThisMonth) {
        block += `\n  - ${e.emp}: $${fmt(e.netas)}${e.meta > 0 ? ` (meta: $${fmt(e.meta)}, ${Math.round((e.netas / e.meta) * 100)}%)` : ""}`;
      }
    }
  }

  // ── Reclamos ──
  {
    const abiertos = reclamos.filter((r: { estado: string }) => r.estado !== "Cerrado" && r.estado !== "Resuelto");
    const viejos = abiertos.filter((r: { created_at: string }) => r.created_at < thirtyDaysAgo);
    const resueltosEsteMes = reclamos.filter((r: { estado: string; created_at: string }) => (r.estado === "Cerrado" || r.estado === "Resuelto") && r.created_at >= monthStart);
    const creadosEsteMes = reclamos.filter((r: { created_at: string }) => r.created_at >= monthStart);

    // Monto total reclamos abiertos
    let montoAbiertos = 0;
    for (const r of abiertos) {
      for (const item of (r.reclamo_items || [])) {
        montoAbiertos += (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
      }
    }

    // Por estado
    const porEstado: Record<string, number> = {};
    for (const r of reclamos) porEstado[r.estado || "sin estado"] = (porEstado[r.estado || "sin estado"] || 0) + 1;

    // Por empresa
    const porEmpresa: Record<string, number> = {};
    for (const r of abiertos) porEmpresa[r.empresa || "otro"] = (porEmpresa[r.empresa || "otro"] || 0) + 1;

    // Por proveedor
    const porProveedor: Record<string, number> = {};
    for (const r of abiertos) if (r.proveedor) porProveedor[r.proveedor] = (porProveedor[r.proveedor] || 0) + 1;

    block += `\n### Reclamos a Proveedores
- Total reclamos: ${reclamos.length}
- Abiertos: ${abiertos.length} (monto: $${fmt(montoAbiertos)})${viejos.length > 0 ? ` — ${viejos.length} con más de 30 días` : ""}
- Creados este mes: ${creadosEsteMes.length}
- Resueltos este mes: ${resueltosEsteMes.length}
- Por estado: ${Object.entries(porEstado).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    if (Object.keys(porEmpresa).length > 0) {
      block += `\n- Abiertos por empresa: ${Object.entries(porEmpresa).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }
    if (Object.keys(porProveedor).length > 0) {
      block += `\n- Abiertos por proveedor: ${Object.entries(porProveedor).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }
  }

  // ── Cheques ──
  {
    const pendientes = cheques.filter((c: { estado: string }) => c.estado === "pendiente");
    const totalPendiente = pendientes.reduce((s: number, c: { monto: number }) => s + (Number(c.monto) || 0), 0);
    const vencenSemana = pendientes.filter((c: { fecha_deposito: string }) => c.fecha_deposito <= weekFromNow && c.fecha_deposito >= today);
    const vencenHoy = pendientes.filter((c: { fecha_deposito: string }) => c.fecha_deposito === today);
    const vencidos = pendientes.filter((c: { fecha_deposito: string }) => c.fecha_deposito < today);

    // Por empresa
    const chqEmpresa: Record<string, { count: number; monto: number }> = {};
    for (const c of pendientes) {
      const emp = c.empresa || "otro";
      if (!chqEmpresa[emp]) chqEmpresa[emp] = { count: 0, monto: 0 };
      chqEmpresa[emp].count++;
      chqEmpresa[emp].monto += Number(c.monto) || 0;
    }

    block += `\n### Cheques Posfechados
- Total cheques: ${cheques.length} (pendientes: ${pendientes.length})
- Monto pendiente: $${fmt(totalPendiente)}
- Vencen esta semana: ${vencenSemana.length}${vencenHoy.length > 0 ? ` (${vencenHoy.length} hoy)` : ""}
- Ya vencidos sin depositar: ${vencidos.length}`;
    if (Object.keys(chqEmpresa).length > 0) {
      block += `\n- Por empresa: ${Object.entries(chqEmpresa).sort((a, b) => b[1].monto - a[1].monto).map(([k, v]) => `${k}: ${v.count} cheques, $${fmt(v.monto)}`).join("; ")}`;
    }
  }

  // ── Guías ──
  {
    const guiasEsteMes = guias.filter((g: { fecha: string }) => g.fecha >= monthStart.slice(0, 10));
    const porEstado: Record<string, number> = {};
    for (const g of guias) porEstado[g.estado || "sin estado"] = (porEstado[g.estado || "sin estado"] || 0) + 1;
    const montoEsteMes = guiasEsteMes.reduce((s: number, g: { monto_total: number }) => s + (Number(g.monto_total) || 0), 0);
    const totalBultos = guiasEsteMes.reduce((s: number, g: { guia_items?: { bultos: number }[] }) =>
      s + ((g.guia_items || []).reduce((ss: number, i: { bultos: number }) => ss + (i.bultos || 0), 0)), 0);

    block += `\n### Guías de Transporte
- Total guías: ${guias.length}
- Este mes: ${guiasEsteMes.length} (monto: $${fmt(montoEsteMes)}, ${fmtInt(totalBultos)} bultos)
- Por estado: ${Object.entries(porEstado).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
  }

  // ── Directorio ──
  {
    const porEmpresa: Record<string, number> = {};
    for (const c of directorio) porEmpresa[c.empresa || "sin empresa"] = (porEmpresa[c.empresa || "sin empresa"] || 0) + 1;
    block += `\n### Directorio de Clientes
- Total clientes: ${directorio.length}`;
    if (Object.keys(porEmpresa).length > 0 && Object.keys(porEmpresa).length <= 15) {
      block += `\n- Por empresa: ${Object.entries(porEmpresa).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }
  }

  // ── Préstamos ──
  {
    let totalPrestado = 0, totalPagado = 0;
    for (const emp of prestEmpleados) {
      for (const mov of (emp.prestamos_movimientos || [])) {
        if (mov.tipo === "prestamo") totalPrestado += Number(mov.monto) || 0;
        else totalPagado += Number(mov.monto) || 0;
      }
    }
    const saldoPendiente = totalPrestado - totalPagado;
    block += `\n### Préstamos a Colaboradores
- Empleados con préstamo activo: ${prestEmpleados.length}
- Total prestado: $${fmt(totalPrestado)}
- Total pagado: $${fmt(totalPagado)}
- Saldo pendiente: $${fmt(saldoPendiente)}`;
    if (prestEmpleados.length > 0 && prestEmpleados.length <= 20) {
      block += `\n- Detalle:`;
      for (const emp of prestEmpleados) {
        let prest = 0, pag = 0;
        for (const m of (emp.prestamos_movimientos || [])) {
          if (m.tipo === "prestamo") prest += Number(m.monto) || 0;
          else pag += Number(m.monto) || 0;
        }
        block += `\n  - ${emp.nombre}${emp.empresa ? ` (${emp.empresa})` : ""}: saldo $${fmt(prest - pag)}, deduce $${fmt(Number(emp.deduccion_quincenal) || 0)}/quinc`;
      }
    }
  }

  // ── Caja Menuda ──
  {
    const abierta = cajaPeriodos.find((p: { estado: string }) => p.estado === "abierto");
    block += `\n### Caja Menuda`;
    if (abierta) {
      const gastado = (abierta.caja_gastos || []).reduce((s: number, g: { total: number }) => s + (Number(g.total) || 0), 0);
      const disponible = (Number(abierta.fondo_inicial) || 0) - gastado;
      // Por categoría
      const porCat: Record<string, number> = {};
      for (const g of (abierta.caja_gastos || [])) porCat[g.categoria || "Varios"] = (porCat[g.categoria || "Varios"] || 0) + (Number(g.total) || 0);

      block += `\n- Período activo: #${abierta.numero} (abierto ${abierta.fecha_apertura})
- Fondo: $${fmt(Number(abierta.fondo_inicial) || 0)}
- Gastado: $${fmt(gastado)} — Disponible: $${fmt(disponible)}
- ${(abierta.caja_gastos || []).length} gastos registrados`;
      if (Object.keys(porCat).length > 0) {
        block += `\n- Por categoría: ${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: $${fmt(v)}`).join(", ")}`;
      }
    } else {
      block += `\n- No hay período abierto`;
    }
    if (cajaPeriodos.length > 1) {
      block += `\n- Últimos períodos cerrados: ${cajaPeriodos.filter((p: { estado: string }) => p.estado !== "abierto").slice(0, 3).map((p: { numero: number; fecha_apertura: string; fecha_cierre: string }) => `#${p.numero} (${p.fecha_apertura} a ${p.fecha_cierre || "?"})`).join(", ")}`;
    }
  }

  // ── Reebok ──
  {
    const activeProducts = reebokProducts.filter((p: { active: boolean }) => p.active);
    const onSale = reebokProducts.filter((p: { on_sale: boolean }) => p.on_sale).length;
    const totalStock = reebokInventory.reduce((s: number, i: { quantity: number }) => s + (i.quantity || 0), 0);
    const productsWithStock = new Set(reebokInventory.filter((i: { quantity: number }) => i.quantity > 0).map((i: { product_id: string }) => i.product_id)).size;

    // Categories
    const cats: Record<string, number> = {};
    for (const p of activeProducts) cats[p.category || "sin categoría"] = (cats[p.category || "sin categoría"] || 0) + 1;

    // Orders
    const ordersThisMonth = reebokOrders.filter((o: { created_at: string }) => o.created_at >= monthStart);
    const ordersThisMonthTotal = ordersThisMonth.reduce((s: number, o: { total: number }) => s + (Number(o.total) || 0), 0);
    const ordersByStatus: Record<string, number> = {};
    for (const o of reebokOrders) ordersByStatus[o.status || "borrador"] = (ordersByStatus[o.status || "borrador"] || 0) + 1;

    // Top clients
    const clientMap: Record<string, { count: number; total: number }> = {};
    for (const o of reebokOrders) {
      const name = o.client_name || "desconocido";
      if (!clientMap[name]) clientMap[name] = { count: 0, total: 0 };
      clientMap[name].count++;
      clientMap[name].total += Number(o.total) || 0;
    }
    const topClients = Object.entries(clientMap).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

    block += `\n### Catálogo Reebok
- Productos: ${activeProducts.length} activos de ${reebokProducts.length} total${onSale > 0 ? `, ${onSale} en oferta` : ""}
- Stock total: ${fmtInt(totalStock)} unidades (${productsWithStock} productos con stock, ${Math.max(0, activeProducts.length - productsWithStock)} sin stock)
- Categorías: ${Object.entries(cats).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Pedidos totales: ${reebokOrders.length}
- Pedidos este mes: ${ordersThisMonth.length} por $${fmt(ordersThisMonthTotal)}
- Por estado: ${Object.entries(ordersByStatus).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    if (topClients.length > 0) {
      block += `\n- Top clientes:`;
      for (const [name, d] of topClients) {
        block += `\n  - ${name}: ${d.count} pedido${d.count !== 1 ? "s" : ""}, $${fmt(d.total)}`;
      }
    }
  }

  // ── Camisetas Selección ──
  {
    const totalProductos = camisetasProductos.length;
    const totalStock = camisetasProductos.reduce((s: number, p: { stock: number }) => s + (Number(p.stock) || 0), 0);
    const totalPedidos = camisetasPedidos.length;
    const pedidosEsteMes = camisetasPedidos.filter((p: { created_at: string }) => p.created_at >= monthStart);
    const totalClientes = camisetasClientes.length;

    if (totalProductos > 0 || totalPedidos > 0) {
      block += `\n### Camisetas Selección
- Productos: ${totalProductos}, stock total: ${fmtInt(totalStock)} unidades
- Clientes registrados: ${totalClientes}
- Pedidos totales: ${totalPedidos}${pedidosEsteMes.length > 0 ? ` (${pedidosEsteMes.length} este mes)` : ""}`;
    }
  }

  // ── Últimas facturas ──
  if (ventasRaw.length > 0) {
    block += `\n### Últimas ${ventasRaw.length} facturas`;
    for (const v of ventasRaw.slice(0, 50)) {
      block += `\n- ${v.fecha || "?"} | ${v.tipo || "?"} ${v.n_fiscal || v.n_sistema || ""} | ${v.cliente || "?"} | ${v.empresa || "?"} | vendedor: ${v.vendedor || "?"} | $${fmt(Number(v.total) || 0)}${Number(v.utilidad) ? ` (util: $${fmt(Number(v.utilidad))})` : ""}`;
    }
  }

  return block;
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key no configurada" }, { status: 500 });
    }

    const systemData = await buildSystemData();

    // #4: Enrich with specific client/entity data
    let clientContext = "";
    const msgLower = message.toLowerCase();

    // Detect client-related queries
    const clientPatterns = [
      /(?:cliente|cuenta de|saldo de|deuda de|factur\w+ (?:de|a|para))\s+[""""]?([A-ZÁ-Úa-zá-ú][A-ZÁ-Úa-zá-ú\s&.'-]{2,})/i,
      /(?:city|mall|jerusalem|golden|plaza|kheriddine|bouti|outlet|sporting|frontera|multifashion|fashion|boston)[A-ZÁ-Úa-zá-ú\s&.'-]*/i,
    ];

    let searchTerm = "";
    for (const pattern of clientPatterns) {
      const m = message.match(pattern);
      if (m) { searchTerm = (m[1] || m[0]).trim(); break; }
    }

    if (searchTerm && searchTerm.length >= 3) {
      const term = searchTerm.toUpperCase();

      // Search CxC
      let { data: cxcMatches } = await supabaseServer
        .from("cxc_rows")
        .select("company_key, nombre_normalized, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365")
        .ilike("nombre_normalized", `%${term}%`)
        .limit(5);

      // Fallback: split into words and search by longest word
      if (!cxcMatches || cxcMatches.length === 0) {
        const words = term.split(/\s+/).filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
        for (const word of words) {
          const { data } = await supabaseServer
            .from("cxc_rows")
            .select("company_key, nombre_normalized, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365")
            .ilike("nombre_normalized", `%${word}%`)
            .limit(5);
          if (data && data.length > 0) { cxcMatches = data; break; }
        }
      }

      if (cxcMatches && cxcMatches.length > 0) {
        clientContext += `\n\n## Búsqueda: "${searchTerm}" — ${cxcMatches.length} resultado(s) en CxC`;
        for (const r of cxcMatches.slice(0, 3)) {
          const vencido = (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0);
          clientContext += `\n- ${r.nombre_normalized} (${r.company_key}): total $${fmt(Number(r.total) || 0)}, 0-30d $${fmt(Number(r.d0_30) || 0)}, 31-60d $${fmt(Number(r.d31_60) || 0)}, 61-90d $${fmt(Number(r.d61_90) || 0)}, 91-120d $${fmt(Number(r.d91_120) || 0)}, vencido $${fmt(vencido)}`;
        }
      }

      // Search reclamos
      const { data: reclamoMatches } = await supabaseServer
        .from("reclamos")
        .select("id, empresa, nro_reclamo, estado, fecha_reclamo")
        .or(`empresa.ilike.%${term}%`)
        .limit(3);
      if (reclamoMatches && reclamoMatches.length > 0) {
        clientContext += `\n\n## Reclamos relacionados con "${searchTerm}"`;
        for (const r of reclamoMatches) {
          clientContext += `\n- ${r.nro_reclamo} (${r.empresa}): estado ${r.estado}, fecha ${r.fecha_reclamo}`;
        }
      }

      // Search facturas
      const { data: facturaMatches } = await supabaseServer
        .from("ventas_raw")
        .select("fecha, tipo, n_fiscal, cliente, empresa, vendedor, total")
        .ilike("cliente", `%${term}%`)
        .order("fecha", { ascending: false })
        .limit(5);
      if (facturaMatches && facturaMatches.length > 0) {
        clientContext += `\n\n## Facturas recientes de "${searchTerm}"`;
        for (const v of facturaMatches) {
          clientContext += `\n- ${v.fecha} | ${v.tipo} ${v.n_fiscal || ""} | ${v.empresa} | vendedor: ${v.vendedor || "?"} | $${fmt(Number(v.total) || 0)}`;
        }
      }
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + systemData + clientContext;

    const client = new Anthropic({ apiKey });

    const messages: Anthropic.MessageParam[] = [
      ...(Array.isArray(history) ? history : []),
      { role: "user" as const, content: message },
    ];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Error en streaming" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
