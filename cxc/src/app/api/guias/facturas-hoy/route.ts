// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guias/facturas-hoy — las facturas DE HOY, en segundo plano.
//
// El sync programado de facturas corre 6:50 / 10:00 / 14:00 / 18:00 Panamá,
// así que una factura de las 11:00 no está en la base hasta las 14:00. Al
// entrar al módulo Guías (y con el botón «Buscar otra vez») se dispara esta
// lectura CORTA: solo el día de HOY (Panamá), solo las 6 del grupo, por el
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
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
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

  try {
    // En SERIE, no en paralelo: 6 logins simultáneos del mismo usuario de API
    // se tumbarían el token entre sí (sesión única por usuario).
    for (const empresa of B2B_EMPRESA_KEYS) {
      try {
        if (await facturasFrescas(empresa)) {
          resultados.push({ empresa, resultado: "fresca" });
          continue;
        }
        const r = await syncEmpresaFacturas(empresa as EmpresaKey, {
          desde: hoy,
          hasta: hoy,
          triggeredBy: "manual",
        });
        resultados.push({
          empresa,
          resultado: "ok",
          escritas: (r?.inserted ?? 0) + (r?.updated ?? 0),
        });
      } catch (err) {
        // Fail-open: una empresa caída (o con un sync en curso) no frena a las
        // demás ni a la pantalla — se despacha con lo que hay en la base.
        if (isRunningLockConflict(err)) {
          resultados.push({ empresa, resultado: "en_curso" });
        } else {
          console.error(
            `[guias/facturas-hoy] ${empresa}:`,
            err instanceof Error ? err.message : String(err),
          );
          resultados.push({ empresa, resultado: "error" });
        }
      }
    }
  } finally {
    await logoutAllSwitchSessions();
  }

  return NextResponse.json({ ok: true, hoy, resultados });
}
