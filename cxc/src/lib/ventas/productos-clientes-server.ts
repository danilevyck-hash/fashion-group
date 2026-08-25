// ─────────────────────────────────────────────────────────────────────────────
// LECTURA de "quién compra esta descripción". Server-only (service_role).
//
// Dos caminos que devuelven LO MISMO, y el de abajo existe porque las DDL de
// este repo las corre Daniel a mano:
//
//   1. RPC `switch_clientes_por_codigos` — Postgres agrupa y viaja UNA fila por
//      cliente. Es el camino bueno.
//   2. Si la función todavía no está creada, se leen las líneas paginadas y se
//      agrupan acá con `agruparPorCliente`. La pantalla funciona igual desde el
//      minuto uno; cuando la DDL se corra, se pone rápida sola.
//
// 🔑 LOS DOS CAMINOS RECIBEN LA MISMA LISTA DE CÓDIGOS. Ese es el motivo de que
// la RPC tome `p_codigos` en vez de resolver la descripción por su cuenta: dos
// resoluciones distintas del mismo conjunto es cómo los dos caminos se separan
// sin que nadie se entere.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  agruparPorCliente,
  bordePanama,
  CODIGOS_POR_LOTE,
  diaSiguiente,
  enLotes,
  type ClienteDeProducto,
  type LineaParaCliente,
} from "@/lib/ventas/productos-clientes";

/** ¿El error de PostgREST dice "esa función no existe"? */
function funcionNoCreada(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("could not find the function") || m.includes("does not exist");
}

function normalizar(filas: readonly Record<string, unknown>[]): ClienteDeProducto[] {
  return filas.map(c => ({
    cliente_switch_id: c.cliente_switch_id != null ? Number(c.cliente_switch_id) : null,
    cliente_nombre: String(c.cliente_nombre ?? "").trim() || "(sin cliente)",
    cantidad: Number(c.cantidad ?? 0),
    venta: Number(c.venta ?? 0),
  }));
}

/**
 * Los clientes que compraron ALGUNO de estos códigos en la ventana.
 *
 * Devuelve `[]` cuando no hay códigos (nada que preguntar) — sin tocar la base.
 */
export async function clientesDeCodigos(
  empresa: string,
  desde: string,
  hasta: string,
  codigos: readonly string[],
): Promise<ClienteDeProducto[]> {
  const lista = [...new Set(codigos.filter(c => typeof c === "string" && c !== ""))];
  if (lista.length === 0) return [];

  const rpc = await supabaseServer.rpc("switch_clientes_por_codigos", {
    p_empresa_key: empresa,
    p_desde: desde,
    p_hasta: hasta,
    p_codigos: lista,
  });

  if (!rpc.error) return normalizar((rpc.data ?? []) as Record<string, unknown>[]);

  if (!funcionNoCreada(rpc.error)) {
    // Un error de verdad (timeout, permisos) NO cae al camino largo: la base
    // está en compute Micro y contestarle a un timeout con 7 consultas más es
    // empujar la caída, no evitarla.
    console.error("[productos/clientes] rpc:", rpc.error.message);
    throw new Error(rpc.error.message);
  }

  // ── Camino sin RPC: leer las líneas y agrupar acá ────────────────────────
  const gte = bordePanama(desde);
  const lt = bordePanama(diaSiguiente(hasta));
  const lineas: LineaParaCliente[] = [];
  for (const lote of enLotes(lista, CODIGOS_POR_LOTE)) {
    const filas = await leerTodoPaginado<LineaParaCliente>(
      "switch_factura_lineas (clientes por descripción)",
      (pedirCount, d, h) =>
        supabaseServer
          .from("switch_factura_lineas")
          .select(
            "tipo_comprobante, cliente_switch_id, cliente_nombre, cantidad, subtotal_con_descuento",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("empresa_key", empresa)
          .in("codigo", lote)
          .gte("fecha", gte)
          .lt("fecha", lt)
          // Orden ESTABLE por columna única: sin él, PostgREST puede repetir o
          // saltear filas entre páginas y el total queda mal en silencio.
          .order("id", { ascending: true })
          .range(d, h),
    );
    lineas.push(...filas);
  }
  return agruparPorCliente(lineas);
}
