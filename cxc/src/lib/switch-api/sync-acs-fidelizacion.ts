/**
 * Sync de fidelización ACS (american_classic, instancia Switch MULTI):
 *
 *   1) Directorio de clientes: /apicliente/lista → switch_clientes
 *      (empresa_key='american_classic'), incluyendo telefono/celular/email y
 *      raw_data completo (trae codTelefono y fechaCreacion, que usa la pestaña
 *      Clientes). Mismo shape/upsert que persistClientesDirectorio del sync CXC.
 *
 *   2) Detalle de facturas: /apifactura/info por factura → guarda
 *      descuentoGlobalPorcentaje en switch_facturas.descuento_global_pct
 *      (regla de negocio: el 5% de fidelización SIEMPRE va como descuento
 *      global). Procesa las PENDIENTES (detalle_synced_at IS NULL) de más
 *      nueva a más vieja, tope MAX_DETALLE_POR_CORRIDA por corrida (~50
 *      nuevas/día → el excedente inicial es backfill que converge en días).
 *
 * SESIÓN ÚNICA Switch: la instancia MULTI mantiene 1 token por empresa. Este
 * sync corre en su propio cron (08:15 UTC), espaciado de multifashion-sync
 * (05:00) y de switch-sync american_classic (06:30) — nunca en paralelo.
 */

import { createSwitchClient } from "./client";
import { supabaseServer } from "@/lib/supabase-server";

const EMPRESA_KEY = "american_classic";
const CLIENTES_PAGE = 200; // Switch capea ~50 por página; cortamos por accumulated
const MAX_CLIENTES_PAGES = 100;
const MAX_DETALLE_POR_CORRIDA = 200;

export interface AcsFidelizacionResult {
  clientes: number;
  detallesProcesados: number;
  detallesPendientes: number;
  errores: string[];
}

export async function runAcsFidelizacionSync(): Promise<AcsFidelizacionResult> {
  const errores: string[] = [];
  const client = createSwitchClient(EMPRESA_KEY);
  const runStamp = new Date().toISOString();

  // ── 1) Directorio de clientes → switch_clientes ────────────────────────────
  let clientesCount = 0;
  try {
    const clientes: { id?: unknown; [k: string]: unknown }[] = [];
    for (let page = 1; page <= MAX_CLIENTES_PAGES; page++) {
      const resp = await client.listClientes({ porPagina: CLIENTES_PAGE, paginaActual: page });
      const batch = resp.clientes ?? [];
      if (batch.length === 0) break;
      clientes.push(...batch);
      const total = Number(resp.paginacion?.total ?? 0);
      if (total > 0 && clientes.length >= total) break;
    }

    // Dedupe por id (último gana) — mismo criterio que persistClientesDirectorio.
    const byId = new Map<number, (typeof clientes)[number]>();
    for (const c of clientes) {
      if (typeof c.id === "number") byId.set(c.id, c);
    }
    const payload = Array.from(byId.values()).map((c) => ({
      empresa_key: EMPRESA_KEY,
      cliente_switch_id: c.id as number,
      codigo: (c.codigo as string) ?? null,
      nombre: (c.nombre as string) ?? null,
      razonsocial: (c.razonsocial as string) ?? null,
      email: (c.email as string) ?? null,
      telefono: (c.telefono as string) ?? null,
      celular: (c.celular as string) ?? null,
      identificacion: (c.identificacion as string) ?? null,
      raw_data: c, // conserva codTelefono, fechaCreacion, vendedor, etc.
      synced_at: runStamp,
      updated_at: runStamp,
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabaseServer
        .from("switch_clientes")
        .upsert(payload.slice(i, i + 500), { onConflict: "empresa_key,cliente_switch_id" });
      if (error) throw new Error(`upsert switch_clientes: ${error.message}`);
    }
    clientesCount = payload.length;
  } catch (err) {
    errores.push(`clientes: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2) Detalle de facturas pendientes → descuento_global_pct ───────────────
  let detallesProcesados = 0;
  let detallesPendientes = 0;
  try {
    const { data: pendientes, error: selErr, count } = await supabaseServer
      .from("switch_facturas")
      .select("switch_factura_id, secuencial", { count: "exact" })
      .eq("empresa_key", EMPRESA_KEY)
      .eq("tipo_comprobante", "Factura")
      .is("detalle_synced_at", null)
      .order("fecha", { ascending: false })
      .limit(MAX_DETALLE_POR_CORRIDA);
    if (selErr) throw new Error(`select pendientes: ${selErr.message}`);

    detallesPendientes = count ?? pendientes?.length ?? 0;

    for (const f of pendientes ?? []) {
      try {
        // /apifactura/info: la respuesta real trae { factura: {...}, detalle: [...] }.
        const info = (await client.getFactura(f.switch_factura_id)) as unknown as {
          factura?: { descuentoGlobalPorcentaje?: string | number };
        };
        const rawPct = info?.factura?.descuentoGlobalPorcentaje;
        const pct = rawPct === null || rawPct === undefined || rawPct === ""
          ? null
          : parseFloat(String(rawPct));
        if (pct === null || !Number.isFinite(pct)) {
          // Respuesta sin el campo → no marcar synced (reintenta mañana) y dejar rastro.
          errores.push(`detalle ${f.secuencial}: sin descuentoGlobalPorcentaje en la respuesta`);
          continue;
        }
        const { error: updErr } = await supabaseServer
          .from("switch_facturas")
          .update({ descuento_global_pct: pct, detalle_synced_at: new Date().toISOString() })
          .eq("empresa_key", EMPRESA_KEY)
          .eq("switch_factura_id", f.switch_factura_id);
        if (updErr) throw new Error(updErr.message);
        detallesProcesados++;
      } catch (err) {
        errores.push(`detalle ${f.secuencial}: ${err instanceof Error ? err.message : String(err)}`);
        // Errores consecutivos = API caída/columna faltante → abortar la pasada,
        // no quemar 200 llamadas contra un muro.
        if (errores.length >= 5 && detallesProcesados === 0) break;
      }
    }
    detallesPendientes = Math.max(0, detallesPendientes - detallesProcesados);
  } catch (err) {
    errores.push(`detalle: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { clientes: clientesCount, detallesProcesados, detallesPendientes, errores };
}
