import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getVentasMensuales } from "@/lib/empresa-mapping";

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
- Cuando la respuesta incluya datos comparativos, SIEMPRE formatear como tabla Markdown.
- Usa bullets para listas simples, tablas para comparaciones.
- Cuando cites cifras, indica que son datos actualizados a la fecha mostrada.
- Si no puedes responder algo técnico: "Para esta consulta, contacta al técnico del sistema: Daniel Levy".

## Acciones que puedes ejecutar
Puedes ejecutar SOLO estas acciones. NUNCA crear registros nuevos (guías, reclamos, cheques, etc.) — solo cambiar estados de registros existentes.

Cuando el usuario pida algo que implique cambiar datos:
1. Busca el registro en los datos que tienes
2. Muestra un RESUMEN con los datos encontrados
3. Termina con: "¿Confirmo? (responde sí o no)"
4. NUNCA ejecutes sin confirmación explícita
5. Si te piden CREAR algo nuevo (guía, reclamo, cheque, gasto), responde: "Para crear registros nuevos, ve al módulo correspondiente en el dashboard."

Para indicar una acción pendiente, usa EXACTAMENTE este formato al final de tu respuesta (en una línea separada):
[ACTION:tipo|id|datos]

Acciones disponibles:
- [ACTION:despachar_guia|{id}|{numero}] — Solo si la guía está en "Pendiente Bodega"
- [ACTION:depositar_cheque|{id}|{cliente},{monto}] — Solo cheques en estado "pendiente"
- [ACTION:cambiar_estado_reclamo|{id}|{nuevo_estado}] — Solo reclamos existentes

IMPORTANTE: El {id} debe ser el UUID real del registro que aparece en los datos de búsqueda. Si no tienes el ID, NO propongas la acción.

## Alertas automáticas
Si detectas estas situaciones, menciónalo proactivamente:
- CxC vencida > 30% del total → "⚠️ Cartera vencida supera el 30%"
- Cheques vencidos sin depositar → "⚠️ Cheques vencidos pendientes"
- Reclamos sin resolver > 45 días → "⚠️ Reclamos viejos sin resolver"
- Guías pendientes > 5 días → "⚠️ Guías pendientes"

## Guía de uso del sistema
Si el usuario pregunta cómo hacer algo, explica paso a paso:
- Crear guía: Dashboard → Guías → Nueva Guía → Llenar fecha, transportista, entregado por → Agregar items → Guardar
- Subir inventario Reebok: Dashboard → Catálogo Reebok → Administrar → Actualizar Inventario → Subir CSV de Active Shoes o Active Wear
- Registrar cheque: Dashboard → Cheques → Nuevo Cheque → Llenar datos → Guardar
- Crear reclamo: Dashboard → Reclamos → Seleccionar empresa → Nuevo Reclamo → Agregar items → Guardar
- Registrar gasto caja: Dashboard → Caja Menuda → Agregar Gasto → Llenar datos → Guardar
- Subir CxC: Dashboard → Cargar CSV → Seleccionar empresa → Subir archivo`;

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
    safe(getVentasMensuales(year).then(d => ({ data: d }))),
    safe(supabaseServer.from("ventas_metas").select("empresa, mes, meta").eq("anio", year)),
    // Facturas recientes
    safe(supabaseServer.from("ventas_raw").select("fecha, tipo, n_sistema, n_fiscal, cliente, vendedor, subtotal, total, utilidad, empresa").order("fecha", { ascending: false }).limit(50)),
    // Reclamos (limit to recent — no need to load years of closed reclamos for chat)
    safe(supabaseServer.from("reclamos").select("id, empresa, proveedor, marca, estado, fecha_reclamo, created_at, reclamo_items(cantidad, precio_unitario)").eq("deleted", false).order("created_at", { ascending: false }).limit(200)),
    // Cheques (only pending + recent — no need for all historical)
    safe(supabaseServer.from("cheques").select("id, cliente, empresa, monto, fecha_deposito, estado").eq("deleted", false).in("estado", ["pendiente", "vencido"]).order("fecha_deposito")),
    // Guías (limit to recent 200)
    safe(supabaseServer.from("guia_transporte").select("id, numero, fecha, transportista, estado, monto_total, guia_items(bultos, cliente)").eq("deleted", false).order("numero", { ascending: false }).limit(200)),
    // Directorio (limit columns, exclude deleted)
    safe(supabaseServer.from("directorio_clientes").select("id, nombre, empresa").eq("deleted", false)),
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
    const ventasPorEmpresa: Record<string, Record<number, { netas: number; costo: number }>> = {};
    for (const v of ventasThisYear) {
      if (!ventasPorEmpresa[v.empresa]) ventasPorEmpresa[v.empresa] = {};
      ventasPorEmpresa[v.empresa][v.mes] = {
        netas: Number(v.ventas_netas) || 0,
        costo: Number(v.costo) || 0,
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
        totalAnio += d.netas;
        if (Number(mesStr) === month) totalMesActual += d.netas;
        if (Number(mesStr) === month - 1) totalMesAnterior += d.netas;
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
      .map(([emp, meses]) => ({ emp, netas: meses[month] ? meses[month].netas : 0, meta: metasPorEmpresa[emp]?.[month] || 0 }))
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
  const auth = requireRole(req, ["admin", "secretaria", "director", "contabilidad", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { message, history, action } = await req.json();

    // Execute confirmed action
    if (action) {
      try {
        const [tipo, id, datos] = action.split("|");
        if (tipo === "despachar_guia") {
          const res = await supabaseServer.from("guia_transporte").update({ estado: "Completada" }).eq("id", id).select("id, numero").maybeSingle();
          return Response.json({ actionResult: res.data ? `✅ Guía #${res.data.numero} despachada` : `❌ Guía no encontrada` });
        }
        if (tipo === "depositar_cheque") {
          const res = await supabaseServer.from("cheques").update({ estado: "depositado", fecha_depositado: new Date().toISOString().slice(0, 10) }).eq("id", id).select("id, cliente").maybeSingle();
          return Response.json({ actionResult: res.data ? `✅ Cheque de ${res.data.cliente} marcado como depositado` : `❌ Cheque no encontrado` });
        }
        if (tipo === "cambiar_estado_reclamo") {
          const res = await supabaseServer.from("reclamos").update({ estado: datos, updated_at: new Date().toISOString() }).eq("id", id).select("id, nro_reclamo").maybeSingle();
          return Response.json({ actionResult: res.data ? `✅ Reclamo ${res.data.nro_reclamo} → ${datos}` : `❌ Reclamo no encontrado` });
        }
        return Response.json({ actionResult: "❌ Acción no reconocida" });
      } catch { return Response.json({ actionResult: "❌ Error al ejecutar acción" }); }
    }

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    // Security: limit message size (prevent cost attacks)
    if (message.length > 10000) {
      return Response.json({ error: "Mensaje demasiado largo (máx 10,000 caracteres)" }, { status: 400 });
    }
    // Security: limit history size
    if (Array.isArray(history) && history.length > 20) {
      return Response.json({ error: "Historial demasiado largo" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "API key no configurada" }, { status: 500 });
    }

    // Detect user role
    let userRole = "desconocido";
    let userName = "";
    try {
      const session = req.cookies.get("cxc_session")?.value;
      if (session) {
        const parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
        userRole = parsed.role || "desconocido";
        userName = parsed.userName || "";
      }
    } catch { /* */ }

    const roleContext = `\n\n## Usuario actual
- Rol: ${userRole}${userName ? ` (${userName})` : ""}
- Adapta tu tono:
  ${userRole === "admin" ? "Respuestas ejecutivas con números clave. Ofrece ejecutar acciones." : ""}
  ${userRole === "secretaria" ? "Respuestas operativas paso a paso. Ayuda con tareas del día a día." : ""}
  ${userRole === "contabilidad" ? "Respuestas con detalle financiero y trazabilidad." : ""}
  ${userRole === "vendedor" ? "Respuestas sobre clientes, productos y pedidos. Enfoque comercial." : ""}
  ${userRole === "director" ? "Respuestas de alto nivel con tendencias y comparaciones." : ""}`;

    const systemData = await buildSystemData();

    // Smart search — aggressively detect entities in message
    let searchContext = "";
    const msgLower = message.toLowerCase();

    // Extract ANY potential entity name from the message
    // Patterns: "debe X", "saldo X", "cuanto X", "cliente X", "de X", known names
    const termPatterns = [
      /(?:debe|deuda|saldo|cobrar|factur\w+|pago|cuenta)\s+(?:de\s+|a\s+)?[""""]?([A-ZÁ-Úa-zá-ú][A-ZÁ-Úa-zá-ú\s&.'-]{2,})/i,
      /(?:cu[aá]nto)\s+(?:debe|le\s+debemos|nos\s+debe)\s+[""""]?([A-ZÁ-Úa-zá-ú][A-ZÁ-Úa-zá-ú\s&.'-]{2,})/i,
      /(?:cliente|cuenta de|saldo de|deuda de)\s+[""""]?([A-ZÁ-Úa-zá-ú][A-ZÁ-Úa-zá-ú\s&.'-]{2,})/i,
      /(?:city|mall|jerusalem|golden|plaza|kheriddine|bouti|outlet|sporting|frontera|la frontera|duty free)[A-ZÁ-Úa-zá-ú\s&.'-]*/i,
    ];
    let searchTerm = "";
    for (const p of termPatterns) { const m = message.match(p); if (m) { searchTerm = (m[1] || m[0]).trim(); break; } }

    // Also detect empresa names in message
    const empresaMap: Record<string, string> = {
      "vistana": "vistana", "calvin": "vistana", "fashion wear": "fashion_wear", "fashion shoes": "fashion_shoes",
      "active shoes": "active_shoes", "active wear": "active_wear", "reebok": "active_wear", "joystep": "joystep", "boston": "confecciones_boston",
    };
    let empresaFilter = "";
    let empresaMatchedName = "";
    for (const [name, key] of Object.entries(empresaMap)) {
      if (msgLower.includes(name)) { empresaFilter = key; empresaMatchedName = name; break; }
    }

    // Strip empresa name and connector words ("en", "de") from searchTerm
    if (searchTerm && empresaMatchedName) {
      searchTerm = searchTerm.replace(new RegExp(`\\s+(?:en|de)\\s+${empresaMatchedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "i"), "").trim();
      // Also strip if searchTerm ends with the empresa name directly
      searchTerm = searchTerm.replace(new RegExp(`\\s*${empresaMatchedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
    }

    // Search CxC — aggressive: search if any term found OR if mentions debt/client keywords
    const shouldSearchCxC = searchTerm.length >= 3 || msgLower.includes("debe") || msgLower.includes("deuda") || msgLower.includes("saldo") || msgLower.includes("cobrar") || msgLower.includes("cartera");
    if (shouldSearchCxC && searchTerm.length >= 3) {
      const term = searchTerm.toUpperCase();
      let { data: cxcMatches } = await supabaseServer.from("cxc_rows").select("company_key, nombre_normalized, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365").ilike("nombre_normalized", `%${term}%`).limit(10);
      if (!cxcMatches?.length) {
        // Exclude empresa-related words from fallback
        const empresaWords = new Set(Object.keys(empresaMap).flatMap(k => k.split(/\s+/)).map(w => w.toUpperCase()));
        const stopWords = new Set(["EN", "DE", "LA", "LAS", "LOS", "EL", "DEL", "PARA", "POR", "CON", "QUE", "COMO", ...empresaWords]);
        for (const word of term.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w)).sort((a, b) => b.length - a.length)) {
          const { data } = await supabaseServer.from("cxc_rows").select("company_key, nombre_normalized, total, d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365").ilike("nombre_normalized", `%${word}%`).limit(10);
          if (data?.length) { cxcMatches = data; break; }
        }
      }
      // Filter by empresa if mentioned
      if (cxcMatches?.length && empresaFilter) {
        const filtered = cxcMatches.filter(r => r.company_key === empresaFilter);
        if (filtered.length > 0) cxcMatches = filtered;
      }
      if (cxcMatches?.length) {
        searchContext += `\n\n## CxC de "${searchTerm}"${empresaFilter ? ` (empresa: ${empresaFilter})` : ""}`;
        for (const r of cxcMatches.slice(0, 5)) {
          const vencido = (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0);
          searchContext += `\n- ${r.nombre_normalized} (${r.company_key}): total $${fmt(Number(r.total) || 0)}, 0-30d $${fmt(Number(r.d0_30) || 0)}, 31-60d $${fmt(Number(r.d31_60) || 0)}, 61-90d $${fmt(Number(r.d61_90) || 0)}, 91-120d $${fmt(Number(r.d91_120) || 0)}, vencido $${fmt(vencido)}`;
        }
      }
    }

    // Search facturas — by client name OR by empresa
    if (searchTerm.length >= 3 || empresaFilter) {
      let facturaQuery = supabaseServer.from("ventas_raw").select("fecha, tipo, n_fiscal, cliente, empresa, vendedor, total").order("fecha", { ascending: false }).limit(10);
      if (searchTerm.length >= 3) facturaQuery = facturaQuery.ilike("cliente", `%${searchTerm}%`);
      else if (empresaFilter) facturaQuery = facturaQuery.eq("empresa", empresaFilter);
      const { data: facturas } = await facturaQuery;
      if (facturas?.length) {
        searchContext += `\n\n## Facturas${searchTerm ? ` de "${searchTerm}"` : ""}${empresaFilter ? ` (${empresaFilter})` : ""}`;
        for (const v of facturas) searchContext += `\n- ${v.fecha} | ${v.tipo} ${v.n_fiscal || ""} | ${v.cliente} | ${v.empresa} | vendedor: ${v.vendedor || "?"} | $${fmt(Number(v.total) || 0)}`;
      }
    }

    // Search guías if mentions guía/guia/despacho
    if (msgLower.includes("guía") || msgLower.includes("guia") || msgLower.includes("despacho")) {
      const numMatch = message.match(/(?:gu[ií]a|#)\s*(\d+)/i);
      if (numMatch) {
        const { data } = await supabaseServer.from("guia_transporte").select("id, numero, fecha, transportista, estado, placa, guia_items(cliente, bultos)").eq("numero", parseInt(numMatch[1])).eq("deleted", false).single();
        if (data) {
          const items = (data.guia_items || []) as { cliente: string; bultos: number }[];
          const totalB = items.reduce((s, i) => s + (i.bultos || 0), 0);
          searchContext += `\n\n## Guía #${data.numero}\n- ID: ${data.id}\n- Fecha: ${data.fecha} | Transportista: ${data.transportista} | Estado: ${data.estado} | Placa: ${data.placa || "sin placa"}\n- ${items.length} items, ${totalB} bultos`;
        }
      } else {
        const { data } = await supabaseServer.from("guia_transporte").select("numero, estado, transportista, fecha").eq("deleted", false).eq("estado", "Pendiente Bodega").order("numero", { ascending: false }).limit(5);
        if (data?.length) {
          searchContext += `\n\n## Guías pendientes de despacho`;
          for (const g of data) searchContext += `\n- #${g.numero}: ${g.transportista} — ${g.fecha}`;
        }
      }
    }

    // Search cheques if mentions cheque
    if (msgLower.includes("cheque")) {
      const { data } = await supabaseServer.from("cheques").select("id, cliente, empresa, monto, fecha_deposito, estado").eq("estado", "pendiente").eq("deleted", false).order("fecha_deposito").limit(10);
      if (data?.length) {
        searchContext += `\n\n## Cheques pendientes`;
        for (const c of data) searchContext += `\n- ID: ${c.id} | ${c.cliente} (${c.empresa}) — $${fmt(Number(c.monto))} — vence ${c.fecha_deposito}`;
      }
    }

    // Search préstamos if mentions préstamo/empleado
    if (msgLower.includes("préstamo") || msgLower.includes("prestamo") || msgLower.includes("empleado")) {
      const nameMatch = message.match(/(?:préstamo|prestamo|empleado|saldo de)\s+(?:de\s+)?([A-ZÁ-Úa-zá-ú]{3,})/i);
      if (nameMatch) {
        const { data } = await supabaseServer.from("prestamos_empleados").select("nombre, empresa, deduccion_quincenal, prestamos_movimientos(tipo, monto, estado)").ilike("nombre", `%${nameMatch[1]}%`).eq("activo", true).limit(3);
        if (data?.length) {
          searchContext += `\n\n## Préstamos`;
          for (const e of data) {
            const movs = (e.prestamos_movimientos || []) as { tipo: string; monto: number; estado: string }[];
            const prestado = movs.filter(m => m.tipo === "prestamo" && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
            const pagado = movs.filter(m => m.tipo !== "prestamo" && m.estado === "aprobado").reduce((s, m) => s + Number(m.monto), 0);
            searchContext += `\n- ${e.nombre} (${e.empresa}): prestado $${fmt(prestado)}, pagado $${fmt(pagado)}, saldo $${fmt(prestado - pagado)}, deducción $${fmt(Number(e.deduccion_quincenal))}/quinc`;
          }
        }
      }
    }

    // Search caja if mentions caja/gasto
    if (msgLower.includes("caja") || msgLower.includes("gasto")) {
      const { data } = await supabaseServer.from("caja_gastos").select("fecha, descripcion, total, categoria, empresa").eq("deleted", false).order("created_at", { ascending: false }).limit(10);
      if (data?.length) {
        searchContext += `\n\n## Últimos gastos de caja`;
        for (const g of data) searchContext += `\n- ${g.fecha} | ${g.descripcion} | $${fmt(Number(g.total))} | ${g.categoria} | ${g.empresa || ""}`;
      }
    }

    // Search directorio if mentions contacto/teléfono/directorio
    if (msgLower.includes("contacto") || msgLower.includes("teléfono") || msgLower.includes("telefono") || msgLower.includes("directorio")) {
      const nameM = message.match(/(?:contacto|teléfono|telefono|directorio)\s+(?:de\s+)?([A-ZÁ-Úa-zá-ú\s]{3,})/i);
      if (nameM) {
        const { data } = await supabaseServer.from("directorio_clientes").select("nombre, empresa, telefono, celular, correo, contacto").ilike("nombre", `%${nameM[1].trim()}%`).eq("deleted", false).limit(5);
        if (data?.length) {
          searchContext += `\n\n## Directorio`;
          for (const c of data) searchContext += `\n- ${c.nombre} (${c.empresa}): tel ${c.telefono || "—"}, cel ${c.celular || "—"}, correo ${c.correo || "—"}, contacto ${c.contacto || "—"}`;
        }
      }
    }

    // Search reclamos if mentions reclamo
    if (msgLower.includes("reclamo")) {
      const numMatch = message.match(/REC-\d{4}-\d{4}/i);
      if (numMatch) {
        const { data } = await supabaseServer.from("reclamos").select("id, nro_reclamo, empresa, proveedor, estado, fecha_reclamo").eq("nro_reclamo", numMatch[0].toUpperCase()).single();
        if (data) searchContext += `\n\n## Reclamo ${data.nro_reclamo}\n- ID: ${data.id}\n- Empresa: ${data.empresa} | Proveedor: ${data.proveedor} | Estado: ${data.estado} | Fecha: ${data.fecha_reclamo}`;
      }
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + roleContext + systemData + searchContext;

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
