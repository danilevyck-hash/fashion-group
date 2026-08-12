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
//
// 🔴 EL STOCK SE MUEVE EN **PIEZAS**, NUNCA EN BULTOS.
//   `mk_entrega_items.bultos` es información de transporte para la nota de
//   entrega y NO entra en ninguna resta de inventario. El bulto es variable
//   (30 colgadores pueden ir en 1 bulto y 20 en otro): no hay conversión.
//   La regla completa, con el porqué, vive en ./piezas-bultos.ts, y el
//   candado que impide colarla acá es
//   `src/__tests__/lib/marketing-piezas-bultos.test.ts`.
//
// 🟡 EL STOCK PUEDE QUEDAR NEGATIVO, A PROPÓSITO. Decisión de Daniel
//   ("negativo"): entregar más de lo que estaba cargado es un hecho real, y
//   esconderlo sería peor que mostrarlo. La entrega NO se bloquea; el aviso
//   lo da la pantalla (EntregaForm).
//
// 🟡 TOLERANTE A DDL PENDIENTE (patrón `cols-opcionales`): `bultos` y
//   `foto_path` los agrega la migración 20260808160000, que Daniel corre A
//   MANO. Mientras no exista la columna, las escrituras se reintentan sin
//   ella y todo lo demás se guarda igual — nunca se pierde una entrega ni un
//   producto por una migración pendiente.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import {
  calcularTotalEntrega,
  calcularTotalPorMarca,
  sumaUnidadesPorProducto,
} from "@/lib/inventario-calc";
import { normalizarBultos, normalizarPiezas, piezasParaStock } from "./piezas-bultos";
import {
  borrarSellosDeDocumento,
  sellarDocumentoPorMarcas,
} from "./periodos-io";
import { firmarPath } from "./storage";
import type {
  CreateEntregaInput,
  CreateProductoInput,
  EntregaConItems,
  EntregaItemInput,
  MarcaPorcentajeInput,
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

/**
 * "Esa columna todavía no existe" — 42703 es `undefined_column` de Postgres y
 * PGRST204 es lo que devuelve PostgREST cuando la columna no está en su schema
 * cache. Cualquier otro error es un error de verdad y se propaga.
 *
 * Es el patrón `cols-opcionales` del repo: la migración la corre Daniel a mano
 * y la pantalla tiene que funcionar ANTES.
 */
function esColumnaAusente(
  error: { code?: string | null; message?: string } | null,
): boolean {
  const code = error?.code ?? "";
  return code === "42703" || code === "PGRST204";
}

function mapProducto(row: Record<string, unknown>): MkInventarioProducto {
  const foto = row.foto_path;
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    precio: Number(row.precio ?? 0),
    stock_total: Number(row.stock_total ?? 0),
    foto_path: typeof foto === "string" && foto !== "" ? foto : null,
    foto_url: null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * Firma las fotos para que el `<img>` las pueda mostrar (el bucket `marketing`
 * es privado). Una foto que no se puede firmar se cae de la fila en vez de
 * tumbar la lista entera: el dato que importa es nombre + precio + stock.
 */
async function firmarFotosProductos(
  productos: MkInventarioProducto[],
): Promise<MkInventarioProducto[]> {
  return Promise.all(
    productos.map(async (p) => {
      if (!p.foto_path) return p;
      try {
        return { ...p, foto_url: await firmarPath(p.foto_path) };
      } catch (err) {
        console.warn(
          `inventario: no se pudo firmar la foto de ${p.nombre}`,
          err instanceof Error ? err.message : err,
        );
        return p;
      }
    }),
  );
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
    // Ausente mientras la migración 20260808160000 no esté corrida → null,
    // que es exactamente lo que significa "no se anotó".
    bultos: normalizarBultos(row.bultos),
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
  const productos = (data ?? []).map((r) =>
    mapProducto(r as Record<string, unknown>),
  );
  return firmarFotosProductos(productos);
}

/** Ruta de foto ya limpia: string no vacío, `null` para "sin foto". */
function normalizarFotoPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim();
  return p === "" ? null : p;
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
  const fotoPath = normalizarFotoPath(input.fotoPath);

  const base = { nombre, precio: round2(precio), stock_total: stock };
  let { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .insert(fotoPath ? { ...base, foto_path: fotoPath } : base)
    .select("*")
    .single();

  // cols-opcionales: sin la migración corrida, el producto se crea igual —
  // sin foto. Perder la foto es reversible (se vuelve a subir); perder el
  // producto entero por una columna que falta, no.
  if (error && fotoPath && esColumnaAusente(error)) {
    const reintento = await supabaseServer
      .from("mk_inventario_productos")
      .insert(base)
      .select("*")
      .single();
    data = reintento.data;
    error = reintento.error;
  }

  if (error || !data) {
    throw new Error(`createProducto: ${error?.message ?? "sin datos"}`);
  }
  const [firmado] = await firmarFotosProductos([
    mapProducto(data as Record<string, unknown>),
  ]);
  return firmado;
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
  // `null` explícito quita la foto; `undefined` la deja como está.
  const tocaFoto = input.fotoPath !== undefined;
  if (tocaFoto) payload.foto_path = normalizarFotoPath(input.fotoPath);

  if (Object.keys(payload).length === 0) {
    throw new Error("updateProducto: nada que actualizar");
  }
  let { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  // cols-opcionales: sin la migración, el resto del producto se guarda igual.
  if (error && tocaFoto && esColumnaAusente(error)) {
    const { foto_path: _descartada, ...sinFoto } = payload;
    if (Object.keys(sinFoto).length > 0) {
      const reintento = await supabaseServer
        .from("mk_inventario_productos")
        .update(sinFoto)
        .eq("id", id)
        .select("*")
        .single();
      data = reintento.data;
      error = reintento.error;
    } else {
      throw new Error(
        "Todavía no se puede guardar la foto: falta correr la migración 20260808160000_mk_mobiliario_bultos_y_foto.sql en Supabase.",
      );
    }
  }

  if (error || !data) {
    throw new Error(`updateProducto: ${error?.message ?? "sin datos"}`);
  }
  const [firmado] = await firmarFotosProductos([
    mapProducto(data as Record<string, unknown>),
  ]);
  return firmado;
}

// ----------------------------------------------------------------------------
// Precio vivo: al cambiar el precio de un producto, las entregas que lo usan
// se recalculan (total + total_por_marca) con el precio nuevo. Reusa la MISMA
// lógica de montos que create/update para cuadrar. Sirve de preview (aplicar
// = false, no escribe) o de aplicación (aplicar = true).
// ----------------------------------------------------------------------------
export interface ImpactoPrecio {
  entregasAfectadas: number;
  totalAntes: number;
  totalDespues: number;
  delta: number;
}

// Precio actual de un producto (para detectar si el PATCH realmente lo cambió).
export async function getProductoPrecio(id: string): Promise<number | null> {
  const { data, error } = await supabaseServer
    .from("mk_inventario_productos")
    .select("precio")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProductoPrecio: ${error.message}`);
  return data ? Number((data as { precio: number }).precio ?? 0) : null;
}

// Deriva el % por marca de una entrega desde su total_por_marca (proporciones).
// El split por marca es independiente del precio, así que re-aplicarlo al total
// nuevo preserva el reparto exacto.
function marcasPctDeEntrega(
  totalPorMarca: Record<string, number>,
): Array<{ marcaId: string; porcentaje: number }> {
  const entries = Object.entries(totalPorMarca ?? {});
  if (entries.length === 0) return [];
  const suma = entries.reduce((s, [, v]) => s + Number(v || 0), 0);
  if (suma <= 0) {
    const parejo = round2(100 / entries.length);
    return entries.map(([marcaId]) => ({ marcaId, porcentaje: parejo }));
  }
  return entries.map(([marcaId, v]) => ({
    marcaId,
    porcentaje: (Number(v || 0) / suma) * 100,
  }));
}

export async function recalcularEntregasPorPrecio(
  productoId: string,
  nuevoPrecio: number,
  aplicar: boolean,
): Promise<ImpactoPrecio> {
  if (!productoId) throw new Error("productoId requerido");
  const precio = round2(Number(nuevoPrecio));
  if (!Number.isFinite(precio) || precio < 0) throw new Error("Precio inválido");

  // 1) Entregas que contienen el producto.
  const { data: itemRows, error: itemErr } = await supabaseServer
    .from("mk_entrega_items")
    .select("entrega_id")
    .eq("producto_id", productoId);
  if (itemErr) throw new Error(`recalcularPrecio[items]: ${itemErr.message}`);
  const entregaIds = Array.from(
    new Set(
      (itemRows ?? []).map((r) =>
        String((r as { entrega_id: string }).entrega_id),
      ),
    ),
  );
  if (entregaIds.length === 0) {
    return { entregasAfectadas: 0, totalAntes: 0, totalDespues: 0, delta: 0 };
  }

  // 2) Cargar esas entregas con TODOS sus items.
  const { data: entRows, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("*, mk_entrega_items(*)")
    .in("id", entregaIds);
  if (entErr) throw new Error(`recalcularPrecio[entregas]: ${entErr.message}`);
  const entregas = (entRows ?? []) as Array<Record<string, unknown>>;

  // 3) Precios actuales de todos los productos; override el cambiado.
  const allProductoIds = new Set<string>();
  for (const e of entregas) {
    for (const it of (e.mk_entrega_items as Array<Record<string, unknown>>) ??
      []) {
      allProductoIds.add(String(it.producto_id));
    }
  }
  const precios = await loadPreciosByProductoId(Array.from(allProductoIds));
  precios.set(productoId, precio);

  // 4) Recalcular cada entrega (misma lógica de montos que create/update).
  let totalAntes = 0;
  let totalDespues = 0;
  const updates: Array<{
    id: string;
    total: number;
    totalPorMarca: Record<string, number>;
  }> = [];
  for (const e of entregas) {
    const oldTotal = Number(e.total ?? 0);
    const items = (
      (e.mk_entrega_items as Array<Record<string, unknown>>) ?? []
    ).map((r) => mapItem(r));
    const itemsUnidades = items.map((it) => ({
      productoId: it.producto_id,
      cantidad: Object.values(it.cantidad_por_marca ?? {}).reduce(
        (s, v) => s + Number(v || 0),
        0,
      ),
    }));
    const marcasPct = marcasPctDeEntrega(
      (e.total_por_marca as Record<string, number>) ?? {},
    );
    const { total, totalPorMarca } = computeTotalesEntrega(
      itemsUnidades,
      precios,
      marcasPct,
    );
    totalAntes = round2(totalAntes + oldTotal);
    totalDespues = round2(totalDespues + total);
    updates.push({ id: String(e.id), total, totalPorMarca });
  }

  if (aplicar) {
    // Sincronizar el precio congelado de los items del producto cambiado.
    const { error: upItemErr } = await supabaseServer
      .from("mk_entrega_items")
      .update({ precio_unitario: precio })
      .eq("producto_id", productoId);
    if (upItemErr) {
      throw new Error(`recalcularPrecio[upd items]: ${upItemErr.message}`);
    }
    for (const u of updates) {
      const { error } = await supabaseServer
        .from("mk_entregas_muebles")
        .update({ total: u.total, total_por_marca: u.totalPorMarca })
        .eq("id", u.id);
      if (error) {
        throw new Error(`recalcularPrecio[upd ${u.id}]: ${error.message}`);
      }
    }
  }

  return {
    entregasAfectadas: entregas.length,
    totalAntes: round2(totalAntes),
    totalDespues: round2(totalDespues),
    delta: round2(totalDespues - totalAntes),
  };
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
  /** PIEZAS. Es lo único que mueve el stock. */
  cantidad?: number;
  /** BULTOS. Informativo — nunca entra en el stock. */
  bultos: number | null;
  reparto: RepartoItemInput[];
}

function normalizarItems(
  items: ReadonlyArray<EntregaItemInput>,
): NormalizedItem[] {
  return items
    .map((it) => {
      // Modelo nuevo: la UI emite `cantidad` (unidades totales del producto) y
      // las marcas/% van a nivel entrega. `reparto` queda como legacy.
      const reparto = Array.isArray(it.reparto)
        ? normalizarReparto(it.reparto)
        : [];
      const cantidad =
        it.cantidad != null && Number.isFinite(Number(it.cantidad))
          ? Math.trunc(Number(it.cantidad))
          : undefined;
      return {
        productoId: String(it.productoId ?? ""),
        cantidad,
        bultos: normalizarBultos(it.bultos),
        reparto,
      };
    })
    .filter(
      (it) =>
        it.productoId && ((it.cantidad ?? 0) > 0 || it.reparto.length > 0),
    );
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

/**
 * Mueve el stock. `delta` viene EN PIEZAS y se resta (entregar saca del
 * inventario; un delta negativo devuelve).
 *
 * 🔴 Nunca recibe bultos. El único productor legítimo de este mapa es
 * `itemsAUnidades()`, que sale de `piezasParaStock()`.
 *
 * 🟡 Deja el stock quedar NEGATIVO a propósito (decisión de Daniel). Un
 * inventario en −12 dice "entregaste 12 más de lo que tenías cargado", que es
 * un dato; forzarlo a 0 sería inventar uno.
 */
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

// Normaliza las marcas con % de una entrega. SIN empresa interna (se retiró el
// reparto 50/50 marca↔empresa). 1 marca = 100%; varias = % entre ellas.
// Back-compat: si no vino `marcas`, deriva del reparto legacy (1 marca/100%).
function normalizarMarcasEntrega(
  marcas: ReadonlyArray<MarcaPorcentajeInput> | undefined,
  items: ReadonlyArray<NormalizedItem>,
): Array<{ marcaId: string; porcentaje: number }> {
  const out: Array<{ marcaId: string; porcentaje: number }> = [];
  const seen = new Set<string>();
  for (const m of marcas ?? []) {
    const marcaId = String(m.marcaId ?? "");
    if (!marcaId || seen.has(marcaId)) continue;
    const pct = Number(m.porcentaje);
    out.push({ marcaId, porcentaje: Number.isFinite(pct) && pct > 0 ? pct : 0 });
    seen.add(marcaId);
  }
  if (out.length === 0) {
    for (const it of items) {
      for (const r of it.reparto) {
        const marcaId = String(r.marcaId ?? "");
        if (marcaId && !seen.has(marcaId)) {
          out.push({ marcaId, porcentaje: 100 });
          seen.add(marcaId);
        }
      }
    }
  }
  // Si por algún motivo todos los % quedaron en 0, repartir parejo.
  if (out.length > 0 && out.every((m) => m.porcentaje === 0)) {
    const parejo = round2(100 / out.length);
    for (const m of out) m.porcentaje = parejo;
  }
  return out;
}

/**
 * PIEZAS totales por producto (cantidad explícita o suma del reparto legacy),
 * más los BULTOS del renglón.
 *
 * 🔴 `cantidad` es lo ÚNICO que se le pasa a `ajustarStock`. `bultos` viaja al
 * lado para poder guardarlo, y ahí termina su recorrido: no se suma a la
 * cantidad, no la multiplica y no la reemplaza. Si un producto aparece en dos
 * renglones, las piezas se suman (es la misma mercancía) y los bultos también
 * (salieron dos paquetes), pero cada suma por su lado.
 */
function itemsAUnidades(
  items: ReadonlyArray<NormalizedItem>,
): Array<{ productoId: string; cantidad: number; bultos: number | null }> {
  const piezas = new Map<string, number>();
  const bultos = new Map<string, number | null>();
  for (const it of items) {
    const cant =
      it.cantidad != null && Number.isFinite(it.cantidad)
        ? piezasParaStock({ piezas: it.cantidad, bultos: it.bultos })
        : normalizarPiezas(
            it.reparto.reduce((s, r) => s + Number(r.cantidad || 0), 0),
          );
    if (!it.productoId || cant <= 0) continue;
    piezas.set(it.productoId, (piezas.get(it.productoId) ?? 0) + cant);
    if (it.bultos !== null) {
      bultos.set(it.productoId, (bultos.get(it.productoId) ?? 0) + it.bultos);
    } else if (!bultos.has(it.productoId)) {
      bultos.set(it.productoId, null);
    }
  }
  return Array.from(piezas, ([productoId, cantidad]) => ({
    productoId,
    cantidad,
    bultos: bultos.get(productoId) ?? null,
  }));
}

// Total de la entrega + total_por_marca (100% repartido por % entre marcas).
// total_por_empresa_interna SIEMPRE {} en entregas nuevas (sin 50/50). El
// redondeo se absorbe en la última marca para que Σ total_por_marca == total.
function computeTotalesEntrega(
  itemsUnidades: ReadonlyArray<{ productoId: string; cantidad: number }>,
  precios: Map<string, number>,
  marcasPct: ReadonlyArray<{ marcaId: string; porcentaje: number }>,
): { total: number; totalPorMarca: Record<string, number> } {
  let total = 0;
  for (const it of itemsUnidades) {
    total += (precios.get(it.productoId) ?? 0) * it.cantidad;
  }
  total = round2(total);
  const sumPct = marcasPct.reduce((s, m) => s + m.porcentaje, 0) || 1;
  const totalPorMarca: Record<string, number> = {};
  let acumulado = 0;
  marcasPct.forEach((m, i) => {
    const monto =
      i === marcasPct.length - 1
        ? round2(total - acumulado)
        : round2(total * (m.porcentaje / sumPct));
    totalPorMarca[m.marcaId] = monto;
    acumulado = round2(acumulado + monto);
  });
  return { total, totalPorMarca };
}

/**
 * Inserta los renglones de una entrega.
 *
 * cols-opcionales: `bultos` la agrega la migración 20260808160000. Mientras no
 * exista, los renglones se guardan SIN bultos en vez de perderse la entrega
 * entera — que es lo que pasaría si el insert fallara. Las piezas (que son las
 * que mueven el stock) van en `reparto` y no dependen de la migración.
 */
async function insertarItemsEntrega(
  entregaId: string,
  itemsUnidades: ReadonlyArray<{
    productoId: string;
    cantidad: number;
    bultos: number | null;
  }>,
  primaryMarca: string,
  precios: Map<string, number>,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const base = itemsUnidades.map((it) => ({
    entrega_id: entregaId,
    producto_id: it.productoId,
    reparto: [
      { marca_id: primaryMarca, empresa: null, cantidad: it.cantidad },
    ] as RepartoItemEntry[],
    precio_unitario: precios.get(it.productoId) ?? 0,
  }));
  const conBultos = base.map((row, i) => ({
    ...row,
    bultos: itemsUnidades[i].bultos,
  }));

  const primero = await supabaseServer
    .from("mk_entrega_items")
    .insert(conBultos)
    .select("*");
  if (!primero.error) return primero;
  if (!esColumnaAusente(primero.error)) return primero;

  return supabaseServer.from("mk_entrega_items").insert(base).select("*");
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

  // Marcas con % (1 marca = 100%; varias = % entre ellas). Sin empresa interna.
  const marcasPct = normalizarMarcasEntrega(input.marcas, items);
  if (marcasPct.length === 0) {
    throw new Error("La entrega debe tener al menos una marca");
  }

  // Cargar precios + validar marcas existen.
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const marcaIds = marcasPct.map((m) => m.marcaId);
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

  const itemsUnidades = itemsAUnidades(items);
  if (itemsUnidades.length === 0) {
    throw new Error("La entrega debe tener al menos un item con cantidad");
  }
  const { total, totalPorMarca } = computeTotalesEntrega(
    itemsUnidades,
    precios,
    marcasPct,
  );
  const primaryMarca = marcasPct[0].marcaId;

  const notas =
    input.notas !== undefined && input.notas !== null
      ? String(input.notas).trim() || null
      : null;

  // 1) Insert entrega (total_por_empresa_interna SIEMPRE {} — sin 50/50).
  const { data: entRow, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .insert({
      proyecto_id: proyectoId,
      total,
      total_por_marca: totalPorMarca,
      total_por_empresa_interna: {},
      notas,
    })
    .select("*")
    .single();
  if (entErr || !entRow) {
    // Pre-DDL: si la columna sigue NOT NULL (la migración 20260811180000 la
    // relaja), una entrega sin cliente rebota acá. Degradar limpio, no
    // escupirle un error de Postgres a la secretaria.
    if (!proyectoId && /not-null|null value/i.test(entErr?.message ?? "")) {
      throw new Error(
        "Para registrar una entrega sin cliente falta correr la actualización de la base de datos. Mientras tanto, elegí un cliente.",
      );
    }
    throw new Error(`createEntrega[entrega]: ${entErr?.message ?? "sin datos"}`);
  }
  const entrega = mapEntrega(entRow as Record<string, unknown>);

  // 2) Insert items. El reparto guarda las PIEZAS bajo la marca primaria
  // (empresa null); el reparto de dinero por marca vive en total_por_marca.
  // `bultos` va al lado, como dato de transporte.
  const { data: itemRows, error: itemErr } = await insertarItemsEntrega(
    entrega.id,
    itemsUnidades,
    primaryMarca,
    precios,
  );
  if (itemErr) {
    await supabaseServer.from("mk_entregas_muebles").delete().eq("id", entrega.id);
    throw new Error(`createEntrega[items]: ${itemErr.message}`);
  }

  // 3) Descontar stock. 🔴 EN PIEZAS (`it.cantidad`), nunca en bultos.
  const stockDelta = new Map<string, number>();
  for (const it of itemsUnidades) {
    stockDelta.set(
      it.productoId,
      (stockDelta.get(it.productoId) ?? 0) +
        piezasParaStock({ piezas: it.cantidad, bultos: it.bultos }),
    );
  }
  await ajustarStock(stockDelta);

  // 4) Sellar la entrega con el período ABIERTO de cada proveedor al que le
  // toca plata. Las marcas son las claves de `total_por_marca` con monto
  // POSITIVO: una clave en 0 significa "esta marca no llevó nada", y sellarla
  // ataría la entrega a un proveedor al que no le corresponde un centavo.
  // Nunca es fatal — la entrega ya está guardada y el stock ya se movió.
  await sellarDocumentoPorMarcas(
    "entrega",
    entrega.id,
    Object.entries(totalPorMarca)
      .filter(([, monto]) => Number(monto) > 0)
      .map(([marcaId]) => marcaId),
  );

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

  // Marcas con % (sin empresa interna). Cargar precios + validar.
  const marcasPct = normalizarMarcasEntrega(input.marcas, items);
  if (marcasPct.length === 0) {
    throw new Error("La entrega debe tener al menos una marca");
  }
  const productoIds = Array.from(new Set(items.map((i) => i.productoId)));
  const marcaIds = marcasPct.map((m) => m.marcaId);
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

  const itemsUnidades = itemsAUnidades(items);
  if (itemsUnidades.length === 0) {
    throw new Error("La entrega debe tener al menos un item con cantidad");
  }
  const { total, totalPorMarca } = computeTotalesEntrega(
    itemsUnidades,
    precios,
    marcasPct,
  );
  const primaryMarca = marcasPct[0].marcaId;

  // 1) Update entrega (total + total_por_marca; total_por_empresa_interna se
  // resetea a {} — al editar, la entrega pasa al modelo nuevo sin 50/50).
  const updPayload: Record<string, unknown> = {
    total,
    total_por_marca: totalPorMarca,
    total_por_empresa_interna: {},
  };
  if (input.notas !== undefined) {
    updPayload.notas =
      input.notas === null ? null : String(input.notas).trim() || null;
  }
  const { error: updErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .update(updPayload)
    .eq("id", id);
  if (updErr) throw new Error(`updateEntrega[entrega]: ${updErr.message}`);

  // 2) Reemplazar items (reparto = unidades bajo la marca primaria, empresa null).
  const { error: delErr } = await supabaseServer
    .from("mk_entrega_items")
    .delete()
    .eq("entrega_id", id);
  if (delErr) throw new Error(`updateEntrega[delete items]: ${delErr.message}`);

  const { data: itemRows, error: insErr } = await insertarItemsEntrega(
    id,
    itemsUnidades,
    primaryMarca,
    precios,
  );
  if (insErr) throw new Error(`updateEntrega[insert items]: ${insErr.message}`);

  // 3) Stock delta: PIEZAS nuevas − PIEZAS previas, por producto.
  //
  // 🔑 Es un DELTA sobre lo que la entrega tenía guardado, no una resta nueva.
  // De ahí salen dos garantías que Daniel pidió por escrito:
  //   · Editar DEVUELVE lo que sobra: bajar de 150 a 100 piezas da delta −50 y
  //     `ajustarStock` suma 50 de vuelta al inventario.
  //   · Guardar dos veces lo MISMO no descuenta dos veces: la segunda corrida
  //     lee los items ya guardados, el delta da 0 y no se escribe nada.
  // El candado es `src/__tests__/lib/marketing-stock-piezas.test.ts`.
  const sumaPrev = sumaUnidadesPorProducto(prevItems);
  const sumaNew = new Map<string, number>();
  for (const it of itemsUnidades) {
    sumaNew.set(
      it.productoId,
      (sumaNew.get(it.productoId) ?? 0) +
        piezasParaStock({ piezas: it.cantidad, bultos: it.bultos }),
    );
  }
  const delta = new Map<string, number>();
  const allIds = new Set<string>([...sumaPrev.keys(), ...sumaNew.keys()]);
  for (const pid of allIds) {
    const d = (sumaNew.get(pid) ?? 0) - (sumaPrev.get(pid) ?? 0);
    if (d !== 0) delta.set(pid, d);
  }
  await ajustarStock(delta);

  // 4) Sellar. Si al editar la entrega le cambió la marca a un proveedor
  // nuevo, ahora es gasto suyo y hay que atarla a SU período abierto. El sello
  // viejo no se toca: lo ya reportado sigue reportado. Nunca es fatal.
  await sellarDocumentoPorMarcas(
    "entrega",
    id,
    Object.entries(totalPorMarca)
      .filter(([, monto]) => Number(monto) > 0)
      .map(([marcaId]) => marcaId),
  );

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

/**
 * Borra una entrega y DEVUELVE su mercancía al inventario.
 *
 * 🔑 Orden a propósito: primero se leen los renglones, después se borra la
 * entrega (los renglones se van por CASCADE) y recién entonces se suma el
 * stock de vuelta. Leerlos después del DELETE devolvería una lista vacía y la
 * mercancía se perdería en silencio.
 *
 * 🔑 Correr esto DOS VECES no devuelve el stock dos veces: en la segunda
 * corrida los renglones ya no existen, el delta queda vacío y `ajustarStock`
 * sale sin escribir. Candado: `marketing-stock-piezas.test.ts`.
 */
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

  // La entrega ya no existe: sus sellos de período apuntarían a nada (pasó de
  // verdad el 12-ago-2026 con una entrega de prueba). Nunca es fatal — la
  // entrega ya se borró y el stock ya volvió.
  await borrarSellosDeDocumento("entrega", id);
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
