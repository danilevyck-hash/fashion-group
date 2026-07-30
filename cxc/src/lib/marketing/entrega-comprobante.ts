// ============================================================================
// Marketing — datos del COMPROBANTE de entrega de mobiliario.
//
// Lee de la base lo que hace falta para el PDF (ver pdf-entrega-mueble.ts) y lo
// devuelve como un objeto plano. Separado del dibujo a propósito: el layout es
// puro y testeable sin base, y este módulo se reusa desde DOS lugares que no
// pueden divergir — la ruta que abre el PDF desde la ficha y el export ZIP.
//
// Una sola tanda de queries por lote (`cargarComprobantes`), no una por entrega:
// el ZIP global tiene 21 entregas y 21 × 5 requests sería gratuito de evitar.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import type { EntregaMueblePdfData } from "./pdf-entrega-mueble";
import type { RepartoItemEntry } from "./types";

interface EntregaRow {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  notas: string | null;
  created_at: string;
  total_por_marca: Record<string, number> | null;
}

/** Unidades de un item: `reparto` es un array de tuplas por marca. */
function unidadesDeItem(reparto: unknown): number {
  if (!Array.isArray(reparto)) return 0;
  return (reparto as RepartoItemEntry[]).reduce(
    (s, r) => s + (Number(r?.cantidad) || 0),
    0,
  );
}

/**
 * Datos del comprobante para un lote de entregas, por id.
 *
 * Las entregas que no existan simplemente no aparecen en el mapa (el llamador
 * decide si eso es un 404 o un archivo que se salta).
 */
export async function cargarComprobantes(
  entregaIds: ReadonlyArray<string>,
): Promise<Map<string, EntregaMueblePdfData>> {
  const out = new Map<string, EntregaMueblePdfData>();
  if (entregaIds.length === 0) return out;

  const { data: entRows, error: entErr } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("id, proyecto_id, total, notas, created_at, total_por_marca")
    .in("id", entregaIds as string[]);
  if (entErr) throw new Error(`cargarComprobantes[entregas]: ${entErr.message}`);
  const entregas = (entRows ?? []) as EntregaRow[];
  if (entregas.length === 0) return out;

  const proyectoIds = Array.from(
    new Set(entregas.map((e) => e.proyecto_id).filter((p): p is string => !!p)),
  );

  const [itemsRes, proyRes, marcasRes] = await Promise.all([
    supabaseServer
      .from("mk_entrega_items")
      .select("entrega_id, producto_id, precio_unitario, reparto")
      .in("entrega_id", entregas.map((e) => e.id)),
    proyectoIds.length > 0
      ? supabaseServer
          .from("mk_proyectos")
          .select("id, nombre, tienda, tienda_codigo")
          .in("id", proyectoIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseServer.from("mk_marcas").select("id, nombre"),
  ]);
  if (itemsRes.error) throw new Error(`cargarComprobantes[items]: ${itemsRes.error.message}`);
  if (proyRes.error) throw new Error(`cargarComprobantes[proyectos]: ${proyRes.error.message}`);
  if (marcasRes.error) throw new Error(`cargarComprobantes[marcas]: ${marcasRes.error.message}`);

  const productoIds = Array.from(
    new Set(
      ((itemsRes.data ?? []) as Array<{ producto_id: string }>).map((i) =>
        String(i.producto_id),
      ),
    ),
  );
  const prodRes =
    productoIds.length > 0
      ? await supabaseServer
          .from("mk_inventario_productos")
          .select("id, nombre")
          .in("id", productoIds)
      : { data: [], error: null };
  if (prodRes.error) throw new Error(`cargarComprobantes[productos]: ${prodRes.error.message}`);

  const nombreProducto = new Map(
    ((prodRes.data ?? []) as Array<{ id: string; nombre: string }>).map((p) => [
      String(p.id),
      String(p.nombre ?? ""),
    ]),
  );
  const nombreMarca = new Map(
    ((marcasRes.data ?? []) as Array<{ id: string; nombre: string }>).map((m) => [
      String(m.id),
      String(m.nombre ?? ""),
    ]),
  );
  const proyectoById = new Map(
    (
      (proyRes.data ?? []) as Array<{
        id: string;
        nombre: string | null;
        tienda: string | null;
        tienda_codigo: string | null;
      }>
    ).map((p) => [String(p.id), p]),
  );

  // Nombre del cliente del directorio por código (el mismo que usa el ZIP para
  // la carpeta): sin esto el comprobante diría el texto libre de la tienda, que
  // a veces está mal escrito.
  const codigos = Array.from(
    new Set(
      Array.from(proyectoById.values())
        .map((p) => p.tienda_codigo)
        .filter((c): c is string => !!c),
    ),
  );
  const nombreCliente = new Map<string, string>();
  if (codigos.length > 0) {
    const { data } = await supabaseServer
      .from("clientes_master")
      .select("codigo, nombre")
      .in("codigo", codigos);
    for (const c of (data ?? []) as Array<{ codigo: string; nombre: string }>) {
      nombreCliente.set(String(c.codigo), String(c.nombre ?? ""));
    }
  }

  const itemsByEntrega = new Map<
    string,
    Array<{ articulo: string; cantidad: number; precioUnitario: number }>
  >();
  for (const i of (itemsRes.data ?? []) as Array<{
    entrega_id: string;
    producto_id: string;
    precio_unitario: number | null;
    reparto: unknown;
  }>) {
    const arr = itemsByEntrega.get(String(i.entrega_id)) ?? [];
    arr.push({
      articulo: nombreProducto.get(String(i.producto_id)) ?? "Artículo",
      cantidad: unidadesDeItem(i.reparto),
      precioUnitario: Number(i.precio_unitario ?? 0),
    });
    itemsByEntrega.set(String(i.entrega_id), arr);
  }

  for (const e of entregas) {
    const proy = e.proyecto_id ? proyectoById.get(e.proyecto_id) : undefined;
    const codigo = proy?.tienda_codigo ?? null;
    const cliente =
      (codigo ? nombreCliente.get(codigo) : null) || proy?.tienda || "Sin cliente";
    out.set(String(e.id), {
      entregaId: String(e.id),
      fecha: String(e.created_at ?? ""),
      cliente,
      clienteCodigo: codigo,
      tienda: proy?.tienda || "—",
      proyecto: proy?.nombre || proy?.tienda || "Sin proyecto",
      items: (itemsByEntrega.get(String(e.id)) ?? []).sort((a, b) =>
        a.articulo.localeCompare(b.articulo, "es"),
      ),
      porMarca: Object.entries(e.total_por_marca ?? {})
        .filter(([, v]) => Number(v) > 0)
        .map(([mid, v]) => ({
          marca: nombreMarca.get(String(mid)) ?? "—",
          monto: Number(v),
        }))
        .sort((a, b) => b.monto - a.monto),
      total: Number(e.total ?? 0),
      notas: e.notas ?? null,
    });
  }

  return out;
}

/** Atajo de una sola entrega (la ruta que abre el PDF desde la ficha). */
export async function cargarComprobante(
  entregaId: string,
): Promise<EntregaMueblePdfData | null> {
  const map = await cargarComprobantes([entregaId]);
  return map.get(entregaId) ?? null;
}
