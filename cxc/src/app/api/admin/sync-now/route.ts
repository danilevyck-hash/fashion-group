/**
 * POST /api/admin/sync-now — sync manual on-demand ("Actualizar ahora").
 *
 * Body: { modulo, empresa? } con modulo ∈ estadocuenta | facturas | recibos |
 * clientes-master | catalogo-reebok | catalogo-joybees. estadocuenta/facturas/
 * recibos exigen empresa (UNA por disparo — sesión única de Switch);
 * clientes-master y catálogos no llevan empresa (catálogos fijan la suya:
 * active_shoes / joystep).
 *
 * Candado de 3 capas ANTES de disparar (ver lib/switch-api/sync-now.ts):
 *   a) running (fila 'running' fresca en switch_sync_log; el lock REAL es el
 *      índice único parcial switch_sync_log_running_lock — DDL 20260723150000,
 *      manual; mientras no corra, queda el pre-check),
 *   b) cron-proximo (próximo cron de esa empresa en <= 40 min),
 *   c) cooldown (último success hace < 10 min).
 *
 * Respuestas: 200 {ok, duracionMs, resumen} · 409 {motivo, detalle} ·
 * 400 body inválido · 401/403 sin permiso · 500 error del sync.
 *
 * Ejecuta la lib correspondiente IN-PROCESS con triggeredBy:'manual' y cierra
 * las sesiones Switch abiertas al final (higiene de sesión única, igual que
 * los crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
} from "@/lib/switch-api/sync-empresa";
import { syncEmpresaRecibos, mesesCronRecibos } from "@/lib/switch-api/sync-recibos";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { clearStaleRunning, isRunningLockConflict } from "@/lib/switch-api/sync-log";
import {
  isSyncNowModulo,
  moduloConfig,
  lockKeyDe,
  precheckSyncNow,
  proximoCronDe,
  nombreEmpresa,
  rolesSyncNow,
  type SyncNowModulo,
} from "@/lib/switch-api/sync-now";
import type { EmpresaKey } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

/** 409 estándar cuando el insert de la fila 'running' chocó con el lock (raza
 *  que el pre-check no alcanzó a ver). */
function respuestaLockOcupado(): NextResponse {
  return NextResponse.json(
    {
      motivo: "running",
      detalle: "Ya hay una actualización en curso (empezó hace un momento). Espera a que termine.",
    },
    { status: 409 },
  );
}

async function fetchRunningStartedAt(empresaKey: string, syncType: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at")
    .eq("empresa_key", empresaKey)
    .eq("sync_type", syncType)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Fail-open del pre-check: el lock real (índice único) sigue protegiendo.
    console.error(`[sync-now] no pude leer running de ${empresaKey}/${syncType}: ${error.message}`);
    return null;
  }
  return (data as { started_at: string } | null)?.started_at ?? null;
}

async function fetchLastSuccessFinishedAt(
  empresaKey: string | null,
  syncType: string | null,
): Promise<string | null> {
  if (empresaKey && syncType) {
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .select("finished_at")
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(`[sync-now] no pude leer último success de ${empresaKey}/${syncType}: ${error.message}`);
      return null;
    }
    return (data as { finished_at: string } | null)?.finished_at ?? null;
  }
  // clientes-master no escribe switch_sync_log → cooldown por su heartbeat de cron.
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .eq("cron_name", "sync-clientes-master")
    .maybeSingle();
  if (error) {
    console.error(`[sync-now] no pude leer heartbeat sync-clientes-master: ${error.message}`);
    return null;
  }
  return (data as { last_success_at: string } | null)?.last_success_at ?? null;
}

/** Refresca la MV de aging de CXC tras un estadocuenta manual (espejo del cron
 *  switch-sync tipo=estadocuenta). Tolerante: si falla, solo log. */
async function refreshAgingMv(): Promise<void> {
  try {
    const { error } = await supabaseServer.rpc("refresh_switch_estadocuenta_aging_mv");
    if (error) console.error(`[sync-now] refresh aging_mv falló (no fatal): ${error.message}`);
  } catch (err) {
    console.error(`[sync-now] refresh aging_mv threw (no fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function ejecutar(
  modulo: SyncNowModulo,
  empresa: string | null,
): Promise<{ resumen: string } | { error: string }> {
  switch (modulo) {
    case "estadocuenta": {
      const r = await syncEmpresaEstadoCuenta(empresa as EmpresaKey, {
        desde: panamaDate(-7),
        hasta: panamaDate(0),
        triggeredBy: "manual",
      });
      await refreshAgingMv();
      return {
        resumen: `${nombreEmpresa(r.empresaKey)}: cuentas por cobrar al día (${r.inserted + r.updated} documentos)`,
      };
    }
    case "facturas": {
      const r = await syncEmpresaFacturas(empresa as EmpresaKey, {
        desde: panamaDate(-7),
        hasta: panamaDate(0),
        triggeredBy: "manual",
      });
      return {
        resumen: `${nombreEmpresa(r.empresaKey)}: ventas al día (${r.inserted} nuevas · ${r.updated} actualizadas)`,
      };
    }
    case "recibos": {
      const r = await syncEmpresaRecibos(empresa as EmpresaKey, mesesCronRecibos(), "manual");
      if (!r.ok) return { error: r.error ?? "sync de recibos falló" };
      return {
        resumen: `${nombreEmpresa(r.empresaKey)}: ${r.recibos} recibos al día (últimos ${r.meses} meses)`,
      };
    }
    case "clientes-master": {
      const r = await syncClientesMaster();
      if (!r.ok) return { error: r.error ?? "sync de clientes falló" };
      return { resumen: `${r.upserted} clientes actualizados` };
    }
    case "catalogo-reebok":
    case "catalogo-joybees": {
      const r = await (modulo === "catalogo-reebok"
        ? syncCatalogoReebok({ triggeredBy: "manual" })
        : syncCatalogoJoybees({ triggeredBy: "manual" }));
      const emp = r.empresas[0];
      if (r.hadError || !emp || emp.error) {
        return { error: emp?.error ?? "sync de catálogo falló" };
      }
      return {
        resumen: `Catálogo al día: ${emp.actualizados} actualizados · ${emp.agregados} nuevos · ${emp.ocultados} ocultados`,
      };
    }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Universo de roles con acceso a ALGÚN módulo (401/403 primero, como siempre);
  // el permiso fino por módulo se valida más abajo con rolesSyncNow.
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  let body: { modulo?: unknown; empresa?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const modulo = typeof body.modulo === "string" ? body.modulo : "";
  if (!isSyncNowModulo(modulo)) {
    return NextResponse.json({ error: `modulo inválido: ${modulo}` }, { status: 400 });
  }

  // Vendedor SOLO puede disparar catálogos; los demás módulos siguen
  // admin+secretaria (admin siempre pasa requireRole).
  if (auth.role !== "admin" && !rolesSyncNow(modulo).includes(auth.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const cfg = moduloConfig(modulo);
  let empresa: string | null = null;
  if (cfg.empresas) {
    empresa = typeof body.empresa === "string" ? body.empresa : "";
    if (!empresa || !cfg.empresas.includes(empresa)) {
      return NextResponse.json(
        { error: `empresa inválida para ${modulo}: ${empresa || "(vacía)"}` },
        { status: 400 },
      );
    }
  }

  const ahora = new Date();

  // ── Candado de 3 capas ─────────────────────────────────────────────────────
  const lock = lockKeyDe(modulo, empresa);
  if (lock) {
    // Limpia huérfanos (>30 min) para que ni el pre-check ni el índice único
    // se queden trancados con un run que murió sin finalizar.
    await clearStaleRunning(lock.empresaKey, lock.syncType);
  }
  const [runningStartedAt, lastSuccessFinishedAt] = await Promise.all([
    lock ? fetchRunningStartedAt(lock.empresaKey, lock.syncType) : Promise.resolve(null),
    fetchLastSuccessFinishedAt(lock?.empresaKey ?? null, lock?.syncType ?? null),
  ]);
  const bloqueo = precheckSyncNow({
    ahora,
    runningStartedAt,
    lastSuccessFinishedAt,
    proximo: proximoCronDe(modulo, empresa, ahora),
  });
  if (bloqueo) {
    return NextResponse.json(bloqueo, { status: 409 });
  }

  // ── Disparo in-process ─────────────────────────────────────────────────────
  const t0 = Date.now();
  try {
    const r = await ejecutar(modulo, empresa);
    if ("error" in r) {
      // Raza contra el lock real: otro disparo ganó el insert de 'running'.
      if (isRunningLockConflict(r.error)) return respuestaLockOcupado();
      console.error(`[sync-now] ${modulo}${empresa ? `/${empresa}` : ""} falló: ${r.error}`);
      return NextResponse.json(
        { error: "No se pudo actualizar. Intenta de nuevo en unos minutos." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, duracionMs: Date.now() - t0, resumen: r.resumen });
  } catch (err) {
    if (isRunningLockConflict(err)) return respuestaLockOcupado();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-now] ${modulo}${empresa ? `/${empresa}` : ""} threw: ${msg}`);
    return NextResponse.json(
      { error: "No se pudo actualizar. Intenta de nuevo en unos minutos." },
      { status: 500 },
    );
  } finally {
    // Higiene de sesión única (igual que los crons): cerrar las sesiones de
    // Switch que este proceso abrió — un token vivo ~60 min mataría el login
    // del próximo cron de la misma empresa (code 0006). No-op si no abrió.
    if (cfg.tocaSwitch) await logoutAllSwitchSessions();
  }
}
