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
 * 🔴 EN VIVO (26-nov-2026): sin freno de 10 min — el toque siempre lee de
 * Switch. Si la EMPRESA ya tiene una corrida viva (cron u otro toque, cualquier
 * sync_type: sesión única de Switch), se ESPERA a que termine y, si era del
 * mismo tipo y salió bien, se responde con ELLA (`esperarCorridaEnCurso`). El
 * lock REAL sigue siendo el índice único parcial switch_sync_log_running_lock.
 *
 * La ventana "cron-proximo" se ELIMINÓ (jul-2026): el clic siempre actualiza.
 * Trade-off aceptado: un manual pegado a la ventana de un cron de la MISMA
 * empresa puede matarle el token al otro (sesión única, code 0006) — el que
 * pierda falla limpio y switch-reconciliacion lo recupera (ambos fail-safe).
 *
 * Respuestas: 200 {ok, duracionMs, resumen, cantidad?} · 409 {motivo:"running"}
 * (la espera pasó de 4 min, o la raza del índice único) · 400 body inválido ·
 * 401/403 sin permiso · 500 error del sync. El 409 NO se muestra: SyncNowButton
 * vuelve a preguntar cada ~5 s y el servidor se une a la corrida.
 *
 * Ejecuta la lib correspondiente IN-PROCESS con triggeredBy:'manual' y cierra
 * las sesiones Switch abiertas al final (higiene de sesión única, igual que
 * los crons).
 */

import { leerPausaSwitch } from "@/lib/switch-api/pausa-io";
import { textoPausa } from "@/lib/switch-api/pausa";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { puedePedir } from "@/lib/catalogo/roles";
import { logActivity } from "@/lib/log-activity";
import { supabaseServer } from "@/lib/supabase-server";
import { logoutAllSwitchSessions, logoutSwitchSessions } from "@/lib/switch-api/client";
import { PEDIDOS_ACTUALIZAR_EN_PARALELO } from "@/lib/ui/velocidad-2026-11";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
} from "@/lib/switch-api/sync-empresa";
import { syncEmpresaRecibos, mesesCronRecibos } from "@/lib/switch-api/sync-recibos";
import { syncEmpresaProveedores } from "@/lib/switch-api/sync-proveedores";
import { syncEmpresaPedidos } from "@/lib/switch-api/sync-pedidos";
import { runRefreshVistas } from "@/lib/refresh-vistas";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { syncCatalogoTommy } from "@/lib/switch-api/sync-catalogo-tommy";
import { syncCatalogoCalvin } from "@/lib/switch-api/sync-catalogo-calvin";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import {
  clearStaleRunning,
  esperarCorridaEnCurso,
  isRunningLockConflict,
} from "@/lib/switch-api/sync-log";
import {
  isSyncNowModulo,
  moduloConfig,
  lockKeyDe,
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
    { motivo: "running", detalle: "Switch está actualizando esta empresa en este momento." },
    { status: 409 },
  );
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
): Promise<{ resumen: string; cantidad?: number } | { error: string }> {
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
    case "pedidos": {
      const r = await syncEmpresaPedidos(empresa as EmpresaKey, "manual");
      if (!r.ok) return { error: r.error ?? "sync de pedidos falló" };
      return {
        resumen: `${nombreEmpresa(r.empresaKey)}: ${r.pedidos} pedidos sin facturar`,
        cantidad: r.pedidos,
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
  // el permiso fino por módulo se valida más abajo con rolesSyncNow (bodega:
  // solo Pedidos — sin ella aquí, su «Actualizar» de Pedidos salía 403).
  const auth = requireRole(req, ["admin", "secretaria", "vendedor", "contabilidad", "bodega"]);
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
  // Catálogos: también quien arma pedidos (`puedePedir`: Eloyn y Cuba de bodega, 19-nov-2026).
  const pideEnCatalogo = modulo.startsWith("catalogo-") && puedePedir(auth);
  if (auth.role !== "admin" && !rolesSyncNow(modulo).includes(auth.role) && !pideEnCatalogo) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const cfg = moduloConfig(modulo);
  // 🔴 «Pausar Switch»: «Actualizar» no entra a Switch mientras dure la pausa.
  if (cfg.tocaSwitch) {
    const pausa = await leerPausaSwitch();
    if (pausa) return NextResponse.json({ error: `${textoPausa(pausa)}.`, motivo: "pausa" }, { status: 423 });
  }
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

  // Bitácora: cada clic que pasó la validación queda en activity_logs con el
  // mismo formato que las entradas al sistema (login). Nunca rompe la respuesta.
  const empresaLog = cfg.empresaFija ?? empresa;
  const empresas = empresaLog ? [empresaLog] : [];
  const registrar = (resultado: string, detalle?: string) =>
    logActivity(
      auth.role,
      "sync_now",
      "sync",
      { userName: auth.userName, modulo, empresas, resultado, ...(detalle ? { detalle } : {}) },
      auth.userName,
    ).catch(() => {});

  // ── Sesión única de Switch: esperar (o unirse a) la corrida en curso ──────
  const lock = lockKeyDe(modulo, empresa);
  if (lock) {
    // Limpia huérfanos (>30 min) para que ni la espera ni el índice único se
    // queden trancados con un run que murió sin finalizar.
    await clearStaleRunning(lock.empresaKey, lock.syncType);
    const espera = await esperarCorridaEnCurso(lock.empresaKey, lock.syncType);
    if (espera.estado === "ocupado") {
      await registrar("running");
      return respuestaLockOcupado();
    }
    if (espera.unida) {
      // La corrida que estaba en curso ES la lectura en vivo: se responde con ella.
      await registrar("ok", "unida a la corrida en curso");
      return NextResponse.json({
        ok: true,
        duracionMs: 0,
        resumen: `${nombreEmpresa(lock.empresaKey)}: al día`,
        ...(modulo === "pedidos" ? { cantidad: espera.unida.records_updated ?? 0 } : {}),
      });
    }
  }

  // ── Disparo in-process ─────────────────────────────────────────────────────
  const t0 = Date.now();
  try {
    const r = await ejecutar(modulo, empresa);
    if ("error" in r) {
      // Raza contra el lock real: otro disparo ganó el insert de 'running'.
      if (isRunningLockConflict(r.error)) {
        await registrar("running");
        return respuestaLockOcupado();
      }
      console.error(`[sync-now] ${modulo}${empresa ? `/${empresa}` : ""} falló: ${r.error}`);
      await registrar("error", r.error);
      return NextResponse.json(
        { error: "No se pudo actualizar. Intenta de nuevo en unos minutos." },
        { status: 500 },
      );
    }
    await registrar("ok", r.resumen);
    return NextResponse.json({
      ok: true,
      duracionMs: Date.now() - t0,
      resumen: r.resumen,
      ...(r.cantidad !== undefined ? { cantidad: r.cantidad } : {}),
    });
  } catch (err) {
    if (isRunningLockConflict(err)) {
      await registrar("running");
      return respuestaLockOcupado();
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-now] ${modulo}${empresa ? `/${empresa}` : ""} threw: ${msg}`);
    await registrar("error", msg);
    return NextResponse.json(
      { error: "No se pudo actualizar. Intenta de nuevo en unos minutos." },
      { status: 500 },
    );
  } finally {
    // Higiene de sesión única (igual que los crons): cerrar las sesiones de
    // Switch que este proceso abrió — un token vivo ~60 min mataría el login
    // del próximo cron de la misma empresa (code 0006). No-op si no abrió.
    // Con una empresa, se cierra SOLO la suya: las otras pueden estar
    // actualizándose a la vez en este mismo proceso (velocidad-2026-11).
    if (cfg.tocaSwitch) {
      if (PEDIDOS_ACTUALIZAR_EN_PARALELO && empresa) await logoutSwitchSessions([empresa]);
      else await logoutAllSwitchSessions();
    }
  }
}
