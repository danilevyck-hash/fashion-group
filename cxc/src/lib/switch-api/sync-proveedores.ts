// ─────────────────────────────────────────────────────────────────────────────
// Sync de Cuentas por Pagar (proveedores) — Fase 1.
//
// Por empresa con CxP (empresasConCxp = 6 B2B + Multifashion): itera /apiproveedor/lista y luego
// /apiproveedor/info?proveedorId=X (NO documentado; trae saldoTotal + aging
// bucketizado + ledger facturas/pagos). Calcula agregados y upserta una fila por
// (empresa, proveedor) en switch_proveedor_estadocuenta.
//
// Espejo del sync de CXC (switch_estadocuenta) pero AGREGADO por proveedor, porque
// Switch ya da el aging calculado. SECUENCIAL por empresa (token único de Switch).
//
// CAVEAT del endpoint: /apiproveedor/info devuelve HTTP 200 incluso en excepción
// (página HTML). Por eso validamos el SHAPE (estadodecuenta.saldos/elements son
// arrays); si no, ese proveedor se marca fallido y NO se escribe basura.
//
// buildProveedorRows() es READ-ONLY (no escribe) → lo reusa el preview de Fase 1
// antes de que exista la tabla.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchClient } from "./client";
import { particionarFilas } from "./monto-guard";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { clearStaleRunning } from "./sync-log";
import { empresasConCxp } from "./empresas";
import { derivarProveedor } from "@/lib/proveedores-derivados";
import { hoyPanama } from "@/lib/fecha-panama";
import type { EmpresaKey } from "@/lib/empresa-mapping";

const PROVEEDORES_PAGE = 50;
const MAX_PROVEEDOR_PAGES = 200; // tope defensivo de paginación
const UPSERT_BATCH = 200;

export interface ProveedorCxpRow {
  empresa_key: string;
  proveedor_switch_id: number;
  codigo: string | null;
  nombre: string;
  identificacion: string | null;
  dv: string | null;
  direccion: string | null;
  contacto: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  tipo_proveedor: string | null;
  saldo_total: number;
  aging: unknown[];
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null; // YYYY-MM-DD
  ultimo_pago_dias: number | null;
  elements: unknown[];
}

export interface ProveedorSyncResult {
  empresaKey: string;
  ok: boolean;
  proveedores: number;   // proveedores upserted
  fallidos: number;      // proveedores con shape inválido (HTML-200) o sin id
  purgados?: number;     // filas locales cuyo proveedor ya no existe en Switch
  error?: string;
}

const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

const clean = (s: unknown): string | null => {
  const v = typeof s === "string" ? s.trim() : s == null ? "" : String(s);
  return v === "" ? null : v;
};

// El campo derivado que queda (Último pago) se calcula en
// src/lib/proveedores-derivados.ts — módulo puro COMPARTIDO con la lectura del
// módulo Proveedores. Acá vivían un `parseFecha()` que exigía DD-MM-YYYY (Switch
// manda YYYY-MM-DD → devolvía null 821 de 821 veces y las tres columnas salían
// en cero) y un agregador que contaba las notas de crédito como pagos. El
// encabezado de ese archivo tiene el diagnóstico completo.
//
// ⛔ "Comprado YTD" / "Pagado YTD" se ELIMINARON el 27-jul-2026: el ledger de
// /apiproveedor/info solo trae lo que todavía se debe, así que los dos totales
// eran un subconjunto arbitrario del año. No se reconstruyen desde acá.

/**
 * READ-ONLY: trae proveedores + estado de cuenta de UNA empresa y devuelve las
 * filas calculadas (NO escribe). Reusado por el preview y por el sync.
 * Devuelve también el conteo de proveedores con shape inválido (fallidos).
 */
export async function buildProveedorRows(
  empresaKey: EmpresaKey,
): Promise<{ rows: ProveedorCxpRow[]; fallidos: number; listedIds: number[]; listaCompleta: boolean }> {
  const client = createSwitchClient(empresaKey);
  const hoy = hoyPanama();

  // 1) Listar todos los proveedores (paginación segura: cortar por accumulated>=total).
  const proveedores: { id: number; nombre?: string }[] = [];
  let totalReportado = 0;
  for (let page = 1; page <= MAX_PROVEEDOR_PAGES; page++) {
    const resp = await client.listProveedores({ porPagina: PROVEEDORES_PAGE, paginaActual: page });
    const batch = Array.isArray(resp?.proveedores) ? resp.proveedores : [];
    if (batch.length === 0) break;
    proveedores.push(...batch);
    const total = Number(resp?.paginacion?.total ?? 0);
    if (page === 1) totalReportado = total;
    if (total > 0 && proveedores.length >= total) break;
  }

  const rows: ProveedorCxpRow[] = [];
  let fallidos = 0;

  // 2) Estado de cuenta por proveedor (secuencial: token único).
  for (const p of proveedores) {
    if (typeof p.id !== "number") { fallidos++; continue; }
    let info;
    try {
      info = await client.getProveedorInfo(p.id);
    } catch {
      fallidos++;
      continue;
    }
    // Validar SHAPE (el endpoint da 200 con HTML en error).
    const ec = info?.estadodecuenta;
    if (!ec || !Array.isArray(ec.saldos) || !Array.isArray(ec.elements)) {
      fallidos++;
      continue;
    }

    const prov = info.proveedor ?? {};
    const agg = derivarProveedor(ec.elements, { hoy });

    rows.push({
      empresa_key: empresaKey,
      proveedor_switch_id: p.id,
      codigo: clean(prov.codigo),
      nombre: clean(prov.nombre) ?? clean(p.nombre) ?? `Proveedor ${p.id}`,
      identificacion: clean(prov.identificacion),
      dv: clean(prov.dv),
      direccion: clean(prov.direccion),
      contacto: clean(prov.contacto),
      telefono: clean(prov.telefono),
      celular: clean(prov.celular),
      email: clean(prov.email),
      tipo_proveedor: clean(prov.tipoproveedor),
      saldo_total: Math.round(num(ec.saldoTotal) * 100) / 100,
      aging: ec.saldos,
      ...agg,
      elements: ec.elements,
    });
  }

  // listedIds = TODOS los ids que Switch listó (incluye fallidos de /info): la
  // purga de ausentes se decide contra la LISTA, no contra los upserted — un
  // proveedor cuyo /info falló hoy sigue existiendo y NO debe borrarse.
  const listedIds = proveedores.filter((p) => typeof p.id === "number").map((p) => p.id);
  // Purga segura solo si la paginación cubrió el total reportado (o Switch no
  // reportó total). Lista incompleta → no purgar (borraría proveedores vivos).
  const listaCompleta = totalReportado === 0 || proveedores.length >= totalReportado;

  return { rows, fallidos, listedIds, listaCompleta };
}

// ─── Logging a switch_sync_log (tolerante: no bloquea si falla) ───────────────
async function createLog(empresaKey: string, triggeredBy: string): Promise<string | null> {
  // Auto-sana logs huérfanos antes del insert: con el índice único de 'running'
  // (DDL 20260723150000) una fila atascada bloquearía este insert para siempre.
  await clearStaleRunning(empresaKey, "proveedores");
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .insert({
      empresa_key: empresaKey,
      sync_type: "proveedores",
      status: "running",
      started_at: new Date().toISOString(),
      triggered_by: triggeredBy,
      records_inserted: 0,
      records_updated: 0,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[sync ${empresaKey} proveedores] createLog falló (sigue igual): ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

async function finishLog(
  logId: string | null,
  status: "success" | "error",
  n: number,
  err?: string,
  // Los descartes del guard de montos. De acá sale el anti-loop del aviso: sin
  // persistirlos, el recordatorio volvería a sonar en cada corrida.
  skipDetails?: unknown[],
): Promise<void> {
  if (!logId) return;
  await supabaseServer
    .from("switch_sync_log")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_updated: n,
      error_message: err ?? null,
      ...(skipDetails && skipDetails.length > 0
        ? { records_skipped: skipDetails.length, skip_details: skipDetails }
        : {}),
    })
    .eq("id", logId);
}

/** Sync de UNA empresa: build + upsert + log. */
export async function syncEmpresaProveedores(
  empresaKey: EmpresaKey,
  triggeredBy = "cron",
): Promise<ProveedorSyncResult> {
  const logId = await createLog(empresaKey, triggeredBy);
  try {
    const { rows: crudas, fallidos, listedIds, listaCompleta } = await buildProveedorRows(empresaKey);

    // Guard de montos imposibles. ⚠️ Esta familia tiene el piso MÁS ALTO ($20M)
    // y no es por capricho: el récord real y LEGÍTIMO de la tabla es
    // $2.074.195,21 (fashion_wear · American Fashion Wear, SA) y hay 3 filas
    // sobre el millón, todas de proveedores intercompañía. No es un documento:
    // es el saldo ACUMULADO de una cuenta corriente de importación. Un piso de
    // $1M copiado del guard de costo habría rechazado datos buenos el día 1.
    const umbralProveedor = await calibrarUmbral("proveedor", empresaKey);
    const { buenas: rows, rechazadas } = particionarFilas(
      "proveedor",
      crudas,
      umbralProveedor,
      (f) => f.nombre,
    );
    if (rechazadas.length > 0) {
      console.error(
        `[sync ${empresaKey} proveedores] ${rechazadas.length} proveedor(es) con monto IMPOSIBLE (umbral ${umbralProveedor}) — no se guardaron`,
        rechazadas.map((r) => r.clave),
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const slice = rows.slice(i, i + UPSERT_BATCH).map((r) => ({ ...r, synced_at: now, updated_at: now }));
      const { error } = await supabaseServer
        .from("switch_proveedor_estadocuenta")
        .upsert(slice, { onConflict: "empresa_key,proveedor_switch_id" });
      if (error) throw new Error(`upsert switch_proveedor_estadocuenta: ${error.message}`);
      upserted += slice.length;
    }

    // Purga de AUSENTES (audit jul-2026): la tabla es un snapshot puro de
    // /apiproveedor (se reconstruye completa en cada corrida, sin FKs ni
    // histórico propio) → DELETE de las filas cuyo proveedor ya no está en la
    // lista de Switch (proveedores borrados dejaban filas fantasma con saldo
    // viejo para siempre). Guard: solo con lista completa y no-vacía.
    let purgados = 0;
    if (listaCompleta && listedIds.length > 0) {
      const { data: borrados, error: delErr } = await supabaseServer
        .from("switch_proveedor_estadocuenta")
        .delete()
        .eq("empresa_key", empresaKey)
        .not("proveedor_switch_id", "in", `(${listedIds.join(",")})`)
        .select("proveedor_switch_id");
      if (delErr) {
        // La purga no invalida el sync (los datos upserted ya están frescos).
        console.error(`[sync ${empresaKey} proveedores] purga de ausentes falló: ${delErr.message}`);
      } else {
        purgados = (borrados ?? []).length;
        if (purgados > 0) {
          console.error(`[sync ${empresaKey} proveedores] purgados ${purgados} proveedores ausentes en Switch`);
        }
      }
    }

    await finishLog(
      logId,
      "success",
      upserted,
      undefined,
      rechazadas.length > 0 ? detallesDeRechazo("proveedor", rechazadas, umbralProveedor) : undefined,
    );

    // Aviso DESPUÉS de escribir; nunca tumba la corrida.
    if (rechazadas.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "proveedor",
          empresaKey,
          syncType: "proveedores",
          rechazadas,
          umbral: umbralProveedor,
          logId,
        });
      } catch (e) {
        console.error(`[sync ${empresaKey} proveedores] no pude avisar el monto imposible: ${String(e)}`);
      }
    }

    return { empresaKey, ok: true, proveedores: upserted, fallidos, purgados };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLog(logId, "error", 0, msg);
    return { empresaKey, ok: false, proveedores: 0, fallidos: 0, error: msg };
  }
}

/** Sync de todas las B2B (serial; tolerante: una falla → las demás siguen). */
export async function syncAllProveedores(triggeredBy = "cron"): Promise<ProveedorSyncResult[]> {
  const results: ProveedorSyncResult[] = [];
  // SECUENCIAL (token único de Switch). empresasConCxp() = 6 B2B + Multifashion.
  for (const empresaKey of empresasConCxp()) {
    results.push(await syncEmpresaProveedores(empresaKey, triggeredBy));
  }
  return results;
}
