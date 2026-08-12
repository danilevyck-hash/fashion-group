/**
 * POST /api/admin/sync-now — sync manual on-demand ("Actualizar ahora").
 *
 * Body: { modulo, empresa? } con modulo ∈ estadocuenta | facturas | recibos |
 * clientes-master | catalogo-reebok | catalogo-joybees | catalogo-tommy |
 * proveedores | refresh-vistas. estadocuenta/facturas/recibos/proveedores
 * exigen empresa (UNA por disparo — sesión única de Switch); clientes-master,
 * catálogos y refresh-vistas no llevan empresa (catálogos fijan la suya:
 * active_shoes / joystep / fashion_shoes; refresh-vistas es DB-only — RPCs de
 * MVs de Ventas, sin Switch).
 *
 * Candado de 2 capas ANTES de disparar (ver lib/switch-api/sync-now.ts):
 *   a) running (fila 'running' fresca de esa EMPRESA en switch_sync_log — del
 *      mismo tipo o de CUALQUIER otro sync_type, ej. un cron corriendo YA; el
 *      lock REAL es el índice único parcial switch_sync_log_running_lock —
 *      DDL 20260723150000, manual; mientras no corra, queda el pre-check),
 *   b) cooldown (último success hace < 10 min).
 *
 * La ventana "cron-proximo" se ELIMINÓ (jul-2026): el clic siempre actualiza.
 * Trade-off aceptado: un manual pegado a la ventana de un cron de la MISMA
 * empresa puede matarle el token al otro (sesión única, code 0006) — el que
 * pierda falla limpio y switch-reconciliacion lo recupera (ambos fail-safe).
 *
 * Respuestas: 200 {ok, duracionMs, resumen} · 409 {motivo, detalle} ·
 * 400 body inválido · 401/403 sin permiso · 500 error del sync.
 * El 409 motivo "running" NO se muestra al usuario: SyncNowButton se engancha
 * al sync en curso (re-intenta cada ~5s) y refresca la vista al terminar.
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
import { syncEmpresaProveedores } from "@/lib/switch-api/sync-proveedores";
import { runRefreshVistas } from "@/lib/refresh-vistas";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { syncCatalogoTommy } from "@/lib/switch-api/sync-catalogo-tommy";
import { syncCatalogoCalvin } from "@/lib/switch-api/sync-catalogo-calvin";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { clearStaleRunning, isRunningLockConflict } from "@/lib/switch-api/sync-log";
import {
  isSyncNowModulo,
  moduloConfig,
  lockKeyDe,
  precheckSyncNow,
  nombreEmpresa,
  rolesSyncNow,
  type SyncNowModulo,
} from "@/lib/switch-api/sync-now";
import type { EmpresaKey } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

// 🩸 800, NO 300 (27-jul-2026). Esta ruta corre EXACTAMENTE los mismos syncs que
// los crons, que declaran 800 s. Con 300 s, "Actualizar ahora" sobre Tommy era
// una muerte GARANTIZADA, no una carrera: el sync de `catalogo_tommy` mide
// 427-485 s (p50 485 s sobre 30 días de switch_sync_log) contra un presupuesto de
// 300 s. Vercel mataba el proceso a los 5 min, la fila 'running' del log quedaba
// abierta —un proceso muerto no ejecuta `finally`— y el candado del índice único
// quedaba puesto. Medido el 27-jul: las 3 corridas colgadas de ese día eran
// `triggered_by='manual'`; las del cron (800 s) salieron todas success.
// `sync-lock-atascado.test.ts` compara este número contra el de los crons y se
// pone rojo si vuelven a divergir.
export const maxDuration = 800; // techo del plan (Pro + Fluid), igual que los crons

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
      detalle: "Ya hay una actualización en curso (empezó hace un momento).",
    },
    { status: 409 },
  );
}

/** Corridas 'running' de la EMPRESA (cualquier sync_type), separadas en la del
 *  módulo pedido vs. cualquier otra (cron corriendo YA — sesión única Switch).
 *  La frescura (<30 min) la evalúa precheckSyncNow; acá solo se consulta. */
async function fetchRunningDeEmpresa(
  empresaKey: string,
  syncType: string,
): Promise<{ mismo: string | null; otro: string | null }> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at, sync_type")
    .eq("empresa_key", empresaKey)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) {
    // Fail-open del pre-check: el lock real (índice único) sigue protegiendo.
    console.error(`[sync-now] no pude leer running de ${empresaKey}: ${error.message}`);
    return { mismo: null, otro: null };
  }
  const rows = (data ?? []) as { started_at: string; sync_type: string }[];
  return {
    mismo: rows.find((r) => r.sync_type === syncType)?.started_at ?? null,
    otro: rows.find((r) => r.sync_type !== syncType)?.started_at ?? null,
  };
}

async function fetchLastSuccessFinishedAt(
  empresaKey: string | null,
  syncType: string | null,
  cooldownHeartbeats: readonly string[] | undefined,
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
  // Módulos sin switch_sync_log (clientes-master, refresh-vistas) → cooldown
  // por heartbeat(s) de cron_heartbeats: manda el más reciente.
  if (!cooldownHeartbeats || cooldownHeartbeats.length === 0) return null;
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .in("cron_name", cooldownHeartbeats as string[])
    .order("last_success_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[sync-now] no pude leer heartbeats ${cooldownHeartbeats.join(", ")}: ${error.message}`);
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
    case "proveedores": {
      // CxP de UNA empresa (~7s). La lib escribe su propia fila running en
      // switch_sync_log (sync_type=proveedores) → mismo lock real que los crons.
      const r = await syncEmpresaProveedores(empresa as EmpresaKey, "manual");
      if (!r.ok) return { error: r.error ?? "sync de proveedores falló" };
      return {
        resumen: `${nombreEmpresa(r.empresaKey)}: cuentas por pagar al día (${r.proveedores} proveedores)`,
      };
    }
    case "refresh-vistas": {
      // DB-only: rollup mensual + vw de clientes (paso final de la secuencia
      // de Ventas — así el tab Clientes y los meses cerrados quedan al día).
      const r = await runRefreshVistas();
      if (!r.ok) return { error: r.error };
      return { resumen: "Vistas de ventas y clientes al día" };
    }
    case "catalogo-reebok":
    case "catalogo-joybees":
    case "catalogo-tommy":
    case "catalogo-calvin": {
      const r = await (modulo === "catalogo-reebok"
        ? syncCatalogoReebok({ triggeredBy: "manual" })
        : modulo === "catalogo-joybees"
          ? syncCatalogoJoybees({ triggeredBy: "manual" })
          : modulo === "catalogo-tommy"
            ? syncCatalogoTommy({ triggeredBy: "manual" })
            : syncCatalogoCalvin({ triggeredBy: "manual" }));
      const emp = r.empresas[0];
      if (r.hadError || !emp || emp.error) {
        return { error: emp?.error ?? "sync de catálogo falló" };
      }
      // 🩸 ACÁ ESTABA EL HUECO (28-jul-2026). Este botón mete productos igual
      // que el cron, y era el ÚNICO camino que no avisaba: los 60 productos de
      // Reebok entraron por acá (`by=manual`, 17:23 UTC) y el mensaje nunca
      // salió — ni pudo salir después, porque para la corrida siguiente del
      // cron las filas ya existían y dejaban de ser "nuevas". Best-effort: si
      // el aviso falla, el sync ya terminó bien y se reporta bien.
      const aviso = await avisarNuevosSinFoto(
        modulo === "catalogo-reebok"
          ? "reebok"
          : modulo === "catalogo-joybees"
            ? "joybees"
            : modulo === "catalogo-tommy"
              ? "tommy"
              : "calvin",
      );
      const sufijoAviso = aviso.codigos.length > 0
        ? ` · avisé de ${aviso.codigos.length} sin foto`
        : "";
      return {
        resumen: `Catálogo al día: ${emp.actualizados} actualizados · ${emp.agregados} nuevos · ${emp.ocultados} ocultados${sufijoAviso}`,
      };
    }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Universo de roles con acceso a ALGÚN módulo (401/403 primero, como siempre);
  // el permiso fino por módulo se valida más abajo con rolesSyncNow.
  const auth = requireRole(req, ["admin", "secretaria", "vendedor", "contabilidad"]);
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

  // Permiso fino por módulo (vendedor: catálogos + ficha de cliente;
  // contabilidad: solo proveedores; admin siempre pasa requireRole).
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

  // ── Candado de 2 capas (running + cooldown) ────────────────────────────────
  const lock = lockKeyDe(modulo, empresa);
  if (lock) {
    // Limpia huérfanos (>30 min) para que ni el pre-check ni el índice único
    // se queden trancados con un run que murió sin finalizar.
    await clearStaleRunning(lock.empresaKey, lock.syncType);
  }
  const [running, lastSuccessFinishedAt] = await Promise.all([
    lock
      ? fetchRunningDeEmpresa(lock.empresaKey, lock.syncType)
      : Promise.resolve({ mismo: null, otro: null }),
    fetchLastSuccessFinishedAt(
      lock?.empresaKey ?? null,
      lock?.syncType ?? null,
      cfg.cooldownHeartbeats,
    ),
  ]);
  const bloqueo = precheckSyncNow({
    ahora,
    runningStartedAt: running.mismo,
    runningOtroStartedAt: running.otro,
    lastSuccessFinishedAt,
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
