// ============================================================================
// Marketing — queries + mutations para inventario y entregas de muebles
// ============================================================================
// Server-side. Usa supabaseServer (service role).
//
// Modelo (post 2026-05):
//   mk_entrega_items.reparto = jsonb [{marca_id, empresa, cantidad}]
//   mk_entregas_muebles.proyecto_id NULLABLE (entregas pendientes)
//   mk_entregas_muebles.total_por_marca           = {"<marca_id>": <monto>}
//   mk_entregas_muebles.total_por_empresa_interna = {"<empresa_codigo>": <monto>}
//   mk_entregas_muebles.notas TEXT (opcional)
//
// Reglas de negocio:
//   - Marca externa (Tommy/Calvin/Reebok): 50% para la marca + 50% para
//     `empresa` interna pagadora (default = mk_marcas.empresa_codigo, override
//     posible por entrega/item desde el cliente).
//   - Marca interna (Joybees, tipo='interna'): 100% para la marca, empresa
//     se ignora/no aplica (no contribuye a total_por_empresa_interna).
//   - Stock se descuenta al insertar/actualizar (delta neto). Permite negativo.
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
  RepartoItemEntry,
  RepartoItemInput,
  TipoMarca,
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

function normalizeReparto(raw: unknown): RepartoItemEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RepartoItemEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const marcaId = String(obj.marca_id ?? obj.marcaId ?? "");
    if (!marcaId) continue;
    const cant = Number(obj.cantidad ?? 0);
    if (!Number.isFinite(cant) || cant <= 0) continue;
    const empresaRaw = obj.empresa;
    const empresa =
      empresaRaw === null
        ? null
        : typeof empresaRaw === "string" && empresaRaw.length > 0
          ? empresaRaw
          : null;
    out.push({ marca_id: marcaId, empresa, cantidad: Math.trunc(cant) });
  }
  return out;
}

function mapEntrega(row: Record<string, unknown>): MkEntregaMuebles {
  return {
    id: String(row.id),
    proyecto_id: (row.proyecto_id as string | null) ?? null,
    total: Number(row.total ?? 0),
    total_por_marca: (row.total_por_marca as Record<string, number>) ?? {},
    total_por_empresa_interna:
      (row.total_por_empresa_interna as Record<string, number>) ?? {},
    notas: (row.notas as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapItem(row: Record<string, unknown>): MkEntregaItem {
  const reparto = normalizeReparto(row.reparto);
  // Compat shape: agrega cantidades por marca_id para callers legacy.
  const cantidadPorMarca: Record<string, number> = {};
  for (const r of reparto) {
    cantidadPorMarca[r.marca_id] =
      (cantidadPorMarca[r.marca_id] ?? 0) + r.cantidad;
  }
  return {
    id: String(row.id),
    entrega_id: String(row.entrega_id),
    producto_id: String(row.producto_id),
    reparto,
    cantidad_por_marca: cantidadPorMarca,
    precio_unitario: Number(row.precio_unitario ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

// ----------------------------------------------------------------------------
// Marcas — helper para obtener tipo + empresa default
// ----------------------------------------------------------------------------
interface MarcaInfo {
  tipo: TipoMarca;
  empresa_codigo: string;
}

async function loadMarcasInfo(
  marcaIds: ReadonlyArray<string>,
): Promise<Map<string, MarcaInfo>> {
  const out = new Map<string, MarcaInfo>();
  if (marcaIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_marcas")
    .select("id, tipo, empresa_codigo")
    .in("id", marcaIds);
  if (error) throw new Error(`loadMarcasInfo: ${error.message}`);
  for (const r of (data ?? []) as Array<{
    id: string;
    tipo: string | null;
    empresa_codigo: string | null;
  }>) {
    const tipo: TipoMarca = r.tipo === "interna" ? "interna" : "externa";
    out.set(String(r.id), {
      tipo,
      empresa_codigo: String(r.empresa_codigo ?? ""),
    });
  }
  return out;
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
// Entregas — listings
// ----------------------------------------------------------------------------
async function attachItems(
  entregas: MkEntregaMuebles[],
): Promise<EntregaConItems[]> {
  if (entregas.length === 0) return [];
  const ids = entregas.map((e) => e.id);
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .in("entrega_id", ids);
  if (itemErr) throw new Error(`attachItems: ${itemErr.message}`);
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
  return attachItems(entregas);
}

export async function listEntregasPendientes(): Promise<EntregaConItems[]> {
  const { data: entRows, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("*")
    .is("proyecto_id", null)
    .order("created_at", { ascending: false });
  if (entErr) throw new Error(`listEntregasPendientes: ${entErr.message}`);
  const entregas = (entRows ?? []).map((r) =>
    mapEntrega(r as Record<string, unknown>),
  );
  return attachItems(entregas);
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
  return attachItems(entregas);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------
function normalizarReparto(
  reparto: ReadonlyArray<RepartoItemInput>,
): RepartoItemInput[] {
  const out: RepartoItemInput[] = [];
  for (const r of reparto ?? []) {
    const marcaId = String(r.marcaId ?? "");
    if (!marcaId) continue;
    const cant = Math.trunc(Number(r.cantidad));
    if (!Number.isFinite(cant) || cant <= 0) continue;
    const empresa =
      r.empresa === undefined
        ? undefined
        : r.empresa === null || r.empresa === ""
          ? null
          : String(r.empresa);
    out.push({ marcaId, empresa, cantidad: cant });
  }
  return out;
}

interface NormalizedItem {
  productoId: string;
  reparto: RepartoItemInput[];
}

function normalizarItems(
  items: ReadonlyArray<EntregaItemInput>,
): NormalizedItem[] {
  return items
    .map((it) => {
      // Compat: si el caller mandó cantidadPorMarca legacy, lo convertimos.
      let reparto: RepartoItemInput[];
      if (Array.isArray(it.reparto) && it.reparto.length > 0) {
        reparto = normalizarReparto(it.reparto);
      } else if (it.cantidadPorMarca) {
        reparto = normalizarReparto(
          Object.entries(it.cantidadPorMarca).map(([marcaId, cant]) => ({
            marcaId,
            cantidad: Number(cant),
          })),
        );
      } else {
        reparto = [];
      }
      return {
        productoId: String(it.productoId ?? ""),
        reparto,
      };
    })
    .filter((it) => it.productoId && it.reparto.length > 0);
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
  delta: Map<string, number>,
): Promise<void> {
  if (delta.size === 0) return;
  for (const [productoId, unidades] of delta) {
    if (!unidades) continue;
    const { error } = await supabaseServer.rpc(
      "mk_ajustar_stock_producto",
      { p_id: productoId, p_delta: -unidades },
    );
    if (error) {
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

// Resuelve `empresa` para cada entry: si viene en input, se respeta (puede ser
// null si la marca es interna); si no, se deriva de marca.empresa_codigo.
// Marcas internas (Joybees) → empresa=null siempre.
function resolverRepartoConEmpresa(
  reparto: ReadonlyArray<RepartoItemInput>,
  marcasInfo: Map<string, MarcaInfo>,
): RepartoItemEntry[] {
  const out: RepartoItemEntry[] = [];
  for (const r of reparto) {
    const info = marcasInfo.get(r.marcaId);
    if (!info) continue; // marca desconocida
    let empresa: string | null;
    if (info.tipo === "interna") {
      empresa = null;
    } else if (r.empresa !== undefined) {
      empresa = r.empresa;
    } else {
      empresa = info.empresa_codigo || null;
    }
    out.push({
      marca_id: r.marcaId,
      empresa,
      cantidad: r.cantidad,
    });
  }
  return out;
}

// Calcula total_por_marca y total_por_empresa_interna desde items + precios.
//   - Externa: 50% al marca_id, 50% al empresa
//   - Interna: 100% al marca_id, empresa ignorada
function totalesByItems(
  items: ReadonlyArray<{
    productoId: string;
    reparto: ReadonlyArray<RepartoItemEntry>;
  }>,
  precios: Map<string, number>,
  marcasInfo: Map<string, MarcaInfo>,
): {
  total: number;
  totalPorMarca: Record<string, number>;
  totalPorEmpresaInterna: Record<string, number>;
} {
  const totalPorMarca: Record<string, number> = {};
  const totalPorEmpresaInterna: Record<string, number> = {};
  let total = 0;
  for (const it of items) {
    const precio = precios.get(it.productoId) ?? 0;
    for (const r of it.reparto) {
      const cant = Number(r.cantidad);
      if (!Number.isFinite(cant) || cant <= 0) continue;
      const subtotal = precio * cant;
      total += subtotal;
      const tipo = marcasInfo.get(r.marca_id)?.tipo ?? "externa";
      if (tipo === "interna") {
        totalPorMarca[r.marca_id] =
          (totalPorMarca[r.marca_id] ?? 0) + subtotal;
      } else {
        const mitad = subtotal / 2;
        totalPorMarca[r.marca_id] =
          (totalPorMarca[r.marca_id] ?? 0) + mitad;
        if (r.empresa) {
          totalPorEmpresaInterna[r.empresa] =
            (totalPorEmpresaInterna[r.empresa] ?? 0) + mitad;
        }
        // Si empresa es null en una marca externa, ese 50% queda sin
        // atribución interna (Fashion Group genérico). Suma al total
        // pero no al desglose interno — coherente con facturas legacy.
      }
    }
  }
  // Redondear
  for (const k of Object.keys(totalPorMarca)) {
    totalPorMarca[k] = round2(totalPorMarca[k]);
  }
  for (const k of Object.keys(totalPorEmpresaInterna)) {
    totalPorEmpresaInterna[k] = round2(totalPorEmpresaInterna[k]);
  }
  return {
    total: round2(total),
    totalPorMarca,
    totalPorEmpresaInterna,
  };
}

export async function createEntrega(
  input: CreateEntregaInput,
): Promise<EntregaConItems> {
  const items = normalizarItems(input.items ?? []);
  if (items.length === 0) {
    throw new Error("La entrega debe tener al menos un item");
  }

  // proyectoId opcional. Si viene, validar que no esté anulado.
  const proyectoId = input.proyectoId ? String(input.proyectoId) : null;
  if (proyectoId) {
    const { data: proy, error: proyErr } = await supabaseServer
      .from("mk_proyectos")
      .select("id, anulado_en")
      .eq("id", proyectoId)
      .maybeSingle();
    if (proyErr) throw new Error(`createEntrega[proyecto]: ${proyErr.message}`);
    if (!proy) throw new Error("Proyecto no encontrado");
    if ((proy as { anulado_en: string | null }).anulado_en) {
      throw new Error("El proyecto está anulado");
    }
  }

  // Cargar precios y tipos de marcas.
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const marcaIds = Array.from(
    new Set(items.flatMap((i) => i.reparto.map((r) => r.marcaId))),
  );
  const [precios, marcasInfo] = await Promise.all([
    loadPreciosByProductoId(productoIds),
    loadMarcasInfo(marcaIds),
  ]);
  for (const pid of productoIds) {
    if (!precios.has(pid)) throw new Error(`Producto no existe: ${pid}`);
  }
  for (const mid of marcaIds) {
    if (!marcasInfo.has(mid)) throw new Error(`Marca no existe: ${mid}`);
  }

  // Resolver reparto.empresa (default desde marca.empresa_codigo, override OK).
  const itemsResueltos = items.map((it) => ({
    productoId: it.productoId,
    reparto: resolverRepartoConEmpresa(it.reparto, marcasInfo),
  }));

  const { total, totalPorMarca, totalPorEmpresaInterna } = totalesByItems(
    itemsResueltos,
    precios,
    marcasInfo,
  );

  const notas =
    input.notas !== undefined && input.notas !== null
      ? String(input.notas).trim() || null
      : null;

  // 1) Insert entrega
  const { data: entRow, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .insert({
      proyecto_id: proyectoId,
      total,
      total_por_marca: totalPorMarca,
      total_por_empresa_interna: totalPorEmpresaInterna,
      notas,
    })
    .select("*")
    .single();
  if (entErr || !entRow) {
    throw new Error(`createEntrega[entrega]: ${entErr?.message ?? "sin datos"}`);
  }
  const entrega = mapEntrega(entRow as Record<string, unknown>);

  // 2) Insert items con reparto resuelto
  const itemsPayload = itemsResueltos.map((it) => ({
    entrega_id: entrega.id,
    producto_id: it.productoId,
    reparto: it.reparto,
    precio_unitario: precios.get(it.productoId) ?? 0,
  }));
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .insert(itemsPayload)
    .select("*");
  if (itemErr) {
    await supabaseServer.from("mk_entregas_muebles").delete().eq("id", entrega.id);
    throw new Error(`createEntrega[items]: ${itemErr.message}`);
  }

  // 3) Descontar stock (suma todas las cantidades del reparto por producto)
  const inputItemsForStock: EntregaItemInput[] = itemsResueltos.map((it) => ({
    productoId: it.productoId,
    reparto: it.reparto.map((r) => ({
      marcaId: r.marca_id,
      empresa: r.empresa,
      cantidad: r.cantidad,
    })),
  }));
  await ajustarStock(sumaUnidadesPorProducto(inputItemsForStock));

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
  if (items.length === 0) {
    throw new Error("La entrega debe tener al menos un item");
  }

  // Cargar items previos para delta de stock.
  const { data: prevRows, error: prevErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("*")
    .eq("entrega_id", id);
  if (prevErr) throw new Error(`updateEntrega[prev]: ${prevErr.message}`);
  const prevItems = (prevRows ?? []).map((r) =>
    mapItem(r as Record<string, unknown>),
  );

  // Precios + tipos de marca
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const marcaIds = Array.from(
    new Set(items.flatMap((i) => i.reparto.map((r) => r.marcaId))),
  );
  const [precios, marcasInfo] = await Promise.all([
    loadPreciosByProductoId(productoIds),
    loadMarcasInfo(marcaIds),
  ]);
  for (const pid of productoIds) {
    if (!precios.has(pid)) throw new Error(`Producto no existe: ${pid}`);
  }
  for (const mid of marcaIds) {
    if (!marcasInfo.has(mid)) throw new Error(`Marca no existe: ${mid}`);
  }

  const itemsResueltos = items.map((it) => ({
    productoId: it.productoId,
    reparto: resolverRepartoConEmpresa(it.reparto, marcasInfo),
  }));

  const { total, totalPorMarca, totalPorEmpresaInterna } = totalesByItems(
    itemsResueltos,
    precios,
    marcasInfo,
  );

  // 1) Update entrega (total + ambos jsonb + notas si vino)
  const updPayload: Record<string, unknown> = {
    total,
    total_por_marca: totalPorMarca,
    total_por_empresa_interna: totalPorEmpresaInterna,
  };
  if (input.notas !== undefined) {
    updPayload.notas =
      input.notas === null
        ? null
        : String(input.notas).trim() || null;
  }
  const { error: updErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .update(updPayload)
    .eq("id", id);
  if (updErr) throw new Error(`updateEntrega[entrega]: ${updErr.message}`);

  // 2) Reemplazar items
  const { error: delErr } = await supabaseServer
    .from("mk_entrega_items")
    .delete()
    .eq("entrega_id", id);
  if (delErr) throw new Error(`updateEntrega[delete items]: ${delErr.message}`);

  const itemsPayload = itemsResueltos.map((it) => ({
    entrega_id: id,
    producto_id: it.productoId,
    reparto: it.reparto,
    precio_unitario: precios.get(it.productoId) ?? 0,
  }));
  const { data: itemRows, error: insErr } = await supabaseServer
    .from("mk_entrega_items")
    .insert(itemsPayload)
    .select("*");
  if (insErr) throw new Error(`updateEntrega[insert items]: ${insErr.message}`);

  // 3) Stock delta
  const newItemsForStock: EntregaItemInput[] = itemsResueltos.map((it) => ({
    productoId: it.productoId,
    reparto: it.reparto.map((r) => ({
      marcaId: r.marca_id,
      empresa: r.empresa,
      cantidad: r.cantidad,
    })),
  }));
  const sumaPrev = sumaUnidadesPorProducto(prevItems);
  const sumaNew = sumaUnidadesPorProducto(newItemsForStock);
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
  for (const [pid, n] of sumaPrev) delta.set(pid, -n);
  await ajustarStock(delta);
}

/**
 * Asigna una entrega pendiente (proyecto_id NULL) a un proyecto.
 * Falla si la entrega ya tiene proyecto_id.
 */
export async function asignarEntregaAProyecto(
  entregaId: string,
  proyectoId: string,
): Promise<EntregaConItems> {
  if (!entregaId) throw new Error("entregaId requerido");
  if (!proyectoId) throw new Error("proyectoId requerido");

  const { data: ent, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("id, proyecto_id")
    .eq("id", entregaId)
    .maybeSingle();
  if (entErr) throw new Error(`asignarEntregaAProyecto[read]: ${entErr.message}`);
  if (!ent) throw new Error("Entrega no encontrada");
  if ((ent as { proyecto_id: string | null }).proyecto_id) {
    throw new Error("La entrega ya está asignada a un proyecto");
  }

  const { data: proy, error: proyErr } = await supabaseServer
    .from("mk_proyectos")
    .select("id, anulado_en")
    .eq("id", proyectoId)
    .maybeSingle();
  if (proyErr) throw new Error(`asignarEntregaAProyecto[proy]: ${proyErr.message}`);
  if (!proy) throw new Error("Proyecto no encontrado");
  if ((proy as { anulado_en: string | null }).anulado_en) {
    throw new Error("El proyecto está anulado");
  }

  const { data: updRow, error: updErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .update({ proyecto_id: proyectoId })
    .eq("id", entregaId)
    .select("*")
    .single();
  if (updErr || !updRow) {
    throw new Error(
      `asignarEntregaAProyecto[update]: ${updErr?.message ?? "sin datos"}`,
    );
  }

  const entrega = mapEntrega(updRow as Record<string, unknown>);
  const conItems = await attachItems([entrega]);
  return conItems[0]!;
}

// ----------------------------------------------------------------------------
// Agregaciones para reportes (filtran proyecto_id IS NOT NULL implícitamente
// vía .in con ids existentes — pendientes nunca se incluyen).
// ----------------------------------------------------------------------------
export async function getEntregaTotalPorMarcaByProyecto(
  proyectoId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!proyectoId) return out;
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

export async function getEntregaTotalPorMarcaBatch(
  proyectoIds: ReadonlyArray<string>,
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (proyectoIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("proyecto_id, total_por_marca")
    .in("proyecto_id", proyectoIds)
    .not("proyecto_id", "is", null);
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

export async function getEntregaTotalByProyectoBatch(
  proyectoIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (proyectoIds.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("proyecto_id, total")
    .in("proyecto_id", proyectoIds)
    .not("proyecto_id", "is", null);
  if (error) throw new Error(`getEntregaTotalByProyectoBatch: ${error.message}`);
  for (const r of (data ?? []) as Array<{ proyecto_id: string; total: number }>) {
    const pid = String(r.proyecto_id);
    out.set(pid, round2((out.get(pid) ?? 0) + Number(r.total ?? 0)));
  }
  return out;
}

export type { EntregaConItems };
export { calcularTotalPorMarca, calcularTotalEntrega };
