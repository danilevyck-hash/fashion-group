/**
 * Cron multi-empresa Switch.
 *
 * Por defecto (sin params): sincroniza FACTURAS incrementales (ventana 7 días)
 * de todas las empresas con facturas=true (empresasConFacturas() = las 6 B2B +
 * Boston + Multifashion/american_classic). Multifashion SÍ entra acá: su data
 * alimenta switch_facturas (base del tab Multifashion desde fase 2.1b) además de
 * su tabla legacy multifashion_tickets, que su cron propio (/api/cron/
 * multifashion-sync) sigue manteniendo. Vive en ambas a propósito (invariante
 * 🟡-14: nunca sumar las dos fuentes → doble conteo).
 *
 * Query params (todos opcionales):
 *   tipo=facturas|estadocuenta   (default facturas)
 *   empresa=<empresa_key>        sincroniza solo esa empresa
 *   desde=YYYY-MM-DD&hasta=...   override de rango (manual), ambos o ninguno
 *
 * NOTA timing: estadocuenta hace una llamada por cliente (cientos/empresa). Las 6
 * empresas en una sola invocación tardan ~472s y NO caben en maxDuration=300.
 * Tampoco se pueden disparar 6 crons solapados: Switch es SESIÓN ÚNICA por
 * empresa — un 2do login a la misma empresa mata el token del 1ro (code 0006) y
 * dispara los 401 en CXC. Fix: SERIALIZAR + CONSOLIDAR. El cron de estadocuenta
 * corre en 3 entradas (?tipo=estadocuenta&empresas=a,b, CSV), cada una procesa
 * sus 2 empresas en serie dentro de una sola invocación (el for de abajo es
 * secuencial). Duraciones medidas (~85-120s/empresa, dominadas por el loop por
 * cliente; auth es por-empresa, no se comparte) → 2 empresas/run ≈ 200s, holgado
 * bajo 300s. Empresas distintas en crons distintos NO colisionan (0006 es por
 * empresa). El backfill (scripts/switch-backfill.ts) sigue para corridas masivas.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  type EmpresaSyncResult,
} from "@/lib/switch-api/sync-empresa";
import {
  empresasConFacturas,
  empresasConCxc,
  isEmpresaKey,
} from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  // tipo
  const tipo = sp.get("tipo") ?? "facturas";
  if (tipo !== "facturas" && tipo !== "estadocuenta") {
    return NextResponse.json({ ok: false, error: "tipo inválido (facturas|estadocuenta)" }, { status: 400 });
  }

  // empresa(s) (opcional). `empresas=a,b,c` (CSV) tiene precedencia sobre
  // `empresa=x` singular; ambos siguen soportados (aditivo). Las empresas se
  // procesan SERIALMENTE en el for de abajo — requisito de la sesión única por
  // empresa de Switch (logins concurrentes a la misma empresa → code 0006).
  const empresaParam = sp.get("empresa");
  const empresasParam = sp.get("empresas");
  const universe: EmpresaKey[] = tipo === "facturas" ? empresasConFacturas() : empresasConCxc();
  let empresas: EmpresaKey[];
  if (empresasParam !== null) {
    const raw = empresasParam.split(",").map(s => s.trim()).filter(Boolean);
    if (raw.length === 0) {
      return NextResponse.json({ ok: false, error: "empresas vacío" }, { status: 400 });
    }
    const invalid = raw.filter(e => !isEmpresaKey(e) || !universe.includes(e as EmpresaKey));
    if (invalid.length > 0) {
      return NextResponse.json(
        { ok: false, error: `empresa(s) inválida(s) para tipo ${tipo}: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
    empresas = [...new Set(raw)] as EmpresaKey[]; // dedupe, preserva orden
  } else if (empresaParam !== null) {
    if (!isEmpresaKey(empresaParam)) {
      return NextResponse.json({ ok: false, error: `empresa inválida: ${empresaParam}` }, { status: 400 });
    }
    if (!universe.includes(empresaParam)) {
      return NextResponse.json(
        { ok: false, error: `empresa ${empresaParam} no tiene sync de tipo ${tipo}` },
        { status: 400 },
      );
    }
    empresas = [empresaParam];
  } else {
    empresas = universe;
  }

  // rango (opcional override)
  const desdeParam = sp.get("desde");
  const hastaParam = sp.get("hasta");
  let desde: string;
  let hasta: string;
  let triggeredBy: "cron" | "manual";
  if ((desdeParam === null) !== (hastaParam === null)) {
    return NextResponse.json({ ok: false, error: "desde y hasta deben venir juntos" }, { status: 400 });
  }
  if (desdeParam !== null && hastaParam !== null) {
    if (!isValidYmd(desdeParam) || !isValidYmd(hastaParam)) {
      return NextResponse.json({ ok: false, error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
    }
    const days = daysBetween(desdeParam, hastaParam);
    if (days < 0) return NextResponse.json({ ok: false, error: "desde > hasta" }, { status: 400 });
    if (days > MAX_RANGE_DAYS) return NextResponse.json({ ok: false, error: `Rango > ${MAX_RANGE_DAYS} días` }, { status: 400 });
    desde = desdeParam;
    hasta = hastaParam;
    triggeredBy = "manual";
  } else {
    desde = panamaDate(-7);
    hasta = panamaDate(0);
    triggeredBy = "cron";
  }

  const results: EmpresaSyncResult[] = [];
  const errors: Array<{ empresaKey: string; error: string }> = [];

  for (const empresaKey of empresas) {
    try {
      const r =
        tipo === "facturas"
          ? await syncEmpresaFacturas(empresaKey, { desde, hasta, triggeredBy })
          : await syncEmpresaEstadoCuenta(empresaKey, { desde, hasta, triggeredBy });
      results.push(r);
    } catch (err: unknown) {
      errors.push({ empresaKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      tipo,
      range: { desde, hasta },
      results,
      errors,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
