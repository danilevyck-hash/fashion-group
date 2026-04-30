// ============================================================================
// Marketing — queries + mutations para inventario y entregas de muebles
// ============================================================================
// Server-side. Usa supabaseServer (service role).
//
// Reglas:
//   - cantidad_por_marca y total_por_marca son JSONB con shape
//     {"<marca_id>": <number>}; las claves son marca_id (uuid string).
//   - Stock se descuenta al insertar/actualizar entregas. Permitimos negativo
//     (warning en UI, no bloqueo) — Daniel lo recompone al recibir mercancía.
//   - Sin soft-delete: las entregas se hard-deletean (cascada limpia items).
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import {
  calcularTotalEntrega,
  calcularTotalPorMarca,
  sumaUnidadesPorProducto,
} from "@/lib/inventario-calc";
import type {
  CreateEntregaInput,
  CreateProductoInput,
  EntregaConItems,
  EntregaItemInput,
  MkEntregaItem,
  MkEntregaMuebles,
  MkInventarioProducto,
  UpdateEntregaInput,
  UpdateProductoInput,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapProducto(row: Record<string, unknown>): MkInventarioProducto {
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    precio: Number(row.precio ?? 0),
    stock_total: Number(row.stock_total ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapEntrega(row: Record<string, unknown>): MkEntregaMuebles {
  return {
    id: String(row.id),
    proyecto_id: String(row.proyecto_id),
    total: Number(row.total ?? 0),
    total_por_marca: (row.total_por_marca as Record<string, number>) ?? {},
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapItem(row: Record<string, unknown>): MkEntregaItem {
  return {
    id: String(row.id),
    entrega_id: String(row.entrega_id),
    producto_id: String(row.producto_id),
    cantidad_por_marca:
      (row.cantidad_por_marca as Record<string, number>) ?? {},
    precio_unitario: Number(row.precio_unitario ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

// ----------------------------------------------------------------------------
// Productos
// ----------------------------------------------------------------------------
export async function listProductos(): Promise<MkInventarioProducto[]> {
  const { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .select("*")
    .order("nombre", { ascending: true });
  if (error) throw new Error(`listProductos: ${error.message}`);
  return (data ?? []).map((r) => mapProducto(r as Record<string, unknown>));
}

export async function createProducto(
  input: CreateProductoInput,
): Promise<MkInventarioProducto> {
  const nombre = String(input.nombre ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  const precio = Number(input.precio);
  if (!Number.isFinite(precio) || precio < 0) throw new Error("Precio inválido");
  const stock = Math.trunc(Number(input.stockTotal));
  if (!Number.isFinite(stock)) throw new Error("Stock inválido");

  const { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .insert({ nombre, precio: round2(precio), stock_total: stock })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createProducto: ${error?.message ?? "sin datos"}`);
  }
  return mapProducto(data as Record<string, unknown>);
}

export async function updateProducto(
  id: string,
  input: UpdateProductoInput,
): Promise<MkInventarioProducto> {
  if (!id) throw new Error("id requerido");
  const payload: Record<string, unknown> = {};
  if (input.nombre !== undefined) {
    const n = String(input.nombre ?? "").trim();
    if (!n) throw new Error("Nombre vacío");
    payload.nombre = n;
  }
  if (input.precio !== undefined) {
    const p = Number(input.precio);
    if (!Number.isFinite(p) || p < 0) throw new Error("Precio inválido");
    payload.precio = round2(p);
  }
  if (input.stockTotal !== undefined) {
    const s = Math.trunc(Number(input.stockTotal));
    if (!Number.isFinite(s)) throw new Error("Stock inválido");
    payload.stock_total = s;
  }
  if (Object.keys(payload).length === 0) {
    throw new Error("updateProducto: nada que actualizar");
  }
  const { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`updateProducto: ${error?.message ?? "sin datos"}`);
  }
  return mapProducto(data as Record<string, unknown>);
}

export async function deleteProducto(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  // Validar que no esté en uso en items existentes.
  const { data: usos, error: usosErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("id")
    .eq("producto_id", id)
    .limit(1);
  if (usosErr) throw new Error(`deleteProducto[check]: ${usosErr.message}`);
  if ((usos ?? []).length > 0) {
    throw new Error("No se puede eliminar: el producto está en una entrega.");
  }
  const { error } = await supabaseServer
    .from("mk_inventario_productos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteProducto: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Entregas
// ----------------------------------------------------------------------------
export async function listEntregasByProyecto(
  proyectoId: string,
): Promise<EntregaConItems[]> {
  if (!proyectoId) return [];
  const { data: entRows, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .order("created_at", { ascending: true });
  if (entErr) throw new Error(`listEntregasByProyecto: ${entErr.message}`);
  const entregas = (entRows ?? []).map((r) =>
    mapEntrega(r as Record<string, unknown>),
  );
  if (entregas.length === 0) return [];

  const ids = entregas.map((e) => e.id);
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .in("entrega_id", ids);
  if (itemErr) throw new Error(`listEntregasByProyecto[items]: ${itemErr.message}`);
  const itemsByEntrega = new Map<string, MkEntregaItem[]>();
  for (const r of itemRows ?? []) {
    const it = mapItem(r as Record<string, unknown>);
    const arr = itemsByEntrega.get(it.entrega_id) ?? [];
    arr.push(it);
    itemsByEntrega.set(it.entrega_id, arr);
  }
  return entregas.map((e) => ({
    ...e,
    items: itemsByEntrega.get(e.id) ?? [],
  }));
}

export async function listAllEntregas(): Promise<EntregaConItems[]> {
  const { data: entRows, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("*")
    .order("created_at", { ascending: false });
  if (entErr) throw new Error(`listAllEntregas: ${entErr.message}`);
  const entregas = (entRows ?? []).map((r) =>
    mapEntrega(r as Record<string, unknown>),
  );
  if (entregas.length === 0) return [];
  const ids = entregas.map((e) => e.id);
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .in("entrega_id", ids);
  if (itemErr) throw new Error(`listAllEntregas[items]: ${itemErr.message}`);
  const itemsByEntrega = new Map<string, MkEntregaItem[]>();
  for (const r of itemRows ?? []) {
    const it = mapItem(r as Record<string, unknown>);
    const arr = itemsByEntrega.get(it.entrega_id) ?? [];
    arr.push(it);
    itemsByEntrega.set(it.entrega_id, arr);
  }
  return entregas.map((e) => ({
    ...e,
    items: itemsByEntrega.get(e.id) ?? [],
  }));
}

// Filtra cantidades en 0/null y normaliza a números enteros >= 0.
function normalizarItems(
  items: ReadonlyArray<EntregaItemInput>,
): EntregaItemInput[] {
  return items
    .map((it) => {
      const cant: Record<string, number> = {};
      for (const [k, v] of Object.entries(it.cantidadPorMarca ?? {})) {
        const n = Math.trunc(Number(v));
        if (Number.isFinite(n) && n > 0) cant[String(k)] = n;
      }
      return { productoId: String(it.productoId ?? ""), cantidadPorMarca: cant };
    })
    .filter((it) => it.productoId && Object.keys(it.cantidadPorMarca).length > 0);
}

async function loadPreciosByProductoId(
  productoIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (productoIds.length === 0) return new Map();
  const { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .select("id, precio")
    .in("id", productoIds);
  if (error) throw new Error(`loadPrecios: ${error.message}`);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ id: string; precio: number }>) {
    out.set(String(r.id), Number(r.precio ?? 0));
  }
  return out;
}

async function ajustarStock(
  delta: Map<string, number>, // positivo = restar del stock; negativo = devolver
): Promise<void> {
  if (delta.size === 0) return;
  for (const [productoId, unidades] of delta) {
    if (!unidades) continue;
    const { error } = await supabaseServer.rpc(
      "mk_ajustar_stock_producto",
      { p_id: productoId, p_delta: -unidades },
    );
    if (error) {
      // Fallback sin RPC: lectura + escritura (race-prone pero suficiente para
      // este volumen). Si la RPC no existe, hacemos UPDATE inline.
      const { data: prod, error: e1 } = await supabaseServer
        .from("mk_inventario_productos")
        .select("stock_total")
        .eq("id", productoId)
        .maybeSingle();
      if (e1 || !prod) {
        throw new Error(
          `ajustarStock[read ${productoId}]: ${e1?.message ?? "no existe"}`,
        );
      }
      const actual = Number((prod as { stock_total: number }).stock_total ?? 0);
      const { error: e2 } = await supabaseServer
        .from("mk_inventario_productos")
        .update({ stock_total: actual - unidades })
        .eq("id", productoId);
      if (e2) {
        throw new Error(`ajustarStock[update ${productoId}]: ${e2.message}`);
      }
    }
  }
}

function totalesPorMarca(
  items: ReadonlyArray<EntregaItemInput>,
  precios: Map<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const precio = precios.get(it.productoId) ?? 0;
    for (const [marcaId, cant] of Object.entries(it.cantidadPorMarca)) {
      const n = Number(cant);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[marcaId] = round2((out[marcaId] ?? 0) + precio * n);
    }
  }
  return out;
}

export async function createEntrega(
  input: CreateEntregaInput,
): Promise<EntregaConItems> {
  if (!input.proyectoId) throw new Error("proyectoId requerido");
  const items = normalizarItems(input.items ?? []);
  if (items.length === 0) throw new Error("La entrega debe tener al menos un item");

  // Validar proyecto vigente (no anulado).
  const { data: proy, error: proyErr } = await supabaseServer
    .from("mk_proyectos")
    .select("id, anulado_en")
    .eq("id", input.proyectoId)
    .maybeSingle();
  if (proyErr) throw new Error(`createEntrega[proyecto]: ${proyErr.message}`);
  if (!proy) throw new Error("Proyecto no encontrado");
  if ((proy as { anulado_en: string | null }).anulado_en) {
    throw new Error("El proyecto está anulado");
  }

  // Cargar precios actuales (snapshot al momento de la entrega).
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const precios = await loadPreciosByProductoId(productoIds);
  for (const pid of productoIds) {
    if (!precios.has(pid)) {
      throw new Error(`Producto no existe: ${pid}`);
    }
  }

  const total = calcularTotalEntrega(
    items.map((it) => ({
      cantidadPorMarca: it.cantidadPorMarca,
      productoId: it.productoId,
    })),
    precios,
  );
  const tpm = totalesPorMarca(items, precios);

  // 1) Insert entrega
  const { data: entRow, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .insert({
      proyecto_id: input.proyectoId,
      total,
      total_por_marca: tpm,
    })
    .select("*")
    .single();
  if (entErr || !entRow) {
    throw new Error(`createEntrega[entrega]: ${entErr?.message ?? "sin datos"}`);
  }
  const entrega = mapEntrega(entRow as Record<string, unknown>);

  // 2) Insert items
  const itemsPayload = items.map((it) => ({
    entrega_id: entrega.id,
    producto_id: it.productoId,
    cantidad_por_marca: it.cantidadPorMarca,
    precio_unitario: precios.get(it.productoId) ?? 0,
  }));
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .insert(itemsPayload)
    .select("*");
  if (itemErr) {
    // Rollback best-effort
    await supabaseServer.from("mk_entregas_muebles").delete().eq("id", entrega.id);
    throw new Error(`createEntrega[items]: ${itemErr.message}`);
  }

  // 3) Descontar stock
  const delta = sumaUnidadesPorProducto(items);
  await ajustarStock(delta);

  return {
    ...entrega,
    items: (itemRows ?? []).map((r) => mapItem(r as Record<string, unknown>)),
  };
}

export async function updateEntrega(
  id: string,
  input: UpdateEntregaInput,
): Promise<EntregaConItems> {
  if (!id) throw new Error("id requerido");
  const items = normalizarItems(input.items ?? []);
  if (items.length === 0) throw new Error("La entrega debe tener al menos un item");

  // Cargar items previos (para calcular delta de stock)
  const { data: prevRows, error: prevErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .eq("entrega_id", id);
  if (prevErr) throw new Error(`updateEntrega[prev]: ${prevErr.message}`);
  const prevItems = (prevRows ?? []).map((r) =>
    mapItem(r as Record<string, unknown>),
  );

  // Precios actuales para los nuevos items
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const precios = await loadPreciosByProductoId(productoIds);
  for (const pid of productoIds) {
    if (!precios.has(pid)) throw new Error(`Producto no existe: ${pid}`);
  }

  const total = calcularTotalEntrega(
    items.map((it) => ({
      cantidadPorMarca: it.cantidadPorMarca,
      productoId: it.productoId,
    })),
    precios,
  );
  const tpm = totalesPorMarca(items, precios);

  // 1) Update entrega
  const { error: updErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .update({ total, total_por_marca: tpm })
    .eq("id", id);
  if (updErr) throw new Error(`updateEntrega[entrega]: ${updErr.message}`);

  // 2) Reemplazar items
  const { error: delErr } = await supabaseServer
    .from("mk_entrega_items")
    .delete()
    .eq("entrega_id", id);
  if (delErr) throw new Error(`updateEntrega[delete items]: ${delErr.message}`);

  const itemsPayload = items.map((it) => ({
    entrega_id: id,
    producto_id: it.productoId,
    cantidad_por_marca: it.cantidadPorMarca,
    precio_unitario: precios.get(it.productoId) ?? 0,
  }));
  const { data: itemRows, error: insErr } = await supabaseServer
    .from("mk_entrega_items")
    .insert(itemsPayload)
    .select("*");
  if (insErr) throw new Error(`updateEntrega[insert items]: ${insErr.message}`);

  // 3) Ajustar stock por delta neto: nuevas - viejas
  const sumaPrev = sumaUnidadesPorProducto(prevItems);
  const sumaNew = sumaUnidadesPorProducto(items);
  const delta = new Map<string, number>();
  const allIds = new Set<string>([...sumaPrev.keys(), ...sumaNew.keys()]);
  for (const pid of allIds) {
    const d = (sumaNew.get(pid) ?? 0) - (sumaPrev.get(pid) ?? 0);
    if (d !== 0) delta.set(pid, d);
  }
  await ajustarStock(delta);

  // Reload entrega completa
  const { data: entRow, error: rE } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (rE || !entRow) {
    throw new Error(`updateEntrega[reload]: ${rE?.message ?? "no existe"}`);
  }
  return {
    ...mapEntrega(entRow as Record<string, unknown>),
    items: (itemRows ?? []).map((r) => mapItem(r as Record<string, unknown>)),
  };
}

export async function deleteEntrega(id: string): Promise<void> {
  if (!id) throw new Error("id requerido");
  // Devolver al stock antes de borrar.
  const { data: prevRows, error: prevErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .eq("entrega_id", id);
  if (prevErr) throw new Error(`deleteEntrega[prev]: ${prevErr.message}`);
  const prev = (prevRows ?? []).map((r) =>
    mapItem(r as Record<string, unknown>),
  );

  const { error } = await supabaseServer
    .from("mk_entregas_muebles")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteEntrega: ${error.message}`);

  const sumaPrev = sumaUnidadesPorProducto(prev);
  const delta = new Map<string, number>();
  for (const [pid, n] of sumaPrev) delta.set(pid, -n); // devolver al stock
  await ajustarStock(delta);
}

// Suma total_por_marca de todas las entregas vigentes de un proyecto.
// Usado por reportes / cobranza para sumarlo al total facturado.
export async function getEntregaTotalPorMarcaByProyecto(
  proyectoId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("total_por_marca")
    .eq("proyecto_id", proyectoId);
  if (error) throw new Error(`getEntregaTotalPorMarca: ${error.message}`);
  for (const r of (data ?? []) as Array<{
    total_por_marca: Record<string, number> | null;
  }>) {
    const tpm = r.total_por_marca ?? {};
    for (const [marcaId, monto] of Object.entries(tpm)) {
      const n = Number(monto);
      if (!Number.isFinite(n)) continue;
      out.set(marcaId, round2((out.get(marcaId) ?? 0) + n));
    }
  }
  return out;
}

// Versión batch: misma agregación pero para varios proyectos en una query.
export async function getEntregaTotalPorMarcaBatch(
  proyectoIds: ReadonlyArray<string>,
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (proyectoIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("proyecto_id, total_por_marca")
    .in("proyecto_id", proyectoIds);
  if (error) throw new Error(`getEntregaTotalPorMarcaBatch: ${error.message}`);
  for (const r of (data ?? []) as Array<{
    proyecto_id: string;
    total_por_marca: Record<string, number> | null;
  }>) {
    const pid = String(r.proyecto_id);
    const tpm = r.total_por_marca ?? {};
    const inner = out.get(pid) ?? new Map<string, number>();
    for (const [marcaId, monto] of Object.entries(tpm)) {
      const n = Number(monto);
      if (!Number.isFinite(n)) continue;
      inner.set(marcaId, round2((inner.get(marcaId) ?? 0) + n));
    }
    out.set(pid, inner);
  }
  return out;
}

// Total agregado por proyecto (suma de los totales de todas sus entregas).
export async function getEntregaTotalByProyectoBatch(
  proyectoIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (proyectoIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("proyecto_id, total")
    .in("proyecto_id", proyectoIds);
  if (error) throw new Error(`getEntregaTotalByProyectoBatch: ${error.message}`);
  for (const r of (data ?? []) as Array<{ proyecto_id: string; total: number }>) {
    const pid = String(r.proyecto_id);
    out.set(pid, round2((out.get(pid) ?? 0) + Number(r.total ?? 0)));
  }
  return out;
}

// Suprime warning del helper si no se importa fuera.
export type { EntregaConItems };

// Re-exporta calcularTotalPorMarca para mantener consumidores con un único path.
export { calcularTotalPorMarca };
