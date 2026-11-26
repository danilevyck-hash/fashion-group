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
// y la reconciliación lo recupera. Se acota con DOS frenos: la ventana es
// SOLO HOY (segundos por empresa, no minutos) y el `finally` cierra las
// sesiones abiertas (sin eso el token vivo ~60 min tumbaría el login del
// próximo cron — code 0006).
//
// 🔴 EN VIVO (26-nov-2026, Daniel: «si pongo Actualizar, lo quiero en vivo»):
// se retiró el freno de 10 min — el toque SIEMPRE lee de Switch. Si la empresa
// ya tiene una corrida viva, se espera a que termine (y se une a ella si es de
// facturas) en vez de abrir otra sesión encima (`esperarCorridaEnCurso`).
// ⚠️ La lectura AUTOMÁTICA al abrir Etiquetas › Nuevo envío (`{automatico:
// true}`, 13-nov-2026) conserva su freno de 10 min por empresa: nadie tocó
// nada, y sin él cada vez que se abre la pantalla entraría a Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { hoyPanama } from "@/lib/fecha-panama";
import { B2B_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";
import { syncEmpresaFacturas } from "@/lib/switch-api/sync-empresa";
import { logoutAllSwitchSessions, logoutSwitchSessions } from "@/lib/switch-api/client";
import { FACTURAS_HOY_EN_PARALELO } from "@/lib/ui/velocidad-2026-11";
import { esperarCorridaEnCurso, isRunningLockConflict } from "@/lib/switch-api/sync-log";
import { supabaseServer } from "@/lib/supabase-server";

/** Freno SOLO de la lectura automática al abrir la pantalla (no del toque). */
const FRENO_AUTOMATICO_MIN = 10;

/** ¿Esta empresa ya leyó facturas de Switch hace menos del freno? */
async function facturasRecientes(empresaKey: string): Promise<boolean> {
  const corte = new Date(Date.now() - FRENO_AUTOMATICO_MIN * 60_000).toISOString();
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("id")
    .eq("empresa_key", empresaKey)
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .gte("finished_at", corte)
    .limit(1);
  if (error) return false; // ante la duda, se lee
  return (data ?? []).length > 0;
}

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

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ROLES);
  if (authError) return authError;

  const hoy = hoyPanama();
  const body = (await req.json().catch(() => null)) as { automatico?: unknown } | null;
  const automatico = body?.automatico === true;
  const resultados: ResultadoEmpresa[] = [];

  // Una empresa: nunca lanza, devuelve su resultado.
  const una = async (empresa: string): Promise<ResultadoEmpresa> => {
    try {
      if (automatico && (await facturasRecientes(empresa))) return { empresa, resultado: "fresca" };
      // Hasta 2 min: la ruta tiene 300 s y la lectura de HOY tarda segundos.
      const espera = await esperarCorridaEnCurso(empresa, "facturas", { maxMs: 2 * 60_000 });
      if (espera.estado === "ocupado") return { empresa, resultado: "en_curso" };
      if (espera.unida) {
        return { empresa, resultado: "ok", escritas: (espera.unida.records_inserted ?? 0) + (espera.unida.records_updated ?? 0) };
      }
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
