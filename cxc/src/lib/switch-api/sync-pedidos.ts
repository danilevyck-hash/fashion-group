// ─────────────────────────────────────────────────────────────────────────────
// sync-pedidos — los pedidos ACTIVOS (= sin facturar) de Switch → switch_pedidos
// (Guías › «Pedidos», 5-oct-2026, `PEDIDOS_BODEGA_2026_10`).
//
// Por empresa, SECUENCIAL (sesión única de Switch): baja `/apipedido/lista`
// con estatus «Activo» del último año, quita los clientes que no entran
// (`pedidoEntra`) y deja la tabla IGUAL a la lista: lo que Switch ya facturó se
// borra. Solo borra si la lista llegó COMPLETA (paginación cuadra).
// 🔴 Nunca toca `pedidos_bodega_estado` (lo que marcó bodega).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchClient, type SwitchPedidoListaRow } from "./client";
import { clearStaleRunning } from "./sync-log";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fechaSwitchAIso, pedidoEntra } from "@/lib/guias/pedidos-bodega";
import { bajarLineasQueFaltan } from "@/lib/guias/pedido-detalle-server";

const PAGINA = 50;
const MAX_PAGINAS = 200;
const DIAS_ATRAS = 365;

export const EMPRESAS_PEDIDOS = B2B_EMPRESA_KEYS;

export interface PedidosSyncResult {
  empresaKey: string;
  ok: boolean;
  pedidos: number;
  excluidos: number;
  borrados: number;
  error?: string;
}

/** «27,431.0000» → 27431. Los números de Switch no se recalculan, solo se leen. */
const dinero = (v: unknown) => Math.round(Number(String(v ?? 0).replace(/,/g, "")) * 100) / 100 || 0;

const sumarDias = (ymd: string, d: number) => new Date(Date.parse(ymd) + d * 86_400_000).toISOString().slice(0, 10);

async function codigosConFicha(): Promise<Set<string>> {
  const filas = await leerTodoPaginado<{ codigo: string | null }>("clientes_master (fichas)", (pedirCount, from, to) =>
    supabaseServer
      .from("clientes_master")
      .select("codigo", pedirCount ? { count: "exact" } : {})
      .eq("deleted", false)
      .order("codigo")
      .range(from, to),
  );
  return new Set(filas.map((f) => (f.codigo ?? "").trim().toUpperCase()).filter(Boolean));
}

async function syncEmpresa(empresaKey: string, fichas: Set<string>, triggeredBy: string): Promise<PedidosSyncResult> {
  await clearStaleRunning(empresaKey, "pedidos");
  const { data: log } = await supabaseServer
    .from("switch_sync_log")
    .insert({ empresa_key: empresaKey, sync_type: "pedidos", status: "running", started_at: new Date().toISOString(), triggered_by: triggeredBy, records_inserted: 0, records_updated: 0 })
    .select("id")
    .single();
  const terminar = (status: "success" | "error", n: number, err?: string) =>
    log?.id
      ? supabaseServer.from("switch_sync_log").update({ status, finished_at: new Date().toISOString(), records_updated: n, error_message: err ?? null }).eq("id", log.id)
      : Promise.resolve();

  try {
    const client = createSwitchClient(empresaKey);
    const hoy = hoyPanama();
    const lista: SwitchPedidoListaRow[] = [];
    let total = 0;
    for (let p = 1; p <= MAX_PAGINAS; p++) {
      const d = await client.listPedidos({ desde: sumarDias(hoy, -DIAS_ATRAS), hasta: sumarDias(hoy, 1), porPagina: PAGINA, paginaActual: p, estatus: "Activo" });
      const lote = Array.isArray(d?.pedidos) ? d.pedidos : [];
      if (p === 1) total = Number(d?.paginacion?.total ?? 0);
      lista.push(...lote);
      if (lote.length < PAGINA || (total > 0 && lista.length >= total)) break;
    }
    const completa = total === 0 || lista.length >= total;

    const ids = [...new Set(lista.map((r) => Number(r.clienteId)).filter(Number.isFinite))];
    const codigoDe = new Map<number, string>();
    if (ids.length > 0) {
      const { data, error } = await supabaseServer.from("switch_clientes").select("cliente_switch_id, codigo").eq("empresa_key", empresaKey).in("cliente_switch_id", ids);
      if (error) throw new Error(`switch_clientes: ${error.message}`);
      for (const c of data ?? []) codigoDe.set(Number(c.cliente_switch_id), String(c.codigo ?? ""));
    }

    const now = new Date().toISOString();
    const filas = lista
      .filter((r) => pedidoEntra(codigoDe.get(Number(r.clienteId)), fichas))
      .map((r) => ({
        empresa_key: empresaKey,
        pedido_switch_id: Number(r.id),
        secuencial: String(r.secuencial ?? r.id),
        fecha: fechaSwitchAIso(String(r.fecha ?? "")),
        cliente_switch_id: Number(r.clienteId),
        cliente_codigo: codigoDe.get(Number(r.clienteId))!.trim().toUpperCase(),
        cliente_nombre: String(r.cliente ?? "").trim() || "—",
        vendedor_nombre: r.vendedor ? String(r.vendedor).trim() : null,
        total: dinero(r.total), // Switch a veces manda «27,431.0000»
        // 🔴 El pie del papel sale de AQUÍ, no de una suma nuestra: Switch ya
        // manda subtotal e impuesto en la misma fila.
        subtotal: dinero(r.subTotal),
        impuesto: dinero(r.impuesto),
        synced_at: now,
      }));

    if (filas.length > 0) {
      const { error } = await supabaseServer.from("switch_pedidos").upsert(filas, { onConflict: "empresa_key,pedido_switch_id" });
      if (error) throw new Error(`upsert switch_pedidos: ${error.message}`);
    }

    // Las líneas de cada pedido, para que la lista diga sus unidades sin
    // tener que abrirlo (8-oct-2026). Misma sesión de Switch; falla abierta.
    await bajarLineasQueFaltan(empresaKey, filas.map((f) => f.pedido_switch_id));

    // Lo que ya no está Activo (facturado) se va. Solo con la lista completa.
    let borrados = 0;
    if (completa) {
      let q = supabaseServer.from("switch_pedidos").delete().eq("empresa_key", empresaKey);
      if (filas.length > 0) q = q.not("pedido_switch_id", "in", `(${filas.map((f) => f.pedido_switch_id).join(",")})`);
      const { data, error } = await q.select("pedido_switch_id");
      if (error) throw new Error(`purga switch_pedidos: ${error.message}`);
      borrados = data?.length ?? 0;
    }

    await terminar("success", filas.length);
    return { empresaKey, ok: true, pedidos: filas.length, excluidos: lista.length - filas.length, borrados };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await terminar("error", 0, msg);
    return { empresaKey, ok: false, pedidos: 0, excluidos: 0, borrados: 0, error: msg };
  }
}

/** UNA empresa, para «Actualizar» (sync-now). */
export async function syncEmpresaPedidos(empresaKey: string, triggeredBy = "manual"): Promise<PedidosSyncResult> {
  return syncEmpresa(empresaKey, await codigosConFicha(), triggeredBy);
}

export async function syncAllPedidos(triggeredBy = "cron"): Promise<PedidosSyncResult[]> {
  const fichas = await codigosConFicha();
  const out: PedidosSyncResult[] = [];
  for (const e of EMPRESAS_PEDIDOS) out.push(await syncEmpresa(e, fichas, triggeredBy));
  return out;
}
