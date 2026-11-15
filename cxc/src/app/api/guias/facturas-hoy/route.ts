// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guias/facturas-hoy — las facturas DE HOY, en segundo plano.
//
// El sync programado de facturas corre 6:50 / 10:00 / 14:00 / 18:00 Panamá,
// así que una factura de las 11:00 no está en la base hasta las 14:00. SOLO
// el botón «Actualizar» (`LineaDeFrescura`) dispara esta lectura CORTA — desde
// el 7-oct-2026 entrar a Despachos ya no la llama (cada login a Switch saca a
// Daniel de su panel): solo el día de HOY (Panamá), solo las 6 del grupo, por el
// MISMO camino del sync de siempre (syncEmpresaFacturas + su lock de
// switch_sync_log) — no hay un cliente nuevo de Switch.
//
// 🔴 FAIL-OPEN Y SIN BLOQUEAR: si Switch no contesta en una empresa, se sigue
// con la siguiente y la pantalla muestra lo que hay en la base («hasta las
// HH:MM»). Nada de esto frena crear una guía.
//
// ⚠️ SESIÓN ÚNICA DE SWITCH (una por USUARIO): este disparo puede chocar con
// un cron de la misma empresa — el mismo trade-off que Daniel ya aceptó para
// el botón «Actualizar ahora» (sync-now, jul-2026): el que pierda falla limpio
// y la reconciliación lo recupera. Se acota con TRES frenos: la ventana es
// SOLO HOY (segundos por empresa, no minutos), el cooldown de 10 min por
// empresa (el de sync-now) hace no-op las entradas repetidas al módulo, y el
// `finally` cierra las sesiones abiertas (sin eso el token vivo ~60 min
// tumbaría el login del próximo cron — code 0006).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { B2B_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";
import { syncEmpresaFacturas } from "@/lib/switch-api/sync-empresa";
import { logoutAllSwitchSessions, logoutSwitchSessions } from "@/lib/switch-api/client";
import { FACTURAS_HOY_EN_PARALELO } from "@/lib/ui/velocidad-2026-11";
import { isRunningLockConflict } from "@/lib/switch-api/sync-log";
import { SYNC_NOW_COOLDOWN_MIN } from "@/lib/switch-api/sync-now";

export const dynamic = "force-dynamic";
// Medido: la corrida de facturas tarda 4-8 s por empresa (máx 24). Con la
// ventana de UN día es menos; 300 s deja aire sin acercarse al techo de 800.
export const maxDuration = 300;

// Los mismos roles que escriben guías (vendedor es solo lectura en el módulo).
const ROLES = ["admin", "secretaria", "bodega"];

type ResultadoEmpresa =
  | { empresa: string; resultado: "ok"; escritas: number }
  | { empresa: string; resultado: "fresca" }
  | { empresa: string; resultado: "en_curso" }
  | { empresa: string; resultado: "error" };

/** ¿Esta empresa ya sincronizó facturas hace menos del cooldown? */
async function facturasFrescas(empresaKey: string): Promise<boolean> {
  const corte = new Date(Date.now() - SYNC_NOW_COOLDOWN_MIN * 60_000).toISOString();
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("id")
    .eq("empresa_key", empresaKey)
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .gte("finished_at", corte)
    .limit(1);
  if (error) return false; // ante la duda, se refresca
  return (data ?? []).length > 0;
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ROLES);
  if (authError) return authError;

  const hoy = hoyPanama();
  const resultados: ResultadoEmpresa[] = [];

  // Una empresa: nunca lanza, devuelve su resultado.
  const una = async (empresa: string): Promise<ResultadoEmpresa> => {
    try {
      if (await facturasFrescas(empresa)) return { empresa, resultado: "fresca" };
      const r = await syncEmpresaFacturas(empresa as EmpresaKey, {
        desde: hoy,
        hasta: hoy,
        triggeredBy: "manual",
      });
      return { empresa, resultado: "ok", escritas: (r?.inserted ?? 0) + (r?.updated ?? 0) };
    } catch (err) {
      // Fail-open: una empresa caída (o con un sync en curso) no frena a las
      // demás ni a la pantalla — se despacha con lo que hay en la base.
      if (isRunningLockConflict(err)) return { empresa, resultado: "en_curso" };
      console.error(
        `[guias/facturas-hoy] ${empresa}:`,
        err instanceof Error ? err.message : String(err),
      );
      return { empresa, resultado: "error" };
    }
  };

  try {
    if (FACTURAS_HOY_EN_PARALELO) {
      // 🔴 A LA VEZ (15-nov-2026, 25 s → lo que tarde la más lenta). La sesión
      // única de Switch es por USUARIO de UNA instancia: cada empresa es su
      // propio Switch (URL y usuario propios) y `client.ts` deduplica los
      // logins POR EMPRESA. Seis empresas = seis tokens que no se tocan.
      resultados.push(...(await Promise.all(B2B_EMPRESA_KEYS.map(una))));
    } else {
      for (const empresa of B2B_EMPRESA_KEYS) resultados.push(await una(empresa));
    }
  } finally {
    // Solo las sesiones de ESTA ruta: otra que comparta el proceso (Fluid)
    // puede estar usando la suya.
    if (FACTURAS_HOY_EN_PARALELO) await logoutSwitchSessions(B2B_EMPRESA_KEYS);
    else await logoutAllSwitchSessions();
  }

  return NextResponse.json({ ok: true, hoy, resultados });
}
