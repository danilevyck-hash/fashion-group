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
import { normalizarBultos } from "./piezas-bultos";
import { firmarPath } from "./storage";
import type { RepartoItemEntry } from "./types";

interface EntregaRow {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  notas: string | null;
  created_at: string;
  total_por_marca: Record<string, number> | null;
  /** Correlativo del comprobante. Ausente hasta que corra la migración. */
  numero?: number | null;
}

const COLS_BASE = "id, proyecto_id, total, notas, created_at, total_por_marca";
const COLS_CON_NUMERO = `${COLS_BASE}, numero`;

const COLS_ITEMS_BASE = "entrega_id, producto_id, precio_unitario, reparto";
const COLS_ITEMS_CON_BULTOS = `${COLS_ITEMS_BASE}, bultos`;

const COLS_PROD_BASE = "id, nombre";
const COLS_PROD_CON_FOTO = `${COLS_PROD_BASE}, foto_path`;

/**
 * Tope de peso de una foto para meterla en el PDF.
 *
 * El comprobante se comparte por WhatsApp: un PDF de 10 MB no se manda. Las
 * fotos se comprimen en el navegador antes de subirlas (≈100-300 KB), así que
 * este techo sólo frena una que haya entrado por otra puerta. Pasarse de acá
 * no rompe nada: ese renglón sale sin foto y el resto del papel es idéntico.
 */
const MAX_FOTO_BYTES = 1_500_000;

/** PIEZAS de un item: `reparto` es un array de tuplas por marca. */
function unidadesDeItem(reparto: unknown): number {
  if (!Array.isArray(reparto)) return 0;
  return (reparto as RepartoItemEntry[]).reduce(
    (s, r) => s + (Number(r?.cantidad) || 0),
    0,
  );
}

/**
 * Baja la foto de Storage y la deja como data URL para `jsPDF.addImage`.
 *
 * Se descarga UNA VEZ POR PRODUCTO y por lote, no una por renglón: el ZIP
 * global son 21 entregas sobre los mismos 5 muebles. Cualquier fallo (foto
 * borrada, URL que no firma, archivo enorme) devuelve `null` y el renglón sale
 * sin foto — el comprobante nunca se cae por una imagen.
 */
async function fotoComoDataUrl(path: string): Promise<string | null> {
  try {
    const url = await firmarPath(path);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_FOTO_BYTES) return null;
    const tipo = res.headers.get("content-type") ?? "";
    if (!tipo.startsWith("image/")) return null;
    return `data:${tipo};base64,${buf.toString("base64")}`;
  } catch (err) {
    console.warn(
      `cargarComprobantes: no se pudo traer la foto ${path}`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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

  // `numero` la agrega la migración 20260730120000. Mientras Daniel no la haya
  // corrido a mano, pedirla hace fallar el select entero: se reintenta sin ella
  // y el comprobante cae al número viejo derivado del uuid. El módulo NUNCA se
  // rompe por una migración pendiente.
  let entRows: unknown[] | null = null;
  let entErr: { message: string } | null = null;
  {
    const conNumero = await supabaseServer
      .from("mk_entregas_muebles")
      .select(COLS_CON_NUMERO)
      .in("id", entregaIds as string[]);
    if (conNumero.error) {
      const sinNumero = await supabaseServer
        .from("mk_entregas_muebles")
        .select(COLS_BASE)
        .in("id", entregaIds as string[]);
      entRows = sinNumero.data;
      entErr = sinNumero.error;
    } else {
      entRows = conNumero.data;
    }
  }
  if (entErr) throw new Error(`cargarComprobantes[entregas]: ${entErr.message}`);
  const entregas = (entRows ?? []) as EntregaRow[];
  if (entregas.length === 0) return out;

  const proyectoIds = Array.from(
    new Set(entregas.map((e) => e.proyecto_id).filter((p): p is string => !!p)),
  );

  // `bultos` la agrega la migración 20260808160000. Mismo criterio que
  // `numero`: si todavía no está, se pide sin ella y el comprobante sale con
  // la columna de bultos vacía en vez de reventar.
  const leerItems = async () => {
    const conBultos = await supabaseServer
      .from("mk_entrega_items")
      .select(COLS_ITEMS_CON_BULTOS)
      .in("entrega_id", entregas.map((e) => e.id));
    if (!conBultos.error) return conBultos;
    return supabaseServer
      .from("mk_entrega_items")
      .select(COLS_ITEMS_BASE)
      .in("entrega_id", entregas.map((e) => e.id));
  };

  const [itemsRes, proyRes, marcasRes] = await Promise.all([
    leerItems(),
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
  // `foto_path` también es cols-opcionales (misma migración).
  const leerProductos = async () => {
    if (productoIds.length === 0) return { data: [], error: null };
    const conFoto = await supabaseServer
      .from("mk_inventario_productos")
      .select(COLS_PROD_CON_FOTO)
      .in("id", productoIds);
    if (!conFoto.error) return conFoto;
    return supabaseServer
      .from("mk_inventario_productos")
      .select(COLS_PROD_BASE)
      .in("id", productoIds);
  };
  const prodRes = await leerProductos();
  if (prodRes.error) throw new Error(`cargarComprobantes[productos]: ${prodRes.error.message}`);

  const productosRows = (prodRes.data ?? []) as Array<{
    id: string;
    nombre: string;
    foto_path?: string | null;
  }>;
  const nombreProducto = new Map(
    productosRows.map((p) => [String(p.id), String(p.nombre ?? "")]),
  );

  // Una descarga por producto CON foto, no una por renglón.
  const fotoProducto = new Map<string, string | null>();
  await Promise.all(
    productosRows
      .filter((p) => typeof p.foto_path === "string" && p.foto_path !== "")
      .map(async (p) => {
        fotoProducto.set(
          String(p.id),
          await fotoComoDataUrl(String(p.foto_path)),
        );
      }),
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
    Array<{
      articulo: string;
      cantidad: number;
      bultos: number | null;
      precioUnitario: number;
      fotoDataUrl: string | null;
    }>
  >();
  for (const i of (itemsRes.data ?? []) as Array<{
    entrega_id: string;
    producto_id: string;
    precio_unitario: number | null;
    reparto: unknown;
    bultos?: number | null;
  }>) {
    const arr = itemsByEntrega.get(String(i.entrega_id)) ?? [];
    arr.push({
      articulo: nombreProducto.get(String(i.producto_id)) ?? "Artículo",
      // 🔴 PIEZAS. Los bultos van aparte y no se mezclan.
      cantidad: unidadesDeItem(i.reparto),
      bultos: normalizarBultos(i.bultos),
      precioUnitario: Number(i.precio_unitario ?? 0),
      fotoDataUrl: fotoProducto.get(String(i.producto_id)) ?? null,
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
      numero: e.numero ?? null,
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
