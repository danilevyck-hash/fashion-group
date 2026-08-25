// ─────────────────────────────────────────────────────────────────────────────
// LECTURA de "qué me compra este cliente". Server-only (service_role).
//
// Dos caminos que devuelven LO MISMO, igual que en el #591 (las DDL de este
// repo las corre Daniel a mano y la pantalla tiene que funcionar desde el
// minuto uno):
//
//   1. RPC `switch_productos_por_cliente` — Postgres agrupa y viaja la matriz
//      ya hecha. UNA ida y vuelta.
//   2. Si la función todavía no está creada, se leen las líneas paginadas y se
//      agrupan acá con `armarMatriz`. Mismo resultado, más viajes.
//
// 🔑 LOS DOS CAMINOS CRUZAN POR CÓDIGO Y AGRUPAN CON LA MISMA REGLA. El camino
// sin RPC no arma su propio agrupado: llama a `armarMatriz`, que por dentro
// llama a `agruparPorCliente` del #591.
//
// ⚠️ ACÁ NO HAY COSTO NI MARGEN. `switch_factura_lineas` no los tiene.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  bordePanama,
  CODIGOS_POR_LOTE,
  diaSiguiente,
  enLotes,
} from "@/lib/ventas/productos-clientes";
import {
  armarMatriz,
  mapaCodigoDescripcion,
  type FilaPorCliente,
  type LineaConCodigo,
  type Matriz,
} from "@/lib/ventas/productos-por-cliente";

/** ¿El error de PostgREST dice "esa función no existe"? */
function funcionNoCreada(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("could not find the function") || m.includes("does not exist");
}

function normalizar(filas: readonly Record<string, unknown>[]): FilaPorCliente[] {
  return filas.map(f => ({
    cliente_switch_id: f.cliente_switch_id != null ? Number(f.cliente_switch_id) : null,
    cliente_nombre: String(f.cliente_nombre ?? "").trim() || "(sin cliente)",
    descripcion: String(f.descripcion ?? ""),
    cantidad: Number(f.cantidad ?? 0),
    venta: Number(f.venta ?? 0),
  }));
}

type FilaDiario = { codigo: string | null; descripcion: string | null; fecha: string | null };

/**
 * El mapa `código → descripción` de la ventana.
 *
 * DOS FORMAS DE PEDIRLO, y la diferencia es de PLATA, no de gusto:
 *
 * · `codigos = null` (la matriz de todos los clientes): hay que conocer la
 *   ventana entera, así que se lee paginada. En fashion_wear / 12 meses son
 *   21.128 filas = 22 páginas.
 * · `codigos` con lista (UN cliente): sólo hacen falta los códigos que ese
 *   cliente tocó — unos cientos —, y se piden con `.in()` en lotes. Es lo que
 *   hace que pedir la ventana ANTERIOR de un cliente cueste 2 o 3 viajes en vez
 *   de 22.
 *
 * Los lotes son los del #591 (`CODIGOS_POR_LOTE`): el filtro viaja en la URL de
 * un GET y una descripción de 842 códigos son ~10 KB de URL.
 */
async function leerMapa(
  empresa: string,
  desde: string,
  hasta: string,
  codigos: readonly string[] | null,
): Promise<Map<string, string>> {
  // 🩸 SIN FILTRO DE FECHA, Y ES A PROPÓSITO. La tabla de arriba rotula cada
  // grupo con el nombre MÁS RECIENTE del código, que es global (ver
  // `switch_top_descripciones_reciente`). Acotando el mapa a la ventana, en
  // «Año pasado» el filtro nombraría al mismo producto con la grafía vieja y no
  // caería sobre ninguna fila de la tabla que dice filtrar.
  //
  // ⚠️ SÍ, ES MÁS CARO: en fashion_wear son 68 páginas en vez de 22. Es el
  // camino SIN la RPC, o sea el que deja de correr en cuanto se corra la
  // migración 20260826120000 — y una respuesta rápida que no cruza con la tabla
  // no sirve para nada. `desde`/`hasta` se siguen recibiendo porque son parte
  // de la firma y los usa el llamador.
  void desde; void hasta;
  const filas: FilaDiario[] = [];
  const lotes = codigos == null ? [null] : enLotes([...new Set(codigos)], CODIGOS_POR_LOTE);
  for (const lote of lotes) {
    if (lote != null && lote.length === 0) continue;
    filas.push(...await leerTodoPaginado<FilaDiario>(
      "switch_articulo_diario (descripción de cada código)",
      (pedirCount, d, h) => {
        let q = supabaseServer
          .from("switch_articulo_diario")
          .select("codigo, descripcion, fecha", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", empresa);
        if (lote != null) q = q.in("codigo", lote);
        // Orden ESTABLE por columna única: sin él, PostgREST puede repetir o
        // saltear filas entre páginas y el mapa queda mal en silencio.
        return q.order("id", { ascending: true }).range(d, h);
      },
    ));
  }
  return mapaCodigoDescripcion(filas);
}

/**
 * La matriz (cliente × descripción) de la ventana.
 *
 * `clienteId` null = todos los clientes. Con un id, sólo ese — que es como se
 * pide la ventana ANTERIOR para armar «Dejó de comprar».
 */
export async function matrizPorCliente(
  empresa: string,
  desde: string,
  hasta: string,
  clienteId: number | null,
): Promise<Matriz> {
  const rpc = await supabaseServer.rpc("switch_productos_por_cliente", {
    p_empresa_key: empresa,
    p_desde: desde,
    p_hasta: hasta,
    p_cliente_id: clienteId,
  });

  if (!rpc.error) {
    const d = (rpc.data ?? {}) as { filas?: unknown; sin_descripcion?: unknown };
    return {
      filas: normalizar((d.filas ?? []) as Record<string, unknown>[]),
      sinDescripcion: Number(d.sin_descripcion ?? 0),
    };
  }

  if (!funcionNoCreada(rpc.error)) {
    // Un error de verdad (timeout, permisos) NO cae al camino largo: la base
    // está en compute Micro y contestarle a un timeout con 40 consultas más es
    // empujar la caída, no evitarla.
    console.error("[productos/por-cliente] rpc:", rpc.error.message);
    throw new Error(rpc.error.message);
  }

  // ── Camino sin RPC: leer y agrupar acá ───────────────────────────────────
  const gte = bordePanama(desde);
  const lt = bordePanama(diaSiguiente(hasta));
  const leerLineas = () => leerTodoPaginado<LineaConCodigo>(
    "switch_factura_lineas (productos por cliente)",
    (pedirCount, d, h) => {
      let q = supabaseServer
        .from("switch_factura_lineas")
        .select(
          "tipo_comprobante, cliente_switch_id, cliente_nombre, codigo, cantidad, subtotal_con_descuento",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("empresa_key", empresa)
        .gte("fecha", gte)
        .lt("fecha", lt);
      if (clienteId != null) q = q.eq("cliente_switch_id", clienteId);
      return q.order("id", { ascending: true }).range(d, h);
    },
  );

  // 🔑 SIN CLIENTE, LAS DOS LECTURAS VAN A LA PAR. Son el caso caro (12.726
  // líneas + 11.545 filas de diario en fashion_wear / año en curso, o sea 25
  // idas y vueltas encadenadas: 7,9 s medidos) y no dependen una de la otra.
  // En paralelo son DOS conexiones a la vez, no veinticinco: eso no satura nada
  // —lo que satura es abanicar una consulta por página— y baja a la mitad.
  if (clienteId == null) {
    const [lineas, mapa] = await Promise.all([
      leerLineas(),
      leerMapa(empresa, desde, hasta, null),
    ]);
    return armarMatriz(lineas, mapa);
  }

  // Con UN cliente, en cambio, el mapa se pide SÓLO por sus códigos —y para eso
  // hay que tener las líneas primero—. Es la diferencia entre 2 viajes y 22.
  const lineas = await leerLineas();
  const codigos = lineas.map(l => l.codigo).filter((c): c is string => typeof c === "string" && c !== "");
  return armarMatriz(lineas, await leerMapa(empresa, desde, hasta, codigos));
}
